import { NextRequest, NextResponse } from "next/server";
import { fetchJiraIssue, formatJiraIssue } from "../_lib/jira";

export async function POST(req: NextRequest) {
  try {
    const { issue_key } = await req.json();
    const issue = await fetchJiraIssue(issue_key);
    return NextResponse.json(formatJiraIssue(issue));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
