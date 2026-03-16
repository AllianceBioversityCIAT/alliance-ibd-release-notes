"use client";

import { DownloadIcon } from "./icons";

/* ── Simple markdown → HTML converter (covers release note formatting) ── */
function mdToHtml(md: string): string {
  let html = md
    // Images
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Italic
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
    .replace(/_([^_\n]+)_/g, "<em>$1</em>")
    // Headings
    .replace(/^#### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    // Horizontal rules
    .replace(/^(---|\*\*\*|___)$/gm, "<hr />")
    // Blockquotes
    .replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>")
    // Unordered lists
    .replace(/^[-*] (.+)$/gm, "<li>$1</li>")
    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
    // Wrap consecutive <li> in <ul>
    .replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>")
    // Paragraphs: wrap remaining lines
    .replace(/^(?!<[a-z])((?!$).+)$/gm, "<p>$1</p>");

  // Clean up empty paragraphs and consecutive blockquotes
  html = html
    .replace(/<\/blockquote>\n<blockquote>/g, "<br/>")
    .replace(/<p><\/p>/g, "");

  return html;
}

const PDF_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: #1a1a2e;
    line-height: 1.7;
    font-size: 14px;
    max-width: 800px;
    margin: 0 auto;
    padding: 40px;
  }
  h1 { font-size: 26px; font-weight: 700; color: #0f0f23; border-bottom: 3px solid #7c3aed; padding-bottom: 10px; margin-bottom: 8px; }
  h2 { font-size: 20px; font-weight: 600; color: #1e1e38; margin-top: 28px; }
  h3 { font-size: 16px; font-weight: 600; color: #2d2d5e; margin-top: 22px; }
  p { margin: 8px 0; }
  blockquote { border-left: 4px solid #7c3aed; background: #f5f3ff; padding: 12px 16px; margin: 16px 0; border-radius: 0 8px 8px 0; color: #4c1d95; }
  hr { border: none; border-top: 1px solid #e5e7eb; margin: 24px 0; }
  strong { font-weight: 600; color: #0f0f23; }
  ul, ol { padding-left: 24px; margin: 8px 0; }
  li { margin: 4px 0; }
  a { color: #7c3aed; text-decoration: none; }
  img { max-width: 100%; border-radius: 8px; margin: 12px 0; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
  @media print { body { padding: 0; } }
`;

function printToPdf(markdown: string, title?: string) {
  const html = mdToHtml(markdown);
  const doc = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"/>
<title>${title || "Release Note"}</title>
<style>${PDF_CSS}</style>
</head><body>${html}</body></html>`;

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(doc);
  win.document.close();
  // Wait for fonts/images to load, then print
  win.onload = () => {
    setTimeout(() => { win.print(); }, 500);
  };
}

export function PdfButton({ markdown, title }: { markdown: string; title?: string }) {
  return (
    <button
      onClick={() => printToPdf(markdown, title)}
      className="btn-press inline-flex items-center gap-2 rounded-lg border border-card-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-all hover:bg-muted"
    >
      <DownloadIcon className="w-4 h-4" />
      PDF
    </button>
  );
}

/** Compact version for dark flow-node headers */
export function PdfButtonCompact({ markdown, title }: { markdown: string; title?: string }) {
  return (
    <button
      onClick={() => printToPdf(markdown, title)}
      className="flex items-center gap-1 rounded-md bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/70 hover:bg-white/20 hover:text-white transition-colors"
    >
      <DownloadIcon className="w-3 h-3" /> PDF
    </button>
  );
}
