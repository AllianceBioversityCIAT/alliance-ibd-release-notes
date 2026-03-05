import { NextRequest, NextResponse } from "next/server";
import { buildJiraContextMulti } from "../_lib/jira";
import { fetchGitHubCommits, filterAndFormatCommits } from "../_lib/github";

export const dynamic = "force-dynamic";

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
  - IMPORTANT: Do NOT just add a caption. The image must be PART of the narrative. Write 1-2 sentences AFTER the image that reference what the reader can see in it — point out specific UI elements, layout changes, or data shown. Make the reader feel like the image is illustrating your explanation, not just decoration.

### Footer
- End with a "---" separator
- A short, professional closing message thanking the team
- List developers/contributors with their GitHub profiles linked: [@user](https://github.com/user)
- If a Jira reporter is provided, add a line: "Special thanks to [Name] for identifying this need and driving it forward."

## Media Integration
You will receive an optional array of media objects with this structure:
- url: URL of the image/video/file
- ai_context: description of what the media shows

CRITICAL RULES for media:
1. You MUST include ALL provided media items in the output — do not skip any.
2. Media WITH ai_context (non-empty): Place it in the section that best relates to its context. Write 1-2 sentences AFTER the image that reference what the reader can see — point out specific UI elements, layout changes, or data shown. The image must be PART of the narrative, not decoration.
3. Media WITHOUT ai_context (empty string ""): Place ALL such images together in a visual showcase section right after the intro paragraph, before the feature sections. Use a simple ### heading like "A Fresh Look" or "See It in Action". Just embed the images with ![](url) — do NOT write captions or narrative about them since you have no context about what they show.
4. If no media is provided, write the blog post without media.

## Critical Rules
- NEVER use emojis
- NEVER show Jira ticket IDs, sprint names, epic codes, or status fields in the body
- NEVER mention code, files, functions, components, or any technical terms
- NEVER mention code blocks, refactor, component, module, handler, API, endpoint, service, TypeScript, Angular
- ALWAYS write raw Markdown directly
- Make it feel like a polished, professional product blog post`;

export async function POST(req: NextRequest) {
  try {
    const { owner, repo, branch, jira_ticket, jira_tickets, media } = await req.json();
    // Accept jira_tickets (array) or legacy jira_ticket (string)
    const jiraKeys: string[] =
      jira_tickets ?? (jira_ticket ? [jira_ticket] : []);

    // Fetch Jira (with recursive subtask tree) and GitHub in parallel
    const [{ jira_context, reporters }, commits] = await Promise.all([
      buildJiraContextMulti(jiraKeys),
      fetchGitHubCommits(owner, repo, branch),
    ]);

    const { release_notes_input } = filterAndFormatCommits(commits, jira_ticket);

    const mediaSection =
      media?.length > 0
        ? JSON.stringify(media)
        : "No media provided";

    const userPrompt =
      `Write a release blog post from this data:\n\n` +
      `${release_notes_input}\n\n` +
      `${jira_context}\n\n` +
      `Jira Reporter(s) (people who identified and reported this need): ${reporters.join(", ")}\n\n` +
      `Media assets:\n${mediaSection}`;

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        stream: true,
        messages: [
          { role: "system", content: SYSTEM_MESSAGE },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!openaiRes.ok || !openaiRes.body) {
      const err = await openaiRes.text();
      return NextResponse.json(
        { error: `OpenAI responded with ${openaiRes.status}: ${err}` },
        { status: openaiRes.status }
      );
    }

    return new Response(openaiRes.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
