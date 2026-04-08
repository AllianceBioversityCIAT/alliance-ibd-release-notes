import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    JIRA_BASE_URL: process.env.JIRA_BASE_URL ? "SET" : "MISSING",
    JIRA_EMAIL: process.env.JIRA_EMAIL ? "SET" : "MISSING",
    JIRA_API_TOKEN: process.env.JIRA_API_TOKEN ? "SET" : "MISSING",
    GITHUB_TOKEN: process.env.GITHUB_TOKEN ? "SET" : "MISSING",
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? "SET" : "MISSING",
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID ? "SET" : "MISSING",
    NOTION_API_KEY: process.env.NOTION_API_KEY ? "SET" : "MISSING",
    NOTION_DATABASE_ID: process.env.NOTION_DATABASE_ID ? "SET" : "MISSING",
  });
}
