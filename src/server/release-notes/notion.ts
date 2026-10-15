// Notion publishing ported from legacy/app/api/release-notes/notion/route.ts.
import { downloadJiraAttachment, isJiraUrl } from './jira';
const NOTION_VER = '2022-06-28';

export const NOTION_ENVS = ['test', 'prod'] as const;
export type NotionEnv = (typeof NOTION_ENVS)[number];

// NOTION_DATABASE_ID points to "Overall Achievements [ TEST ]". Prod needs its own var on purpose.
function getDbId(env: NotionEnv): string {
  const id =
    env === 'prod'
      ? process.env['NOTION_DATABASE_ID_PROD']
      : process.env['NOTION_DATABASE_ID_TEST'] || process.env['NOTION_DATABASE_ID'];
  if (!id) throw new Error(`Notion ${env} database is not configured`);
  return id;
}

async function notionFetch(path: string, method = 'GET', body?: unknown): Promise<any> {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env['NOTION_API_KEY']}`,
      'Notion-Version': NOTION_VER,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return res.json();
}

/* ─── Markdown → Notion blocks ──────────────────── */
type RT = {
  type: "text";
  text: { content: string };
  annotations?: Partial<{ bold: boolean; italic: boolean; code: boolean; strikethrough: boolean }>;
};
type Block = Record<string, unknown>;

function parseInline(text: string): RT[] {
  const tokens: RT[] = [];
  const re = /(\*\*(.+?)\*\*|\*([^*\n]+)\*|_([^_\n]+)_|`([^`\n]+)`|~~([^~\n]+)~~|\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) tokens.push({ type: "text", text: { content: text.slice(last, m.index) } });
    if (m[2]) tokens.push({ type: "text", text: { content: m[2] }, annotations: { bold: true } });
    else if (m[3]) tokens.push({ type: "text", text: { content: m[3] }, annotations: { italic: true } });
    else if (m[4]) tokens.push({ type: "text", text: { content: m[4] }, annotations: { italic: true } });
    else if (m[5]) tokens.push({ type: "text", text: { content: m[5] }, annotations: { code: true } });
    else if (m[6]) tokens.push({ type: "text", text: { content: m[6] }, annotations: { strikethrough: true } });
    else if (m[7] && m[8]) {
      tokens.push({ type: "text", text: { content: m[7], link: { url: m[8] } } } as unknown as RT);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) tokens.push({ type: "text", text: { content: text.slice(last) } });
  return tokens.length ? tokens : [{ type: "text", text: { content: text } }];
}

function blk(type: string, rt: RT[]): Block {
  return { type, [type]: { rich_text: rt } };
}

function markdownToBlocks(md: string): Block[] {
  const root: Block[] = [];
  let blocks = root;
  const imgRe = /^!\[([^\]]*)\]\(([^)]+)\)$/;
  // "<details><summary>Area</summary>" … "</details>" = collapsible heading with the lines in between inside.
  const toggleRe = /^<details>\s*<summary>(.+)<\/summary>$/;

  for (const raw of md.split("\n")) {
    const t = raw.trim();
    if (!t) continue;

    const toggleMatch = t.match(toggleRe);
    if (toggleMatch && blocks === root) {
      const children: Block[] = [];
      root.push({ type: "heading_3", heading_3: { rich_text: parseInline(toggleMatch[1]), is_toggleable: true, children } });
      blocks = children;
      continue;
    }
    if (t === "</details>") {
      blocks = root;
      continue;
    }

    const imgMatch = t.match(imgRe);
    if (imgMatch) {
      blocks.push({
        type: "image",
        image: { type: "external", external: { url: imgMatch[2] } },
      });
      continue;
    }

    // House style: "💬 text" lines become Notion callouts (announcement, caveats, support contact).
    if (t.startsWith("💬")) {
      blocks.push({
        type: "callout",
        callout: { rich_text: parseInline(t.replace(/^💬\s*/, "")), icon: { type: "emoji", emoji: "💬" } },
      });
      continue;
    }

    if (t.startsWith("#### ")) blocks.push(blk("heading_3", parseInline(t.slice(5))));
    else if (t.startsWith("### ")) blocks.push(blk("heading_3", parseInline(t.slice(4))));
    else if (t.startsWith("## ")) blocks.push(blk("heading_2", parseInline(t.slice(3))));
    else if (t.startsWith("# ")) blocks.push(blk("heading_1", parseInline(t.slice(2))));
    else if (t.startsWith("- ") || t.startsWith("* ")) blocks.push(blk("bulleted_list_item", parseInline(t.slice(2))));
    else if (/^\d+\. /.test(t)) blocks.push(blk("numbered_list_item", parseInline(t.replace(/^\d+\. /, ""))));
    else if (t === "---" || t === "***" || t === "___") blocks.push({ type: "divider", divider: {} });
    else if (t.startsWith("> ")) blocks.push(blk("quote", parseInline(t.slice(2))));
    else blocks.push(blk("paragraph", parseInline(t)));
  }
  return root;
}

