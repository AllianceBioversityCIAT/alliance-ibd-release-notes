import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

function FigmaEmbed({ url }: { url: string }) {
  const embedUrl = `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(url)}`;
  return (
    <span className="block my-4 rounded-lg overflow-hidden border border-card-border bg-muted">
      <span className="flex items-center gap-2 px-3 py-1.5 bg-muted border-b border-card-border">
        <svg className="w-4 h-4 text-purple-500" viewBox="0 0 38 57" fill="currentColor">
          <path d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z" />
          <path d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z" />
          <path d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19z" />
          <path d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z" />
          <path d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z" />
        </svg>
        <span className="text-xs font-medium text-foreground/70">Figma Preview</span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-[10px] text-accent hover:underline"
        >
          Open in Figma ↗
        </a>
      </span>
      <iframe
        src={embedUrl}
        className="w-full border-0"
        style={{ height: 400 }}
        allowFullScreen
        loading="lazy"
      />
    </span>
  );
}

const FigmaIcon = () => (
  <svg className="inline-block w-3.5 h-3.5 mr-1 -mt-0.5 text-purple-500" viewBox="0 0 38 57" fill="currentColor">
    <path d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z" />
    <path d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z" />
    <path d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19z" />
    <path d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z" />
    <path d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z" />
  </svg>
);

const markdownComponents: Components = {
  a: ({ href, children, ...props }) => {
    // Detect [figma-embed](url) → render inline iframe
    const childText = typeof children === "string" ? children : "";
    if (childText === "figma-embed" && href && /figma\.com/.test(href)) {
      return <FigmaEmbed url={href} />;
    }
    // Regular Figma link → add icon
    const isFigma = href && /figma\.com/.test(href);
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
        {isFigma && <FigmaIcon />}
        {children}
      </a>
    );
  },
};

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="prose prose-sm max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-a:text-accent prose-a:no-underline hover:prose-a:underline prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm prose-code:before:content-none prose-code:after:content-none prose-pre:bg-muted prose-pre:border prose-pre:border-card-border prose-img:rounded-lg prose-img:border prose-img:border-card-border prose-blockquote:border-accent prose-blockquote:not-italic prose-table:text-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
