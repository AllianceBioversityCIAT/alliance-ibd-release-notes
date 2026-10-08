import { NextRequest, NextResponse } from "next/server";

const NOTION_VER = "2022-06-28";

type NotionEnv = "test" | "prod";

function auth() {
  return `Bearer ${process.env.NOTION_API_KEY}`;
}

function getDbId(env: NotionEnv = "test"): string | undefined {
  return env === "prod"
    ? process.env.NOTION_DATABASE_ID_PROD
    : process.env.NOTION_DATABASE_ID_TEST;
}

async function notionFetch(path: string, method = "GET", body?: unknown) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: {
      Authorization: auth(),
      "Notion-Version": NOTION_VER,
      "Content-Type": "application/json",
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

/* ─── GET — return available Tags & Projects ─────── */
export async function GET(req: NextRequest) {
  const env = (req.nextUrl.searchParams.get("env") as NotionEnv) || "test";
  const dbId = getDbId(env);
  if (!dbId) return NextResponse.json({ error: `NOTION_DATABASE_ID_${env.toUpperCase()} not set` }, { status: 500 });

  const data = await notionFetch(`/databases/${dbId}`);
  const tags: string[] = data.properties?.Tags?.select?.options?.map((o: { name: string }) => o.name) ?? [];
  const projects: string[] = data.properties?.Projects?.multi_select?.options?.map((o: { name: string }) => o.name) ?? [];
  return NextResponse.json({ tags, projects });
}

/* ─── POST — publish release note ───────────────── */
export async function POST(req: NextRequest) {
  try {
    const { title, brief_description, tag, projects, released_date, markdown, cover_url, notion_env } =
      (await req.json()) as {
        title: string;
        brief_description?: string;
        tag?: string;
        projects?: string[];
        released_date?: string;
        markdown: string;
        cover_url?: string;
        notion_env?: NotionEnv;
      };

    const dbId = getDbId(notion_env || "test");
    if (!dbId) return NextResponse.json({ error: `NOTION_DATABASE_ID_${(notion_env || "test").toUpperCase()} not set` }, { status: 500 });

    const blocks = markdownToBlocks(markdown);

    const pageBody: Record<string, unknown> = {
      parent: { database_id: dbId },
      ...(cover_url ? { cover: { type: "external", external: { url: cover_url } } } : {}),
      properties: {
        Name: { title: [{ text: { content: title.slice(0, 2000) } }] },
        ...(brief_description
          ? { "Brief description": { rich_text: [{ text: { content: brief_description.slice(0, 2000) } }] } }
          : {}),
        ...(tag ? { Tags: { select: { name: tag } } } : {}),
        ...(projects?.length
          ? { Projects: { multi_select: projects.map((p) => ({ name: p })) } }
          : {}),
        "Released date": {
          date: { start: released_date ?? new Date().toISOString().split("T")[0] },
        },
      },
      children: blocks.slice(0, 100),
    };

    const page = await notionFetch("/pages", "POST", pageBody);

    if (page.object === "error") {
      return NextResponse.json({ error: page.message }, { status: 400 });
    }

    for (let i = 100; i < blocks.length; i += 100) {
      await notionFetch(`/blocks/${page.id}/children`, "PATCH", {
        children: blocks.slice(i, i + 100),
      });
    }

    return NextResponse.json({ url: page.url, id: page.id });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
