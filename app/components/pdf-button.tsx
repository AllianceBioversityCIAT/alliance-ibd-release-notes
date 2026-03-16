"use client";

import { useState } from "react";
import { DownloadIcon, LoaderIcon, CheckIcon } from "./icons";
import { downloadPDF } from "@/app/lib/api";

export function PdfButton({ markdown, title }: { markdown: string; title?: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");

  async function handleDownload() {
    setState("loading");
    try {
      await downloadPDF(markdown, title);
      setState("done");
      setTimeout(() => setState("idle"), 2000);
    } catch (e) {
      console.error("PDF download failed:", e);
      setState("idle");
    }
  }

  return (
    <button
      onClick={handleDownload}
      disabled={state === "loading"}
      className="btn-press inline-flex items-center gap-2 rounded-lg border border-card-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-all hover:bg-muted disabled:opacity-50"
    >
      {state === "loading" ? (
        <>
          <LoaderIcon className="w-4 h-4" />
          Generating...
        </>
      ) : state === "done" ? (
        <>
          <CheckIcon className="w-4 h-4 text-success" />
          Downloaded!
        </>
      ) : (
        <>
          <DownloadIcon className="w-4 h-4" />
          PDF
        </>
      )}
    </button>
  );
}

/** Compact version for dark flow-node headers */
export function PdfButtonCompact({ markdown, title }: { markdown: string; title?: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");

  async function handleDownload() {
    setState("loading");
    try {
      await downloadPDF(markdown, title);
      setState("done");
      setTimeout(() => setState("idle"), 2000);
    } catch (e) {
      console.error("PDF download failed:", e);
      setState("idle");
    }
  }

  return (
    <button
      onClick={handleDownload}
      disabled={state === "loading"}
      className="flex items-center gap-1 rounded-md bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/70 hover:bg-white/20 hover:text-white transition-colors disabled:opacity-50"
    >
      {state === "loading" ? (
        <><LoaderIcon className="w-3 h-3" /> PDF...</>
      ) : state === "done" ? (
        <><CheckIcon className="w-3 h-3 text-emerald-400" /> Done</>
      ) : (
        <><DownloadIcon className="w-3 h-3" /> PDF</>
      )}
    </button>
  );
}
