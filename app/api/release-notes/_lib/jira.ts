// Shared Jira helpers used by /jira and /generate routes

type JiraField = Record<string, unknown>;

export function formatJiraIssue(issue: Record<string, unknown>): { jira_context: string } {
  const fields = issue.fields as JiraField;
  const key = issue.key as string;
  const baseUrl = process.env.JIRA_BASE_URL;

  const summary = fields.summary as string;
  const type = (fields.issuetype as JiraField)?.name as string;
  const status = (fields.status as JiraField)?.name as string;
  const priority = (fields.priority as JiraField)?.name as string;
  const description = (fields.description as string)
    ?.replace(/h3\.\s*/g, "")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\n{2,}/g, "\n")
    .trim();

  const parent = fields.parent as JiraField | null;
  const epic = parent
    ? { key: parent.key as string, summary: (parent.fields as JiraField)?.summary as string }
    : null;

  const assignee = (fields.assignee as JiraField)?.displayName as string;
  const reporter = (fields.creator as JiraField)?.displayName as string;
  const reviewer = (fields.customfield_11731 as JiraField)?.displayName as string;
  const sprint = (fields.customfield_10021 as JiraField[])?.find(
    (s) => s.state === "active"
  )?.name as string;

  const subtasks = (fields.subtasks as JiraField[])?.map((s) => ({
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

export async function fetchJiraIssue(issueKey: string): Promise<Record<string, unknown>> {
  const auth = Buffer.from(
    `${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`
  ).toString("base64");

  const res = await fetch(
    `${process.env.JIRA_BASE_URL}/rest/api/2/issue/${issueKey}`,
    {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
    }
  );

  if (!res.ok) {
    throw new Error(`Jira responded with ${res.status}`);
  }

  return res.json();
}
