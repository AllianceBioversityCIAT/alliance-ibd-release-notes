export const DEFAULTS = {
  owner: "AllianceBioversityCIAT",
  repo: "onecgiar_pr",
  branch: "staging",
  jiraPlaceholder: "P2-2160",
} as const;


export const STEPS = [
  { number: 1, title: "Jira Context", description: "Fetch ticket details" },
  { number: 2, title: "GitHub Commits", description: "Gather commit history" },
  { number: 3, title: "Generate", description: "AI-powered release note" },
] as const;

export const N8N_BASE_URL = "https://ibdteam.app.n8n.cloud/webhook";