/** Every block of the page, including the ones inside collapsible headings. */
function allBlocks(blocks: Block[]): Block[] {
  return blocks.flatMap((b) => {
    const children = (b[b['type'] as string] as { children?: Block[] } | undefined)?.children;
    return children ? [b, ...allBlocks(children)] : [b];
  });
}


export async function notionOptions(
  env: NotionEnv,
): Promise<{ tags: string[]; projects: string[]; people_fields: string[]; people: string[] }> {
  const data = await notionFetch(`/databases/${getDbId(env)}`);
  if (data.object === 'error') throw new Error(data.message);
  return {
    tags: data.properties?.Tags?.select?.options?.map((o: { name: string }) => o.name) ?? [],
    projects: data.properties?.Projects?.multi_select?.options?.map((o: { name: string }) => o.name) ?? [],
    people_fields: PEOPLE_FIELDS.filter((f) => data.properties?.[f]?.type === 'people'),
    people: [...(await peopleDirectory()).keys()].map((k) => peopleNames.get(k) ?? k).sort(),
  };
}

/* ─── People (Developers / Contributors) ─────────── */
// "Created by" is set by Notion to the integration and cannot be changed; these people fields can.
export const PEOPLE_FIELDS = ['Developers', 'Contributors'] as const;
export type PeopleField = (typeof PEOPLE_FIELDS)[number];

const norm = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const peopleNames = new Map<string, string>();
let peopleCache: { at: number; ids: Map<string, string> } | null = null;

/**
 * Name → Notion user id of everyone already tagged in the release notes (the integration cannot list
 * all workspace users). Built from every people field and author of both databases, cached 10 minutes.
 */
async function peopleDirectory(): Promise<Map<string, string>> {
  if (peopleCache && Date.now() - peopleCache.at < 10 * 60_000) return peopleCache.ids;
  const ids = new Map<string, string>();
  const add = (u: { id?: string; name?: string; object?: string; type?: string } | undefined) => {
    if (!u?.id || !u.name || u.type === 'bot') return;
    ids.set(norm(u.name), u.id);
    peopleNames.set(norm(u.name), u.name.trim());
  };
  const users = await notionFetch('/users?page_size=100');
  for (const u of users.results ?? []) add(u);
  for (const env of NOTION_ENVS) {
    let dbId: string;
    try {
      dbId = getDbId(env);
    } catch {
      continue;
    }
    let cursor: string | undefined;
    let pages = 0;
    do {
      const res = await notionFetch(`/databases/${dbId}/query`, 'POST', {
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      });
      if (res.object === 'error') break;
      for (const page of res.results ?? []) {
        for (const prop of Object.values(page.properties ?? {}) as Array<Record<string, any>>) {
          if (prop['type'] === 'people') prop['people'].forEach(add);
          if (prop['type'] === 'created_by') add(prop['created_by']);
        }
      }
      cursor = res.has_more ? res.next_cursor : undefined;
      pages++;
    } while (cursor && pages < 10);
  }
  peopleCache = { at: Date.now(), ids };
  return ids;
}

/** Turns names ("Yecksin Zuñiga", "yecksin") into Notion people; fails with suggestions if unknown. */
async function resolvePeople(names: string[]): Promise<Array<{ id: string }>> {
  const ids = await peopleDirectory();
  return names.map((name) => {
    const key = norm(name);
    const exact = ids.get(key);
    if (exact) return { id: exact };
    const partial = [...ids.keys()].filter((k) => k.split(/\s+/).some((w) => w === key) || k.startsWith(key));
    if (partial.length === 1) return { id: ids.get(partial[0])! };
    const hint = (partial.length ? partial : [...ids.keys()]).map((k) => peopleNames.get(k)).join(', ');
    throw new Error(`Person "${name}" is ${partial.length ? 'ambiguous' : 'unknown'}. Known people: ${hint}`);
  });
}

/** People properties for the fields this database has (TEST has no Contributors). */
async function peopleProperties(dbProps: Record<string, { type: string }>, people: Partial<Record<PeopleField, string[]>>) {
  const out: Record<string, unknown> = {};
  for (const field of PEOPLE_FIELDS) {
    const names = people[field];
    if (!names) continue;
    if (dbProps[field]?.type !== 'people') throw new Error(`This database has no "${field}" field`);
    out[field] = { people: await resolvePeople(names) };
  }
  return out;
}

