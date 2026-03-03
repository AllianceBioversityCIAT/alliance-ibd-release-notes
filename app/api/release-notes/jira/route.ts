import { NextRequest, NextResponse } from "next/server";
import { buildJiraContextMulti } from "../_lib/jira";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // Accept issue_keys (array) or legacy issue_key (string)
    const keys: string[] =
      body.issue_keys ?? (body.issue_key ? [body.issue_key] : []);

    if (keys.length === 0) {
      return NextResponse.json({ error: "No issue keys provided" }, { status: 400 });
    }

    const { jira_context } = await buildJiraContextMulti(keys);
    return NextResponse.json({ jira_context });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
