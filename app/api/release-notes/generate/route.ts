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

## GOLDEN RULE for Images — Context or Nothing

You will receive media objects with:
- url: the image/video/file URL
- ai_context: optional description from the person writing the release note

### The Rule
Every image description MUST be grounded in the Jira context (tickets, subtasks, stories, activities). If you cannot connect an image to something specific from Jira, you have NOTHING meaningful to say about it. In that case, do NOT describe it — place it in a "Screenshots" section at the end.

### Decision chain for EACH image:
1. Read the Jira context thoroughly — understand what features were built or changed
2. Look at the image and ask: "Does this image show something directly related to a Jira ticket, subtask, story, or activity?"
3. **YES, clear relation** → Place the image inline in the relevant section. Describe it IN TERMS OF the feature/change from Jira. Reference specific UI elements by their PURPOSE in the feature (e.g., "the new QA badge section now displays assessor details alongside the result description" — NOT "the image shows a red section with text and a badge icon")
4. **NO clear relation / uncertain** → Do NOT describe the image. Place it at the end under a "### Screenshots" heading with just the image markdown and nothing else. No captions, no descriptions.

### What NEVER to do with images:
- NEVER visually describe an image without connecting it to Jira context (e.g., "This snapshot shows a well-structured PDF with clear sections" is FORBIDDEN — it says nothing useful)
- NEVER describe colors, layout aesthetics, or visual impressions (e.g., "featuring clear sections, well-structured layout" is useless filler)
- NEVER use phrases like: "showcases", "demonstrates", "as shown above", "the image above displays"
- NEVER invent features or context that isn't in the Jira data just to justify describing an image

### What TO do with images:
- Connect the image to a SPECIFIC Jira activity: "The result PDF now includes the bilateral project name and center logo at the top, with the QA certification badge prominently placed before the result description — addressing the need identified in the reporting requirements"
- If there is ai_context, use it as a hint but STILL ground the description in Jira context
- The image must be PART of the narrative about a real change, not a standalone visual description

### Media inclusion:
- You MUST include ALL provided media in the output — skip none
- Images with clear Jira relation → inline in the relevant section with contextual description
- Images without clear Jira relation → at the end under "### Screenshots" with no description

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
    const { owner, repo, branch, jira_ticket, jira_tickets, jira_context: clientJiraContext, media, general_context, note_type } = await req.json();
    // Accept jira_tickets (array) or legacy jira_ticket (string)
    const jiraKeys: string[] =
      jira_tickets ?? (jira_ticket ? [jira_ticket] : []);

    // Use pre-fetched jira_context from client if available, otherwise fetch
    const hasGitHub = owner && repo && branch;
    let jira_context: string;
    let reporters: string[] = [];

    if (clientJiraContext) {
      jira_context = clientJiraContext;
      // Extract reporters from the context text (format: "Reporter: Name")
      const reporterMatches = jira_context.matchAll(/Reporter:\s*([^\n|]+)/g);
      for (const m of reporterMatches) {
        const name = m[1].trim();
        if (name && !reporters.includes(name)) reporters.push(name);
      }
    } else {
      const result = await buildJiraContextMulti(jiraKeys);
      jira_context = result.jira_context;
      reporters = result.reporters;
    }

    let commits: Awaited<ReturnType<typeof fetchGitHubCommits>> = [];
    if (hasGitHub) {
      commits = await fetchGitHubCommits(owner, repo, branch);
    }

    const { release_notes_input } = hasGitHub
      ? filterAndFormatCommits(commits, jira_ticket)
      : { release_notes_input: "No GitHub commits provided." };

    // Note type instructions
    const noteTypeInstructions: Record<string, string> = {
      detailed: `## RELEASE NOTE TYPE: DETAILED / TUTORIAL
This is a comprehensive release with lots of context. Write an EXTENSIVE, in-depth release note that:
- Covers EVERY subtask, story, and change individually with its own section
- Explains each feature as a mini-tutorial: what it does, how the user interacts with it, what they should expect
- Uses step-by-step descriptions where applicable (e.g., "First you'll see..., then you can...")
- Includes specific UI element references (buttons, fields, screens, modals)
- Provides context about WHY each change matters to the user's workflow
- Should be AT LEAST 2000+ words for complex features — do NOT summarize or condense
- Think of this as a product guide, not just a changelog`,
      brief: `## RELEASE NOTE TYPE: BRIEF / PATCH
This is a small, focused change. Write a SHORT, concise release note:
- 2-4 paragraphs maximum
- Get straight to the point — what changed and why
- No lengthy explanations or tutorials
- Perfect for bug fixes, small enhancements, or single-feature patches`,
      standard: `## RELEASE NOTE TYPE: STANDARD
Write a balanced release note that covers all changes with appropriate detail:
- Each major change gets its own section with 2-3 paragraphs
- Include enough detail to understand the change without being exhaustive
- Scale the length proportionally to the amount of Jira context provided`,
    };

    const typeInstruction = noteTypeInstructions[note_type as string] ?? noteTypeInstructions.standard;

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
      `${typeInstruction}\n\n` +
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
