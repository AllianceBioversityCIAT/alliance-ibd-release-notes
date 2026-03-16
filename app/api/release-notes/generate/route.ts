import { NextRequest, NextResponse } from "next/server";
import { buildJiraContextMulti } from "../_lib/jira";
import { fetchGitHubCommits, filterAndFormatCommits } from "../_lib/github";

export const dynamic = "force-dynamic";

const SYSTEM_MESSAGE = `You are a release notes writer for PRMS (Performance and Results Management System) at CGIAR, a platform used by researchers and program managers worldwide to plan, report, and monitor agricultural research initiatives.

Your job is to write clear, well-structured release notes that explain what was built or improved so stakeholders and users understand what changed in the platform. These are mostly development releases (new features, enhancements, bug fixes).

## Writing Style
- Write clearly and concisely — every sentence should add value
- Lead with WHAT changed and WHY it matters to the user
- Use active voice: "You can now...", "We improved...", "The system now..."
- Be professional and direct — no fluff, no filler, no generic praise
- ZERO technical jargon — no code terms, no ticket IDs, no sprint names
- Write for someone who uses the platform daily but has never seen code
- Do NOT use emojis. Keep it clean and professional.
- Do NOT write generic statements like "vibrant colors", "professional look and feel", "harmoniously presented". Be SPECIFIC about what changed.

## Structure

### Title
- A clear, descriptive title that tells what this release is about
- Below the title, 1-2 sentences summarizing the key changes

### Sections
Use rich Markdown formatting:
- **bold** for key phrases
- > blockquotes for important takeaways
- --- horizontal rules between sections
- ### headings for each major change

For each change:
- A ### heading that describes the specific improvement
- 2-3 sentences explaining what changed and why it matters
- Be specific: mention which part of the platform, what the user will see differently, what problem it solves

### Footer
- "---" separator
- A short closing thanking the team
- List developers/contributors with GitHub links: [@user](https://github.com/user)
- If a Jira reporter is provided: "Special thanks to [Name] for identifying this need."

## How to Interpret Images

You will receive media objects with:
- url: the image/video/file URL
- ai_context: optional description from the person writing the release note

CRITICAL: Interpret every image THROUGH THE LENS of the Jira context you received. Follow this reasoning chain:
1. First, understand from the Jira tickets what feature was built or changed
2. Then, look at the image and figure out what part of that feature it shows
3. Describe what the image shows IN RELATION to the feature — e.g., "Here you can see the new PDF layout where the result title, QA badge, and description are now clearly separated into distinct sections"
4. If the image shows UI elements with specific colors, layouts, or labels, describe their PURPOSE based on the Jira context (e.g., "the red header section groups all result metadata" rather than "the design uses vibrant red tones")

Rules for media:
1. You MUST include ALL provided media in the output — skip none.
2. Media WITH ai_context: Use it as a hint, but ALSO use the Jira context to write a meaningful description. Place it in the most relevant section.
3. Media WITHOUT ai_context: Use the Jira context to infer what the image shows. Place it in the section it relates to. Write 1-2 sentences explaining what the reader is seeing based on the feature context.
4. AFTER each image, write 1-2 sentences referencing specific things visible in it — UI elements, data, layout — connected to the feature being described. The image must be PART of the narrative.
5. NEVER write generic descriptions. Every sentence about an image must be grounded in what the Jira context tells you about the feature.

## Critical Rules
- NEVER use emojis
- NEVER show Jira ticket IDs, sprint names, epic codes, or status fields
- NEVER mention code, files, functions, components, or technical terms
- NEVER mention refactor, module, handler, API, endpoint, service, TypeScript, Angular
- NEVER write generic filler like "beautiful design", "modern look", "vibrant colors"
- ALWAYS write raw Markdown
- Keep it specific, useful, and readable`;

export async function POST(req: NextRequest) {
  try {
    const { owner, repo, branch, jira_ticket, jira_tickets, media, general_context } = await req.json();
    // Accept jira_tickets (array) or legacy jira_ticket (string)
    const jiraKeys: string[] =
      jira_tickets ?? (jira_ticket ? [jira_ticket] : []);

    // Fetch Jira (with recursive subtask tree) and GitHub in parallel
    const [{ jira_context, reporters }, commits] = await Promise.all([
      buildJiraContextMulti(jiraKeys),
      fetchGitHubCommits(owner, repo, branch),
    ]);

    const { release_notes_input } = filterAndFormatCommits(commits, jira_ticket);

    let mediaSection = "No media provided.";
    if (media?.length > 0) {
      const lines = (media as Array<{ url: string; ai_context: string }>).map(
        (m, i) => {
          const ctx = m.ai_context?.trim();
          return ctx
            ? `Image ${i + 1}: ${m.url}\n  Context: ${ctx}`
            : `Image ${i + 1}: ${m.url}\n  Context: (none — infer from Jira context)`;
        }
      );
      mediaSection = lines.join("\n\n");
    }

    const userPrompt =
      `Write release notes from this data:\n\n` +
      `${jira_context}\n\n` +
      `${release_notes_input}\n\n` +
      `Jira Reporter(s): ${reporters.join(", ")}\n\n` +
      `## Media\n${mediaSection}` +
      (general_context ? `\n\n## General context about the media (provided by the author):\n${general_context}` : "") +
      `\n\nRemember: Interpret each image through the Jira context above. If an image has specific context from the author, use it. If not, use the Jira tickets to understand what the image shows.`;

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
