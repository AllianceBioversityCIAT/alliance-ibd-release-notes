export interface JiraResponse {
  jira_context: string;
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

export interface StepStatus {
  loading: boolean;
  error: string | null;
  result: string | null;
}
