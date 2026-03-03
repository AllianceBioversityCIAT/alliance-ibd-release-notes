// Shared Jira helpers used by /jira and /generate routes

const MAX_ISSUES = 20;
const MAX_DEPTH = 3;
const MAX_COMMENTS = 5;

type JiraField = Record<string, unknown>;

/* ─────────────────────────────────────────────
   Jira Wiki Markup → readable plain text
   ───────────────────────────────────────────── */
function parseWikiMarkup(text: string): string {
  if (!text) return "";
  return (
    text
      // Code blocks (preserve content, strip macro tags)
      .replace(/\{code(?::[^}]*)?\}([\s\S]*?)\{code\}/gi, "\n```\n$1\n```\n")
      // Quote blocks → block-quote lines
      .replace(/\{quote\}([\s\S]*?)\{quote\}/gi, (_, c: string) =>
        c
          .trim()
          .split("\n")
          .map((l) => `> ${l}`)
          .join("\n")
      )
      // Panel macros → just content
      .replace(/\{panel(?::[^}]*)?\}([\s\S]*?)\{panel\}/gi, "\n$1\n")
      // Headings at line start → strip marker, keep text
      .replace(/^h[1-6]\.\s+/gm, "")
      // Nested bullets ** → indented
      .replace(/^\*{2,}\s*/gm, "  - ")
      // Top-level bullets * at line start
      .replace(/^\*\s+/gm, "- ")
      // Nested ordered-unordered: #**, #*, ## (must come before plain #)
      .replace(/^#[*#]+\s*/gm, "  - ")
      // Ordered list # at line start
      .replace(/^#\s+/gm, "1. ")
      // Underline +text+
      .replace(/\+([^+\n]+)\+/g, "$1")
      // Inline code {{...}}
      .replace(/\{\{([^}]+)\}\}/g, "`$1`")
      // Bold *text* — list items already replaced above so remaining * are bold
      .replace(/\*([^*\n]+)\*/g, "**$1**")
      // Smart-links / embeds [label|url|smart-link] → label only
      .replace(/\[([^\]|]+)\|[^\]|]+\|[^\]]+\]/g, "$1")
      // Regular links [label|url] → label
      .replace(/\[([^\]|]+)\|[^\]]+\]/g, "$1")
      // Bare link or anchor [url] → strip
      .replace(/\[[^\]]+\]/g, "")
      // Remaining macro tags {tag} → strip
      .replace(/\{[a-zA-Z][^}]*\}/g, "")
      // Collapse excessive blank lines
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/* ─────────────────────────────────────────────
   Auth helper
   ───────────────────────────────────────────── */
function makeAuth(): string {
  return Buffer.from(
    `${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`
  ).toString("base64");
}

/* ─────────────────────────────────────────────
   Fetch a single Jira issue (raw)
   ───────────────────────────────────────────── */
export async function fetchJiraIssue(
  issueKey: string
): Promise<Record<string, unknown>> {
  const res = await fetch(
    `${process.env.JIRA_BASE_URL}/rest/api/2/issue/${issueKey}`,
    {
      headers: {
        Authorization: `Basic ${makeAuth()}`,
        Accept: "application/json",
      },
    }
  );
  if (!res.ok) throw new Error(`Jira responded with ${res.status} for ${issueKey}`);
  return res.json();
}

/* ─────────────────────────────────────────────
   Fetch comments for an issue
   ───────────────────────────────────────────── */
async function fetchComments(issueKey: string): Promise<string[]> {
  try {
    const res = await fetch(
      `${process.env.JIRA_BASE_URL}/rest/api/2/issue/${issueKey}/comment?maxResults=50`,
      {
        headers: {
          Authorization: `Basic ${makeAuth()}`,
          Accept: "application/json",
        },
      }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      comments?: Array<{ body: string; author?: { displayName?: string } }>;
    };
    return (data.comments ?? [])
      .filter((c) => c.body?.trim())
      .slice(-MAX_COMMENTS)
      .map((c) => {
        const author = c.author?.displayName ?? "Unknown";
        return `[${author}]: ${parseWikiMarkup(c.body)}`;
      });
  } catch {
    return [];
  }
}

/* ─────────────────────────────────────────────
   Recursive issue tree
   ───────────────────────────────────────────── */
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

