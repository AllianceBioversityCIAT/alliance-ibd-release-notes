# IBD Release Notes

Internal tool for generating release notes from Jira tickets and GitHub commits using AI (OpenAI). Publish directly to Notion with banners, tags, and project metadata.

## How it works

The app presents an interactive graph view (React Flow) where each step in the release note generation process is a connected node:

```
[Jira Input] → [GitHub Input] → [Generate] → [Notion Publish]
```

1. **Jira Input** — Enter one or more Jira ticket keys. The app fetches the ticket details and recursively discovers subtasks and linked issues.
2. **GitHub Input** — Specify the repository and branch. The app fetches commits related to the Jira tickets.
3. **Generate** — Optionally attach screenshots or media files (uploaded to S3). The AI generates a structured release note via streaming (SSE).
4. **Notion Publish** — Review the generated markdown, pick a tag and projects, optionally add a banner image, then publish directly to a Notion database.

Each flow is an independent lane on the canvas. You can have multiple flows running side by side, and the canvas state persists across page reloads via localStorage.

## Tech stack

- **Next.js** (App Router) + TypeScript + Tailwind CSS v4
- **React Flow** (`@xyflow/react`) — interactive graph canvas
- **Three.js** (`@react-three/fiber`) — animated particle background
- **OpenAI** `gpt-4.1-mini` — release note generation with streaming
- **AWS S3** — media/banner file uploads
- **Notion API** — page creation with rich properties
- **Jira REST API** — ticket fetching with recursive subtask discovery
- **GitHub REST API** — commit history filtered by ticket

## Environment variables

Create a `.env.local` file with the following keys:

```
# Jira
JIRA_BASE_URL=
JIRA_EMAIL=
JIRA_API_TOKEN=

# GitHub
GITHUB_TOKEN=

# OpenAI
OPENAI_API_KEY=

# AWS S3
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
AWS_S3_BUCKET=

# Notion
NOTION_API_KEY=
NOTION_DATABASE_ID=
```

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to use the app.