async function dbProperties(env: NotionEnv): Promise<Record<string, { type: string }>> {
  const db = await notionFetch(`/databases/${getDbId(env)}`);
  if (db.object === 'error') throw new Error(db.message);
  return db.properties ?? {};
}

const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // Notion single-part upload limit
const UPLOAD_BATCH = 4;

/**
 * Downloads an image (Jira attachments with the server's Jira auth) and uploads it to
 * Notion, so the page hosts its own copy instead of linking to a URL that needs auth.
 */
export const NOTION_UPLOAD_REF = 'notion-upload:';

/** Uploads raw image bytes to Notion and returns the file upload id (attach within 1 hour). */
export async function uploadBytesToNotion(bytes: ArrayBuffer, contentType: string): Promise<string> {
  if (!contentType.startsWith('image/')) throw new Error(`Not an image (${contentType})`);
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error('Image larger than 20 MB');
  const ext = contentType.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
  const filename = `image.${ext}`;
  const created = await notionFetch('/file_uploads', 'POST', { filename, content_type: contentType });
  if (created.object === 'error') throw new Error(`Notion upload: ${created.message}`);

  const form = new FormData();
  form.append('file', new Blob([bytes], { type: contentType }), filename);
  const sent = await fetch(`https://api.notion.com/v1/file_uploads/${created.id}/send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env['NOTION_API_KEY']}`, 'Notion-Version': NOTION_VER },
    body: form,
  });
  const sentJson = await sent.json();
  if (sentJson.object === 'error' || sentJson.status !== 'uploaded') {
    throw new Error(`Notion upload send: ${sentJson.message ?? sentJson.status}`);
  }
  return created.id as string;
}

async function uploadImageToNotion(url: string): Promise<string> {
  // Server-side fetch: only public https hosts (no IPs/localhost → no internal AWS endpoints).
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || /^[\d.]+$|^\[|^localhost$/i.test(parsed.hostname)) {
    throw new Error(`Image URL must be a public https URL: ${url}`);
  }
  const res = isJiraUrl(url) ? await downloadJiraAttachment(url) : await fetch(url);
  if (!res.ok) throw new Error(`Image download failed (${res.status}): ${url}`);
  const contentType = (res.headers.get('content-type') ?? 'image/png').split(';')[0];
  return uploadBytesToNotion(await res.arrayBuffer(), contentType);
}

/** Replaces every external image block by a Notion-hosted upload (fails before creating the page). */
async function hostImagesInNotion(blocks: Block[]): Promise<number> {
  const images = allBlocks(blocks).filter((b) => b['type'] === 'image') as Array<Record<string, any>>;
  for (let i = 0; i < images.length; i += UPLOAD_BATCH) {
    await Promise.all(
      images.slice(i, i + UPLOAD_BATCH).map(async (b) => {
        const url: string = b['image'].external.url;
        // Screenshots sent by the client through the upload URL are already in Notion.
        const id = url.startsWith(NOTION_UPLOAD_REF) ? url.slice(NOTION_UPLOAD_REF.length) : await uploadImageToNotion(url);
        b['image'] = { type: 'file_upload', file_upload: { id } };
      }),
    );
  }
  return images.length;
}

export interface PublishInput {
  title: string;
  markdown: string;
  brief_description?: string;
  tag?: string;
  projects?: string[];
  released_date?: string;
  cover_url?: string;
  developers?: string[];
  contributors?: string[];
  env: NotionEnv;
}

/** Page cover: an image sent through the upload URL is already in Notion; any other URL stays external. */
function toCover(url: string): Record<string, unknown> {
  return url.startsWith(NOTION_UPLOAD_REF)
    ? { type: 'file_upload', file_upload: { id: url.slice(NOTION_UPLOAD_REF.length) } }
    : { type: 'external', external: { url } };
}

