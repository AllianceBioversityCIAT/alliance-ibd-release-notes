import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy endpoint for Jira attachments.
 * Downloads the image using Jira credentials and serves it to the browser.
 * GET /api/release-notes/jira-image?url=<encoded_jira_url>
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "url param required" }, { status: 400 });

  // Only allow Jira attachment URLs
  const jiraBase = process.env.JIRA_BASE_URL;
  if (!jiraBase || !url.startsWith(jiraBase)) {
    return NextResponse.json({ error: "Only Jira URLs are allowed" }, { status: 403 });
  }

  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  if (!email || !token) {
    return NextResponse.json({ error: "Jira credentials not configured" }, { status: 500 });
  }

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`,
      },
      redirect: "follow",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Jira responded with ${res.status}` },
        { status: res.status }
      );
    }

    const contentType = res.headers.get("content-type") || "application/octet-stream";
    const buffer = await res.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch from Jira" },
      { status: 500 }
    );
  }
}
