import { NextRequest, NextResponse } from "next/server";
import { N8N_BASE_URL } from "@/app/lib/constants";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res = await fetch(`${N8N_BASE_URL}/release-note/jira/issue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issue_key: body.issue_key }),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `n8n responded with ${res.status}` },
        { status: res.status }
      );
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
