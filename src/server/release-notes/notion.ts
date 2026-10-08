// Notion publishing ported from legacy/app/api/release-notes/notion/route.ts.
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
  const blocks: Block[] = [];
  const imgRe = /^!\[([^\]]*)\]\(([^)]+)\)$/;

  for (const raw of md.split("\n")) {
    const t = raw.trimEnd();
    if (!t) continue;

    const imgMatch = t.match(imgRe);
    if (imgMatch) {
      blocks.push({
        type: "image",
        image: { type: "external", external: { url: imgMatch[2] } },
      });
      continue;
    }

    if (t.startsWith("#### ")) blocks.push(blk("heading_3", parseInline(t.slice(5))));
    else if (t.startsWith("### ")) blocks.push(blk("heading_3", parseInline(t.slice(4))));
    else if (t.startsWith("## ")) blocks.push(blk("heading_2", parseInline(t.slice(3))));
    else if (t.startsWith("# ")) blocks.push(blk("heading_1", parseInline(t.slice(2))));
    else if (/^\s{2,}[-*] /.test(t)) blocks.push(blk("bulleted_list_item", parseInline(t.replace(/^\s+[-*] /, ""))));
    else if (t.startsWith("- ") || t.startsWith("* ")) blocks.push(blk("bulleted_list_item", parseInline(t.slice(2))));
    else if (/^\d+\. /.test(t)) blocks.push(blk("numbered_list_item", parseInline(t.replace(/^\d+\. /, ""))));
    else if (t === "---" || t === "***" || t === "___") blocks.push({ type: "divider", divider: {} });
    else if (t.startsWith("> ")) blocks.push(blk("quote", parseInline(t.slice(2))));
    else blocks.push(blk("paragraph", parseInline(t)));
  }
  return blocks;
}


export async function notionOptions(env: NotionEnv): Promise<{ tags: string[]; projects: string[] }> {
  const data = await notionFetch(`/databases/${getDbId(env)}`);
  if (data.object === 'error') throw new Error(data.message);
  return {
    tags: data.properties?.Tags?.select?.options?.map((o: { name: string }) => o.name) ?? [],
    projects: data.properties?.Projects?.multi_select?.options?.map((o: { name: string }) => o.name) ?? [],
  };
}

export interface PublishInput {
  title: string;
  markdown: string;
  brief_description?: string;
  tag?: string;
  projects?: string[];
  released_date?: string;
  cover_url?: string;
  env: NotionEnv;
}

export async function publishReleaseNote(input: PublishInput): Promise<{ url: string; id: string; duplicate?: boolean }> {
  const { title, brief_description, tag, projects, released_date, markdown, cover_url, env } = input;
  const dbId = getDbId(env);
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
  const page = await notionFetch('/pages', 'POST', {
    parent: { database_id: dbId },
    ...(cover_url ? { cover: { type: 'external', external: { url: cover_url } } } : {}),
    properties: {
      Name: { title: [{ text: { content: title.slice(0, 2000) } }] },
      ...(brief_description
        ? { 'Brief description': { rich_text: [{ text: { content: brief_description.slice(0, 2000) } }] } }
        : {}),
      ...(tag ? { Tags: { select: { name: tag } } } : {}),
      ...(projects?.length ? { Projects: { multi_select: projects.map((p) => ({ name: p })) } } : {}),
      'Released date': { date: { start: released_date ?? new Date().toISOString().split('T')[0] } },
    },
    children: blocks.slice(0, 100),
  });
  if (page.object === 'error') throw new Error(page.message);
  for (let i = 100; i < blocks.length; i += 100) {
    await notionFetch(`/blocks/${page.id}/children`, 'PATCH', { children: blocks.slice(i, i + 100) });
  }
  return { url: page.url, id: page.id };
}
