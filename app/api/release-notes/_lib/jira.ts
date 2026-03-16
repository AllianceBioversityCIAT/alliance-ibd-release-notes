// Shared Jira helpers used by /jira and /generate routes
// Transform logic lives in app/lib/jira-transform.ts (shared with client)

import {
  transformRawToContext,
  parseWikiMarkup,
  type RawIssueNode,
  type RawComment,
  type RawAttachment,
  type JiraChild,
} from "@/app/lib/jira-transform";

export type { RawIssueNode, JiraChild };

const MAX_ISSUES = 50;
const MAX_DEPTH = 6;
const MAX_COMMENTS = 5;

type JiraField = Record<string, unknown>;

/* ─────────────────────────────────────────────
   Auth helper
   ───────────────────────────────────────────── */
function makeAuth(): string {
  return Buffer.from(
    `${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`
  ).toString("base64");
}

/* ═════════════════════════════════════════════
   RAW FETCH (no transformation)
   ═════════════════════════════════════════════ */

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

async function fetchRawComments(issueKey: string): Promise<RawComment[]> {
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
      .map((c) => ({
        body: c.body,
        author: c.author?.displayName ?? "Unknown",
      }));
  } catch {
    return [];
  }
}

async function collectRawTree(
  key: string,
  visited: Set<string>,
  depth: number
): Promise<RawIssueNode | null> {
  if (visited.has(key)) return null;
  if (visited.size >= MAX_ISSUES) return null;
  if (depth > MAX_DEPTH) return null;

  visited.add(key);

  let issue: Record<string, unknown>;
  let comments: RawComment[];
  try {
    [issue, comments] = await Promise.all([
      fetchJiraIssue(key),
      fetchRawComments(key),
    ]);
  } catch {
    visited.delete(key);
    return null;
  }

  const f = issue.fields as JiraField;
  const issueType = (f.issuetype as JiraField)?.name as string ?? "Unknown";

  const rawAttachments: RawAttachment[] = ((f.attachment as JiraField[]) ?? []).map((a) => ({
    filename: a.filename as string,
    content: a.content as string,
    mimeType: a.mimeType as string ?? "",
    thumbnail: a.thumbnail as string | undefined,
  }));

  const subtaskKeys: string[] = (f.subtasks as JiraField[])
    ?.map((s) => s.key as string)
    .filter(Boolean) ?? [];

  // Also extract children from issuelinks (e.g. "is parent of", "contains")
  const issueLinks = (f.issuelinks as JiraField[]) ?? [];
  for (const link of issueLinks) {
    const linkType = link.type as JiraField | undefined;
    const outward = (linkType?.outward as string ?? "").toLowerCase();
    // Parent→child link types: "is parent of", "contains", "has child", etc.
    if (/parent|contains|child|split/.test(outward) && link.outwardIssue) {
      const childKey = (link.outwardIssue as JiraField).key as string;
      if (childKey && !subtaskKeys.includes(childKey)) {
        subtaskKeys.push(childKey);
      }
    }
    // Also check inward for reverse naming (e.g. inward = "is child of")
    const inward = (linkType?.inward as string ?? "").toLowerCase();
    if (/parent|contains|child|split/.test(inward) && link.inwardIssue) {
      const childKey = (link.inwardIssue as JiraField).key as string;
      if (childKey && !subtaskKeys.includes(childKey)) {
        subtaskKeys.push(childKey);
      }
    }
  }

  // Search for children via JQL (uses v3 API — v2/search is removed in some Jira Cloud instances)
  if (visited.size < MAX_ISSUES) {
    const jqlQueries = [`parent = ${key}`];
    if (issueType === "Epic") {
      jqlQueries.push(`"Epic Link" = ${key}`);
    }

    for (const jql of jqlQueries) {
      try {
        // Try v3 first (required by newer Jira Cloud), fall back to v2
        const urls = [
          `${process.env.JIRA_BASE_URL}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=50&fields=summary,issuetype,status`,
          `${process.env.JIRA_BASE_URL}/rest/api/2/search?jql=${encodeURIComponent(jql)}&maxResults=50&fields=summary,issuetype,status`,
        ];
        for (const url of urls) {
          try {
            const searchRes = await fetch(url, {
              headers: {
                Authorization: `Basic ${makeAuth()}`,
                Accept: "application/json",
              },
            });
            if (searchRes.ok) {
              const data = (await searchRes.json()) as {
                issues?: Array<{ key: string }>;
              };
              for (const child of data.issues ?? []) {
                if (!subtaskKeys.includes(child.key)) {
                  subtaskKeys.push(child.key);
                }
              }
              break; // v3 worked, skip v2
            }
          } catch {
            // try next URL
          }
        }
      } catch {
        // best-effort
      }
    }
  }

  console.log(`[jira] ${key} (${issueType}) → ${subtaskKeys.length} children: [${subtaskKeys.join(", ")}]`);

  const children: RawIssueNode[] = [];
  for (const childKey of subtaskKeys) {
    if (visited.size >= MAX_ISSUES) break;
    const child = await collectRawTree(childKey, visited, depth + 1);
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
    description: (f.description as string) ?? "",
    attachments: rawAttachments,
    comments,
    children,
  };
}

/* ═════════════════════════════════════════════
   PUBLIC API — fetch raw + transform via shared module
   ═════════════════════════════════════════════ */

export async function buildJiraContext(rootKey: string): Promise<{
  jira_context: string;
  reporter: string;
  children: JiraChild[];
  raw: RawIssueNode;
}> {
  const visited = new Set<string>();
  const raw = await collectRawTree(rootKey, visited, 0);

  if (!raw) throw new Error(`Failed to fetch Jira issue ${rootKey}`);

  const baseUrl = process.env.JIRA_BASE_URL!;
  const { jira_context, reporter, children } = transformRawToContext(raw, baseUrl);

  let text = jira_context;
  if (visited.size >= MAX_ISSUES) {
    text += `\n\n[⚠ Safeguard: tree truncated at ${MAX_ISSUES} issues (max depth ${MAX_DEPTH}) to prevent runaway recursion]`;
  }

  return { jira_context: text, reporter, children, raw };
}

export async function buildJiraContextMulti(keys: string[]): Promise<{
  jira_context: string;
  reporters: string[];
}> {
  if (keys.length === 0) return { jira_context: "", reporters: [] };

  const results = await Promise.allSettled(keys.map((k) => buildJiraContext(k)));

  const contexts: string[] = [];
  const reporters: string[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      contexts.push(result.value.jira_context);
      if (result.value.reporter && !reporters.includes(result.value.reporter)) {
        reporters.push(result.value.reporter);
      }
    }
  }

  return {
    jira_context: contexts.join("\n\n---\n\n"),
    reporters,
  };
}

/* ── Legacy: kept for any direct callers ── */
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
