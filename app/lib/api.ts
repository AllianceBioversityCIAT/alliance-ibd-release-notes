import type { JiraResponse, CommitsResponse, GenerateResponse, NotionPublishResult } from "./types";

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

export function fetchJiraContext(issueKeys: string[]) {
  return post<JiraResponse>("/api/release-notes/jira", { issue_keys: issueKeys });
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
  jira_tickets: string[];
  media: { url: string; ai_context: string }[];
}) {
  return post<GenerateResponse>("/api/release-notes/generate", params);
}

export async function* streamReleaseNote(params: {
  owner: string;
  repo: string;
  branch: string;
  jira_tickets: string[];
  media: { url: string; ai_context: string }[];
  general_context?: string;
}): AsyncGenerator<string, void, unknown> {
  const res = await fetch("/api/release-notes/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const text = await res.text();
    let msg = `Request failed (${res.status})`;
    try { msg = JSON.parse(text).error || msg; } catch { /* */ }
    throw new Error(msg);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") return;
        try {
          const parsed = JSON.parse(payload);
          if (parsed.error) throw new Error(parsed.error.message ?? "OpenAI stream error");
          const content: string = parsed.choices?.[0]?.delta?.content ?? "";
          if (content) yield content;
        } catch (e) {
          if (e instanceof Error && e.message.includes("OpenAI")) throw e;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function getNotionOptions(): Promise<{ tags: string[]; projects: string[] }> {
  const r = await fetch("/api/release-notes/notion");
  return r.json();
}

export function publishToNotion(params: {
  title: string;
  brief_description: string;
  tag: string;
  projects: string[];
  released_date: string;
  markdown: string;
  cover_url?: string;
}) {
  return post<NotionPublishResult>("/api/release-notes/notion", params);
}

/** Generate a PDF from markdown and trigger browser download. */
export async function downloadPDF(markdown: string, title?: string): Promise<void> {
  const res = await fetch("/api/release-notes/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ markdown, title }),
  });
  if (!res.ok) {
    let msg = `PDF generation failed (${res.status})`;
    try { const err = await res.json(); msg = err.error || msg; } catch { /* */ }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(title || "release-note").replace(/[^a-zA-Z0-9\s-_]/g, "").replace(/\s+/g, "-")}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
