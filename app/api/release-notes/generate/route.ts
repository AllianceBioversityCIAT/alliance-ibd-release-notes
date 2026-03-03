import { NextRequest, NextResponse } from "next/server";
import { fetchJiraIssue, formatJiraIssue } from "../_lib/jira";
import { fetchGitHubCommits, filterAndFormatCommits } from "../_lib/github";

const SYSTEM_MESSAGE = `You are a tech blog writer for PRMS (Planning and Reporting Management System) at CGIAR, a platform used by researchers and program managers worldwide to plan, report, and monitor agricultural research initiatives.

Your job is to write beautiful, engaging blog-style release notes that showcase innovation and progress. Think of it as a product announcement blog post like those from Notion, Linear, or Vercel.

## Writing Style
- Write like a product blog post, warm and engaging
- Lead every section with the USER BENEFIT
- Use active voice: "You can now...", "We've improved...", "Say goodbye to..."
- Be enthusiastic but professional, NOT informal
- ZERO technical jargon — no code terms, no ticket IDs, no sprint names
- Write for someone who has never seen a line of code
- Do NOT use emojis anywhere in the output. Keep it clean and professional.

## Structure

### Title
- Use a creative, catchy title that captures the theme of the release
- Below the title, write a 2-3 sentence intro paragraph that excites the reader about what's new

### Sections
Use rich Markdown formatting throughout:
- Use **bold** for key phrases
- Use > blockquotes for highlighting important takeaways
- Use --- horizontal rules between sections
- Use ### headings for each major change

For each change:
- A catchy ### heading that describes the benefit
- 2-3 sentences explaining what improved and WHY it matters to the user
- If media is provided for this change, include it using Markdown:
  - Images: ![description](url)
  - Videos: [Watch demo](url)
  - Files: [View document](url)
  - Place media RIGHT AFTER the explanation of that feature
  - Use the provided context to write a caption below the media in *italics*

### Footer
- End with a "---" separator
- A short, professional closing message thanking the team
- List contributors with their GitHub profiles linked: [@user](https://github.com/user)

## Media Integration
You will receive an optional array of media objects with this structure:
- link: URL of the image/video/file
- context: description of what the media shows

Use your judgment to place each media item in the section where it fits best based on its context. Write a meaningful caption using the context provided. If no media is provided, write the blog post without media.

## Critical Rules
- NEVER use emojis
- NEVER show Jira ticket IDs, sprint names, epic codes, or status fields in the body
- NEVER mention code, files, functions, components, or any technical terms
- NEVER mention code blocks, refactor, component, module, handler, API, endpoint, service, TypeScript, Angular
- ALWAYS write raw Markdown directly
- Make it feel like a polished, professional product blog post`;

export async function POST(req: NextRequest) {
  try {
    const { owner, repo, branch, jira_ticket, media } = await req.json();

    // Fetch Jira and GitHub in parallel
    const [issue, commits] = await Promise.all([
      fetchJiraIssue(jira_ticket),
      fetchGitHubCommits(owner, repo, branch),
    ]);

    const { jira_context } = formatJiraIssue(issue);
    const { release_notes_input } = filterAndFormatCommits(commits, jira_ticket);

    const mediaSection =
      media?.length > 0
        ? JSON.stringify(media)
        : "No media provided";

    const userPrompt =
      `Write a release blog post from this data:\n\n` +
      `${release_notes_input}\n\n` +
      `${jira_context}\n\n` +
      `Media assets:\n${mediaSection}`;

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: SYSTEM_MESSAGE },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!openaiRes.ok) {
      const err = await openaiRes.text();
      return NextResponse.json(
        { error: `OpenAI responded with ${openaiRes.status}: ${err}` },
        { status: openaiRes.status }
      );
    }

    const result = await openaiRes.json();
    const output: string = result.choices?.[0]?.message?.content ?? "";

    return NextResponse.json({ output });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
