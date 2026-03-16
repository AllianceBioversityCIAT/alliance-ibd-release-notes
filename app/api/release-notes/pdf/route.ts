import { NextRequest, NextResponse } from "next/server";
import { mdToPdf } from "md-to-pdf";

export const dynamic = "force-dynamic";

const PDF_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: #1a1a2e;
    line-height: 1.7;
    font-size: 14px;
    max-width: 100%;
  }

  h1 {
    font-size: 26px;
    font-weight: 700;
    color: #0f0f23;
    border-bottom: 3px solid #7c3aed;
    padding-bottom: 10px;
    margin-bottom: 8px;
  }

  h2 {
    font-size: 20px;
    font-weight: 600;
    color: #1e1e38;
    margin-top: 28px;
  }

  h3 {
    font-size: 16px;
    font-weight: 600;
    color: #2d2d5e;
    margin-top: 22px;
  }

  p {
    margin: 8px 0;
  }

  blockquote {
    border-left: 4px solid #7c3aed;
    background: #f5f3ff;
    padding: 12px 16px;
    margin: 16px 0;
    border-radius: 0 8px 8px 0;
    color: #4c1d95;
    font-style: normal;
  }

  hr {
    border: none;
    border-top: 1px solid #e5e7eb;
    margin: 24px 0;
  }

  strong {
    font-weight: 600;
    color: #0f0f23;
  }

  ul, ol {
    padding-left: 24px;
    margin: 8px 0;
  }

  li {
    margin: 4px 0;
  }

  a {
    color: #7c3aed;
    text-decoration: none;
  }

  img {
    max-width: 100%;
    border-radius: 8px;
    margin: 12px 0;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  }

  code {
    background: #f3f4f6;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 13px;
  }

  pre {
    background: #1e1e38;
    color: #e2e8f0;
    padding: 16px;
    border-radius: 8px;
    overflow-x: auto;
    font-size: 13px;
  }

  pre code {
    background: none;
    padding: 0;
    color: inherit;
  }
`;

export async function POST(req: NextRequest) {
  try {
    const { markdown, title } = await req.json();

    if (!markdown) {
      return NextResponse.json({ error: "No markdown provided" }, { status: 400 });
    }

    const result = await mdToPdf(
      { content: markdown },
      {
        css: PDF_CSS,
        pdf_options: {
          format: "A4",
          margin: { top: "20mm", bottom: "20mm", left: "18mm", right: "18mm" },
          printBackground: true,
        },
        launch_options: {
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        },
      }
    );

    const safeTitle = (title || "release-note")
      .replace(/[^a-zA-Z0-9\s-_]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 80);

    return new NextResponse(new Uint8Array(result.content), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeTitle}.pdf"`,
      },
    });
  } catch (e) {
    console.error("PDF generation error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to generate PDF" },
      { status: 500 }
    );
  }
}
