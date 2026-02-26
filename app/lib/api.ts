import type { JiraResponse, CommitsResponse, GenerateResponse } from "./types";

async function post<T>(url: string, body: Record<string, unknown>): Promise<T> {
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
  media: { url: string; ai_context: string }[];
}) {
  return post<GenerateResponse>("/api/release-notes/generate", params);
}

/** Upload a single file to S3 via n8n. Returns the S3 Location URL. */
export async function uploadFile(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/release-notes/file", {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    let msg = `Upload failed (${res.status})`;
    try {
      const errData = await res.json();
      msg = errData.error || msg;
    } catch {
      // response wasn't JSON
    }
    throw new Error(msg);
  }
  const data = await res.json();
  // S3 response may have Location at top level or nested
  const url = data.Location || data.location || data.url || "";
  if (!url) {
    throw new Error("Upload succeeded but n8n did not return the file URL. Configure the Respond to Webhook node to return S3 data.");
  }
  return url;
}

/** Upload multiple files sequentially with a small delay between each. */
export async function uploadFilesSequentially(
  files: File[],
  onProgress?: (index: number, url: string) => void
): Promise<string[]> {
  const urls: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const url = await uploadFile(files[i]);
    urls.push(url);
    onProgress?.(i, url);
    if (i < files.length - 1) {
      await new Promise((r) => setTimeout(r, 10));
    }
  }
  return urls;
}
