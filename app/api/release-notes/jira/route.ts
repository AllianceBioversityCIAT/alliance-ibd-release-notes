import { NextRequest, NextResponse } from "next/server";
import { buildJiraContext, buildJiraContextMulti } from "../_lib/jira";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const keys: string[] =
      body.issue_keys ?? (body.issue_key ? [body.issue_key] : []);

    if (keys.length === 0) {
      return NextResponse.json({ error: "No issue keys provided" }, { status: 400 });
    }

    // Single key: return raw tree + transformed context + children
    if (keys.length === 1) {
      const { jira_context, children, raw } = await buildJiraContext(keys[0]);
      return NextResponse.json({
        jira_context,
        children,
        raw,
        jira_base_url: process.env.JIRA_BASE_URL,
      });
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
