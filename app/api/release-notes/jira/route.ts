import { NextRequest, NextResponse } from "next/server";
import { buildJiraContext } from "../_lib/jira";

export async function POST(req: NextRequest) {
  try {
    const { issue_key } = await req.json();
    const { jira_context } = await buildJiraContext(issue_key);
    return NextResponse.json({ jira_context });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
