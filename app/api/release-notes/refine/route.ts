import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SYSTEM_MESSAGE = `You are editing an existing release note for PRMS (Performance and Results Management System) at CGIAR.

## Your job
The user will give you the current release note markdown and an instruction to modify it. Apply the requested change and return the COMPLETE updated markdown.

## Rules
- Return ONLY the full updated markdown — no explanations, no preamble, no "Here's the updated version"
- Only change what the user asks for — preserve everything else exactly as-is
- Maintain the same formatting, style, headings structure, and tone
- Do NOT add emojis
- Do NOT add content the user didn't ask for
- Do NOT remove content the user didn't ask to remove
- If the user provides images with placement instructions, insert them as markdown images at the specified location
- If the user says "add this image after section X", place \`![description](url)\` right after that section
- If the user's instruction is ambiguous about image placement, place images where they make the most contextual sense based on the surrounding content

## Image handling
When images are provided:
- Insert them as \`![Image](url)\` in the markdown
- If the user specifies a location, put them there
- If the user gives context about what the image shows, use that as the alt text and optionally add a brief caption below
- If Jira context is available, relate the image description to the Jira context (same golden rule as the original generation)`;

export async function POST(req: NextRequest) {
  try {
    const { markdown, instruction, media, jira_context } = await req.json();

    if (!markdown || !instruction) {
      return NextResponse.json(
        { error: "markdown and instruction are required" },
        { status: 400 }
      );
    }

    let mediaSection = "";
    if (media?.length > 0) {
      const lines = (media as Array<{ url: string; ai_context: string }>).map(
        (m, i) => {
          const ctx = m.ai_context?.trim();
          return ctx
            ? `Image ${i + 1}: ${m.url}\n  Context: ${ctx}`
            : `Image ${i + 1}: ${m.url}`;
        }
      );
      mediaSection = `\n\n## New images to integrate\n${lines.join("\n\n")}`;
    }

    const userPrompt =
      `## Current release note\n\`\`\`markdown\n${markdown}\n\`\`\`\n\n` +
      `## Instruction\n${instruction}` +
      mediaSection +
      (jira_context ? `\n\n## Jira context (for reference)\n${jira_context}` : "");

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
        Connection: "keep-alive",
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
