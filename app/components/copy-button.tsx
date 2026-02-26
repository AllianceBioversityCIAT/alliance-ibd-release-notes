"use client";

import { useState } from "react";
import { ClipboardIcon, CheckIcon } from "./icons";

export function CopyButton({ text, label = "Copy Markdown" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className="btn-press inline-flex items-center gap-2 rounded-lg border border-card-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-all hover:bg-muted"
    >
      {copied ? (
        <>
          <CheckIcon className="w-4 h-4 text-success" />
          Copied!
        </>
      ) : (
        <>
          <ClipboardIcon />
          {label}
        </>
      )}
    </button>
  );
}
