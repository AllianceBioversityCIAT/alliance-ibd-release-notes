import type { JiraResponse, NotionPublishResult } from "./types";

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

/**
 * The server sends the model short `[[IMG_n]]` placeholders instead of the long
 * pre-signed S3 URLs (so giant URLs don't eat the token budget and truncate
 * images). This resolves those placeholders back to the real media URLs as the
 * stream arrives, buffering any token that is split across chunk boundaries.
 */
function makePlaceholderResolver(media?: { url: string }[]) {
  const urls = media?.map((m) => m.url) ?? [];
  // Matches a trailing fragment that could be the start of a token (incl. a
  // leading `!` for the malformed `![[IMG_n]]` shape the model sometimes emits).
  const partialTail = /!?\[\[?(?:I(?:M(?:G(?:_\d*)?)?)?)?\]?$/;
  const resolveAll = (s: string) =>
    s
      // Malformed image the model sometimes writes (`![[IMG_n]]`) → full image markdown.
      .replace(/!\[\[IMG_(\d+)\]\]/g, (m, n) =>
        urls[Number(n) - 1] ? `![Screenshot](${urls[Number(n) - 1]})` : m
      )
      // Well-formed token (inside `![alt]([[IMG_n]])` or standalone) → real URL.
      .replace(/\[\[IMG_(\d+)\]\]/g, (m, n) => urls[Number(n) - 1] ?? m);
  let tail = "";
  return {
    push(chunk: string): string {
      const buf = resolveAll(tail + chunk);
      const m = buf.match(partialTail);
      if (m && m.index !== undefined && m.index > 0) {
        tail = buf.slice(m.index);
        return buf.slice(0, m.index);
      }
      if (m && m.index === 0) {
        tail = buf;
        return "";
      }
      tail = "";
      return buf;
    },
    flush(): string {
      const out = resolveAll(tail);
      tail = "";
      return out;
    },
  };
}

export async function* streamReleaseNote(params: {
  jira_tickets: string[];
  jira_context?: string;
  media: { url: string; ai_context: string }[];
  general_context?: string;
  note_type?: string;
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
  const resolver = makePlaceholderResolver(params.media);
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
        if (payload === "[DONE]") {
          const last = resolver.flush();
          if (last) yield last;
          return;
        }
        try {
          const parsed = JSON.parse(payload);
          if (parsed.error) throw new Error(parsed.error.message ?? "OpenAI stream error");
          const content: string = parsed.choices?.[0]?.delta?.content ?? "";
          if (content) {
            const out = resolver.push(content);
            if (out) yield out;
          }
        } catch (e) {
          if (e instanceof Error && e.message.includes("OpenAI")) throw e;
        }
      }
    }
    const last = resolver.flush();
    if (last) yield last;
  } finally {
    reader.releaseLock();
  }
}

export async function* streamRefineNote(params: {
  markdown: string;
  instruction: string;
  media?: { url: string; ai_context: string }[];
  jira_context?: string;
}): AsyncGenerator<string, void, unknown> {
  const res = await fetch("/api/release-notes/refine", {
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
  const resolver = makePlaceholderResolver(params.media);
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
        if (payload === "[DONE]") {
          const last = resolver.flush();
          if (last) yield last;
          return;
        }
        try {
          const parsed = JSON.parse(payload);
          if (parsed.error) throw new Error(parsed.error.message ?? "OpenAI stream error");
          const content: string = parsed.choices?.[0]?.delta?.content ?? "";
          if (content) {
            const out = resolver.push(content);
            if (out) yield out;
          }
        } catch (e) {
          if (e instanceof Error && e.message.includes("OpenAI")) throw e;
        }
      }
    }
    const last = resolver.flush();
    if (last) yield last;
  } finally {
    reader.releaseLock();
  }
}

export async function getNotionOptions(env: "test" | "prod" = "test"): Promise<{ tags: string[]; projects: string[] }> {
  const r = await fetch(`/api/release-notes/notion?env=${env}`);
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
  notion_env?: "test" | "prod";
}) {
  return post<NotionPublishResult>("/api/release-notes/notion", params);
}

/** Convert Jira attachment URLs to S3 URLs (download from Jira, upload to S3). */
export async function convertJiraImagesToS3(jiraUrls: string[]): Promise<Record<string, string>> {
  if (!jiraUrls.length) return {};
  const res = await fetch("/api/release-notes/jira-to-s3", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ urls: jiraUrls }),
  });
  if (!res.ok) return {};
  const data = await res.json();
  return data.mappings || {};
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