export async function publishReleaseNote(input: PublishInput): Promise<{ url: string; id: string; duplicate?: boolean; images?: number }> {
  const { title, brief_description, tag, projects, released_date, markdown, cover_url, env } = input;
  const dbId = getDbId(env);
  // Resolve people before anything is written, so an unknown name never leaves a half-made page.
  const people =
    input.developers || input.contributors
      ? await peopleProperties(await dbProperties(env), { Developers: input.developers, Contributors: input.contributors })
      : {};
  // A retried publish (client timeout, double call) returns the page created moments ago.
  const recent = await notionFetch(`/databases/${dbId}/query`, 'POST', {
    page_size: 1,
    filter: {
      and: [
        { property: 'Name', title: { equals: title.slice(0, 2000) } },
        { timestamp: 'created_time', created_time: { after: new Date(Date.now() - 10 * 60_000).toISOString() } },
      ],
    },
  });
  if (recent.object === 'error') throw new Error(recent.message);
  if (recent.results?.length) return { url: recent.results[0].url, id: recent.results[0].id, duplicate: true };

  const blocks = markdownToBlocks(markdown);
  const imageCount = await hostImagesInNotion(blocks);
  const page = await notionFetch('/pages', 'POST', {
    parent: { database_id: dbId },
    ...(cover_url ? { cover: toCover(cover_url) } : {}),
    properties: {
      Name: { title: [{ text: { content: title.slice(0, 2000) } }] },
      ...(brief_description
        ? { 'Brief description': { rich_text: [{ text: { content: brief_description.slice(0, 2000) } }] } }
        : {}),
      ...(tag ? { Tags: { select: { name: tag } } } : {}),
      ...(projects?.length ? { Projects: { multi_select: projects.map((p) => ({ name: p })) } } : {}),
      'Released date': { date: { start: released_date ?? new Date().toISOString().split('T')[0] } },
      ...people,
    },
    children: blocks.slice(0, 100),
  });
  if (page.object === 'error') throw new Error(page.message);
  for (let i = 100; i < blocks.length; i += 100) {
    await notionFetch(`/blocks/${page.id}/children`, 'PATCH', { children: blocks.slice(i, i + 100) });
  }
  return { url: page.url, id: page.id, images: imageCount };
}

/** Accepts a Notion page URL or id and returns the id with dashes. */
export function toPageId(pageUrlOrId: string): string {
  const hex = pageUrlOrId.split('?')[0].replace(/-/g, '').match(/[0-9a-f]{32}$/i)?.[0];
  if (!hex) throw new Error(`Not a Notion page URL or id: ${pageUrlOrId}`);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface UpdateInput extends Partial<Omit<PublishInput, 'env'>> {
  page: string;
  env: NotionEnv;
}

/**
 * Edits a release note already published by this tool. Only pages of the release notes database of
 * that environment can be edited. A new markdown replaces the whole body; images are hosted first,
 * so a failed upload leaves the page untouched.
 */
export async function updateReleaseNote(input: UpdateInput): Promise<{ url: string; id: string; images?: number }> {
  const { page, env, title, brief_description, tag, projects, released_date, markdown, cover_url } = input;
  const id = toPageId(page);
  const current = await notionFetch(`/pages/${id}`);
  if (current.object === 'error') throw new Error(current.message);
  const dbId = getDbId(env).replace(/-/g, '');
  if (current.parent?.database_id?.replace(/-/g, '') !== dbId) {
    throw new Error(`That page is not a release note of the ${env} database`);
  }

  const blocks = markdown ? markdownToBlocks(markdown) : null;
  const imageCount = blocks ? await hostImagesInNotion(blocks) : undefined;

  const properties: Record<string, unknown> = {
    ...(title ? { Name: { title: [{ text: { content: title.slice(0, 2000) } }] } } : {}),
    ...(brief_description !== undefined
      ? { 'Brief description': { rich_text: [{ text: { content: brief_description.slice(0, 2000) } }] } }
      : {}),
    ...(tag ? { Tags: { select: { name: tag } } } : {}),
    ...(projects ? { Projects: { multi_select: projects.map((p) => ({ name: p })) } } : {}),
    ...(released_date ? { 'Released date': { date: { start: released_date } } } : {}),
    ...(input.developers || input.contributors
      ? await peopleProperties(await dbProperties(env), { Developers: input.developers, Contributors: input.contributors })
      : {}),
  };
  if (Object.keys(properties).length || cover_url) {
    const updated = await notionFetch(`/pages/${id}`, 'PATCH', {
      ...(Object.keys(properties).length ? { properties } : {}),
      ...(cover_url ? { cover: toCover(cover_url) } : {}),
    });
    if (updated.object === 'error') throw new Error(updated.message);
  }

  if (blocks) {
    const oldIds: string[] = [];
    let cursor: string | undefined;
    do {
      const list = await notionFetch(`/blocks/${id}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`);
      if (list.object === 'error') throw new Error(list.message);
      oldIds.push(...list.results.map((b: { id: string }) => b.id));
      cursor = list.has_more ? list.next_cursor : undefined;
    } while (cursor);
    for (let i = 0; i < blocks.length; i += 100) {
      const added = await notionFetch(`/blocks/${id}/children`, 'PATCH', { children: blocks.slice(i, i + 100) });
      if (added.object === 'error') throw new Error(added.message);
    }
    // Old body goes only after the new one is in, so an error never leaves the page empty.
    for (const oldId of oldIds) await notionFetch(`/blocks/${oldId}`, 'DELETE');
  }
  return { url: current.url, id, images: imageCount };
}