async function collectTree(
  key: string,
  visited: Set<string>,
  depth: number
): Promise<IssueNode | null> {
  // ── Safeguards ──────────────────────────────
  if (visited.has(key)) return null;
  if (visited.size >= MAX_ISSUES) return null;
  if (depth > MAX_DEPTH) return null;

  visited.add(key);

  // Fetch issue + comments in parallel
  let issue: Record<string, unknown>;
  let comments: string[];
  try {
    [issue, comments] = await Promise.all([
      fetchJiraIssue(key),
      fetchComments(key),
    ]);
  } catch {
    visited.delete(key); // allow retry if caller wants
    return null;
  }

  const f = issue.fields as JiraField;
  const issueType = (f.issuetype as JiraField)?.name as string ?? "Unknown";

  // ── Collect subtask keys from the `subtasks` field ──
  const subtaskKeys: string[] = (f.subtasks as JiraField[])
    ?.map((s) => s.key as string)
    .filter(Boolean) ?? [];

  // ── For Epics: also query child stories via JQL ──
  if (issueType === "Epic" && visited.size < MAX_ISSUES) {
    try {
      const jql = encodeURIComponent(`parent = ${key}`);
      const searchRes = await fetch(
        `${process.env.JIRA_BASE_URL}/rest/api/2/search?jql=${jql}&maxResults=20&fields=summary,issuetype,status`,
        {
          headers: {
            Authorization: `Basic ${makeAuth()}`,
            Accept: "application/json",
          },
        }
      );
      if (searchRes.ok) {
        const data = (await searchRes.json()) as {
          issues?: Array<{ key: string }>;
        };
        for (const child of data.issues ?? []) {
          if (!subtaskKeys.includes(child.key)) {
            subtaskKeys.push(child.key);
          }
        }
      }
    } catch {
      // best-effort
    }
  }

  // ── Recurse into children sequentially ──────
  const children: IssueNode[] = [];
  for (const childKey of subtaskKeys) {
    if (visited.size >= MAX_ISSUES) break;
    const child = await collectTree(childKey, visited, depth + 1);
    if (child) children.push(child);
  }

  return {
    key,
    summary: f.summary as string ?? "",
    type: issueType,
    status: (f.status as JiraField)?.name as string ?? "Unknown",
    assignee:
      ((f.assignee as JiraField)?.displayName as string) ?? "Unassigned",
    reporter:
      ((f.reporter as JiraField)?.displayName as string) ??
      ((f.creator as JiraField)?.displayName as string) ??
      "Unknown",
    description: parseWikiMarkup((f.description as string) ?? ""),
    comments,
    children,
  };
}

/* ─────────────────────────────────────────────
   Render tree to text
   ───────────────────────────────────────────── */
function renderNode(node: IssueNode, depth: number): string {
  const pad = "  ".repeat(depth);
  const header =
    depth === 0
      ? `**${node.summary}** (${node.type} | ${node.status})`
      : `${pad}[${node.key}] ${node.summary} (${node.type} | ${node.status}) — Assignee: ${node.assignee} | Reporter: ${node.reporter}`;

  const parts: string[] = [header];

  if (node.description) {
    const descLines = node.description.split("\n").map((l) => `${pad}${l}`);
    // blank line before description for readability
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

/* ─────────────────────────────────────────────
   Public: build full context (used by /jira and /generate)
   ───────────────────────────────────────────── */
export async function buildJiraContext(rootKey: string): Promise<{
  jira_context: string;
  reporter: string;
}> {
  const visited = new Set<string>();
  const root = await collectTree(rootKey, visited, 0);

  if (!root) throw new Error(`Failed to fetch Jira issue ${rootKey}`);

  const baseUrl = process.env.JIRA_BASE_URL;

  let text =
    `## Jira Context\n` +
    `Ticket: ${root.key} — ${root.summary}\n` +
    `URL: ${baseUrl}/browse/${root.key}\n` +
    `Type: ${root.type} | Status: ${root.status}\n` +
    `Assignee: ${root.assignee} | Reporter: ${root.reporter}\n\n` +
    renderNode(root, 0);

  if (visited.size >= MAX_ISSUES) {
    text += `\n\n[Note: context limited to ${MAX_ISSUES} issues to prevent loops]`;
  }

  return { jira_context: text, reporter: root.reporter };
}

/* ─────────────────────────────────────────────
   Legacy: kept for any direct callers
   ───────────────────────────────────────────── */
export function formatJiraIssue(
  issue: Record<string, unknown>
): { jira_context: string } {
  const f = issue.fields as JiraField;
  const key = issue.key as string;
  const baseUrl = process.env.JIRA_BASE_URL;

  const summary = f.summary as string;
  const type = (f.issuetype as JiraField)?.name as string;
  const status = (f.status as JiraField)?.name as string;
  const priority = (f.priority as JiraField)?.name as string;
  const description = parseWikiMarkup((f.description as string) ?? "");
  const parent = f.parent as JiraField | null;
  const epic = parent
    ? {
        key: parent.key as string,
        summary: (parent.fields as JiraField)?.summary as string,
      }
    : null;

  const assignee =
    ((f.assignee as JiraField)?.displayName as string) ?? "Unassigned";
  const reporter =
    ((f.reporter as JiraField)?.displayName as string) ??
    ((f.creator as JiraField)?.displayName as string) ??
    "Unknown";
  const reviewer = (f.customfield_11731 as JiraField)?.displayName as string;
  const sprint = (f.customfield_10021 as JiraField[])?.find(
    (s) => s.state === "active"
  )?.name as string;

  const subtasks = (f.subtasks as JiraField[])?.map((s) => ({
    key: s.key as string,
    summary: (s.fields as JiraField).summary as string,
    status: ((s.fields as JiraField).status as JiraField)?.name as string,
  }));

  let text =
    `## Jira Context\n` +
    `Ticket: ${key} - ${summary}\n` +
    `URL: ${baseUrl}/browse/${key}\n` +
    `Type: ${type} | Status: ${status} | Priority: ${priority}\n` +
    `Epic: ${epic?.key ?? "N/A"} - ${epic?.summary ?? "N/A"}\n` +
    `Assignee: ${assignee} | Reporter: ${reporter} | Reviewer: ${reviewer ?? "N/A"}\n` +
    `Sprint: ${sprint ?? "N/A"}`;

  if (subtasks?.length) {
    text += `\n\nSubtasks:`;
    subtasks.forEach((s) => {
      text += `\n- [${s.key}] ${s.summary} (${s.status})`;
    });
  }

  if (description) {
    text += `\n\nDescription:\n${description}`;
  }

  return { jira_context: text };
}
