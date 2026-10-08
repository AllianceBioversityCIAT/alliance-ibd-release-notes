import { NextRequest, NextResponse } from "next/server";
import { fetchGitHubCommits, filterAndFormatCommits } from "../_lib/github";

export async function POST(req: NextRequest) {
  try {
    const { owner, repo, branch, jira_ticket } = await req.json();
    const commits = await fetchGitHubCommits(owner, repo, branch);
    return NextResponse.json(filterAndFormatCommits(commits, jira_ticket));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
