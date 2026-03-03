export interface JiraChild {
  key: string;
  summary: string;
  type: string;
  status: string;
  description: string;
  children: JiraChild[];
}

export interface JiraResponse {
  jira_context: string;
  children?: JiraChild[];
}

export interface CommitsResponse {
  release_notes_input: string;
}

export interface GenerateResponse {
  output: string;
}

export interface HistoryEntry {
  id: string;
  jiraKey: string;
  title: string;
  markdown: string;
  createdAt: string;
}

/** API-level media: sent to the generate endpoint after uploading */
export interface MediaItem {
  url: string;
  ai_context: string;
}

/** Local media item: file held in memory before upload */
export interface LocalMediaItem {
  file: File;
  ai_context: string;
  previewUrl: string; // URL.createObjectURL for images/videos, empty for other files
  type: "image" | "video" | "file";
}

export interface NotionPublishPayload {
  tag: string;
  projects: string[];
  brief_description: string;
}

export interface NotionPublishResult {
  url: string;
  id: string;
}

export interface StepStatus {
  loading: boolean;
  error: string | null;
  result: string | null;
}
