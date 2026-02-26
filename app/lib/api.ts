import type { JiraResponse, CommitsResponse, GenerateResponse } from "./types";

async function post<T>(url: string, body: Record<string, string>): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed (${res.status})`);
  }
  return res.json();
}

export function fetchJiraContext(issueKey: string) {
  return post<JiraResponse>("/api/release-notes/jira", { issue_key: issueKey });
}

export function fetchCommits(params: {
  owner: string;
  repo: string;
  branch: string;
  jira_ticket: string;
}) {
  return post<CommitsResponse>("/api/release-notes/commits", params);
}

export function generateReleaseNote(params: {
  owner: string;
  repo: string;
  branch: string;
  jira_ticket: string;
}) {
  return post<GenerateResponse>("/api/release-notes/generate", params);
}
