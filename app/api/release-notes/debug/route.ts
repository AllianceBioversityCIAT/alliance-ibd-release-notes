import { NextResponse } from "next/server";

const ENV_KEYS = [
  "JIRA_BASE_URL",
  "JIRA_EMAIL",
  "JIRA_API_TOKEN",
  "OPENAI_API_KEY",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_REGION",
  "S3_BUCKET",
  "NOTION_API_KEY",
  "NOTION_DATABASE_ID_TEST",
  "NOTION_DATABASE_ID_PROD",
];

export async function GET() {
  const vars = ENV_KEYS.map((key) => ({
    key,
    set: !!process.env[key],
    preview: process.env[key] ? `${process.env[key]!.slice(0, 4)}...` : null,
  }));

  const missing = vars.filter((v) => !v.set).map((v) => v.key);

  return NextResponse.json({
    ok: missing.length === 0,
    missing,
    vars,
  });
}
