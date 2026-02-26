export const DEFAULTS = {
  owner: "AllianceBioversityCIAT",
  repo: "onecgiar_pr",
  branch: "staging",
  jiraPlaceholder: "P2-2160",
} as const;

export const DEFAULT_MEDIA = [
  {
    url: "https://placehold.co/1200x630/2563eb/ffffff?text=Release+Note+Header",
    ai_context: "Use as the hero/banner image at the top of the blog post",
  },
  {
    url: "https://placehold.co/800x450/16a34a/ffffff?text=Feature+Screenshot",
    ai_context: "Place after the main feature description as a visual reference of the new UI",
  },
];

export const STEPS = [
  { number: 1, title: "Jira Context", description: "Fetch ticket details" },
  { number: 2, title: "GitHub Commits", description: "Gather commit history" },
  { number: 3, title: "Generate", description: "AI-powered release note" },
] as const;

export const N8N_BASE_URL = "https://ibdteam.app.n8n.cloud/webhook";
