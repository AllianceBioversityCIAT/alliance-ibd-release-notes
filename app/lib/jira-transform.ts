/**
 * Pure transform functions for Jira data.
 * Shared between server (API routes) and client (rehydration from localStorage).
 * NO I/O, NO env vars — only data in → data out.
 */

/* ── Raw types (what the API fetches from Jira) ── */

export interface RawAttachment {
  filename: string;
  content: string;
  mimeType: string;
  thumbnail?: string;
}

export interface RawComment {
  body: string;
  author: string;
}

export interface RawIssueNode {
  key: string;
  summary: string;
  type: string;
  status: string;
  assignee: string;
  reporter: string;
  description: string;          // raw wiki markup
  attachments: RawAttachment[];
  comments: RawComment[];
  children: RawIssueNode[];
}

/* ── Transformed types ── */

export interface JiraChild {
  key: string;
  summary: string;
  type: string;
  status: string;
  description: string;
  children: JiraChild[];
}

interface IssueNode {
  key: string;
  summary: string;
  type: string;
  status: string;
  assignee: string;
  reporter: string;
  description: string;
  comments: string[];
  children: IssueNode[];
}

/* ═════════════════════════════════════════════
   TRANSFORM — wiki markup → markdown
   ═════════════════════════════════════════════ */

type AttachmentMap = Map<string, string>;

function buildAttachmentMap(raw: RawIssueNode): AttachmentMap {
  const map: AttachmentMap = new Map();
  function walk(node: RawIssueNode) {
    for (const a of node.attachments) {
      map.set(a.filename, a.content);
      if (a.thumbnail) map.set(`thumb:${a.filename}`, a.thumbnail);
    }
    node.children.forEach(walk);
  }
  walk(raw);
  return map;
}

export function parseWikiMarkup(text: string): string {
  if (!text) return "";

  let result = text
    .replace(/\{code(?::[^}]*)?\}([\s\S]*?)\{code\}/gi, "\n```\n$1\n```\n")
    .replace(/\{quote\}([\s\S]*?)\{quote\}/gi, (_, c: string) =>
      c.trim().split("\n").map((l) => `> ${l}`).join("\n")
    )
    .replace(/\{panel(?::[^}]*)?\}([\s\S]*?)\{panel\}/gi, "\n$1\n")
    .replace(/^h[1-6]\.\s+/gm, "")
    .replace(/^\*{2,}\s*/gm, "  - ")
    .replace(/^\*\s+/gm, "- ")
    .replace(/^#[*#]+\s*/gm, "  - ")
    .replace(/^#\s+/gm, "1. ")
    .replace(/\+([^+\n]+)\+/g, "$1")
    .replace(/\{\{([^}]+)\}\}/g, "`$1`")
    .replace(/\*([^*\n]+)\*/g, "**$1**");

  // Inline images → strip (Jira auth blocks direct viewing)
  result = result.replace(/!([^!\n|]+?)(?:\|[^!]*)?\s*!/g, "");

  // smart-embed → link + inline Figma iframe
  result = result.replace(
    /\[([^\]|]+)\|([^\]|]+)\|smart-embed\]/g,
    (_, label: string, url: string) => {
      if (/figma\.com/.test(url)) {
        return `[${label.trim()}](${url.trim()})\n\n[figma-embed](${url.trim()})`;
      }
      return `[${label.trim()}](${url.trim()})`;
    }
  );

  // smart-link → just a link, no embed
  result = result.replace(
    /\[([^\]|]+)\|([^\]|]+)\|smart-link\]/g,
    (_, label: string, url: string) => `[${label.trim()}](${url.trim()})`
  );

  result = result
    .replace(/\[([^\]|]+)\|([^\]]+)\]/g, "[$1]($2)")
    .replace(/\[([^\]]+)\](?!\()/g, "$1")
    .replace(/~accountid:[a-f0-9:-]+/g, "")
    .replace(/\{[a-zA-Z][^}]*\}/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return result;
}

/* ── Transform raw tree → parsed tree ── */

function transformTree(raw: RawIssueNode, _attachments: AttachmentMap): IssueNode {
  return {
    key: raw.key,
    summary: raw.summary,
    type: raw.type,
    status: raw.status,
    assignee: raw.assignee,
    reporter: raw.reporter,
    description: parseWikiMarkup(raw.description),
    comments: raw.comments.map((c) =>
      `[${c.author}]: ${parseWikiMarkup(c.body)}`
    ),
    children: raw.children.map((child) => transformTree(child, _attachments)),
  };
}

/* ── Render tree → text ── */

function renderNode(node: IssueNode, depth: number): string {
  const pad = "  ".repeat(depth);
  const header =
    depth === 0
      ? `**${node.summary}** (${node.type} | ${node.status})`
      : `${pad}[${node.key}] ${node.summary} (${node.type} | ${node.status}) — Assignee: ${node.assignee} | Reporter: ${node.reporter}`;

  const parts: string[] = [header];

  if (node.description) {
    const descLines = node.description.split("\n").map((l) => `${pad}${l}`);
    parts.push("", ...descLines);
  }

  if (node.comments.length > 0) {
    parts.push(`\n${pad}Comments:`);
    node.comments.forEach((c) => parts.push(`${pad}  - ${c}`));
  }

  if (node.children.length > 0) {
    parts.push(`\n${pad}Sub-items (${node.children.length}):`);
    node.children.forEach((child) =>
      parts.push(renderNode(child, depth + 1))
    );
  }

  return parts.join("\n");
}

function nodeToChild(node: IssueNode): JiraChild {
  return {
    key: node.key,
    summary: node.summary,
    type: node.type,
    status: node.status,
    description: node.description,
    children: node.children.map(nodeToChild),
  };
}

/* ═════════════════════════════════════════════
   PUBLIC: raw → markdown (used by server AND client)
   ═════════════════════════════════════════════ */

export function transformRawToContext(
  raw: RawIssueNode,
  jiraBaseUrl: string,
): {
  jira_context: string;
  reporter: string;
  children: JiraChild[];
} {
  const attachments = buildAttachmentMap(raw);
  const root = transformTree(raw, attachments);

  const text =
    `## Jira Context\n` +
    `Ticket: ${root.key} — ${root.summary}\n` +
    `URL: ${jiraBaseUrl}/browse/${root.key}\n` +
    `Type: ${root.type} | Status: ${root.status}\n` +
    `Assignee: ${root.assignee} | Reporter: ${root.reporter}\n\n` +
    renderNode(root, 0);

  return {
    jira_context: text,
    reporter: root.reporter,
    children: root.children.map(nodeToChild),
  };
}

/** Transform a single raw child node to its display markdown */
export function transformRawChild(raw: RawIssueNode): JiraChild {
  const attachments = buildAttachmentMap(raw);
  const node = transformTree(raw, attachments);
  return nodeToChild(node);
}
