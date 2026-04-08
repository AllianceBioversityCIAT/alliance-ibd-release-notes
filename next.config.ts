import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    JIRA_BASE_URL: process.env.JIRA_BASE_URL,
    JIRA_EMAIL: process.env.JIRA_EMAIL,
    JIRA_API_TOKEN: process.env.JIRA_API_TOKEN,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    S3_REGION: process.env.S3_REGION,
    S3_BUCKET: process.env.S3_BUCKET,
    NOTION_API_KEY: process.env.NOTION_API_KEY,
    NOTION_DATABASE_ID: process.env.NOTION_DATABASE_ID,
  },
};

export default nextConfig;
