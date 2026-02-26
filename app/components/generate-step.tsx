"use client";

import { SparklesIcon, LoaderIcon } from "./icons";
import { GenerateLoadingSkeleton } from "./loading-skeleton";
import { MarkdownRenderer } from "./markdown-renderer";
import { CopyButton } from "./copy-button";

interface GenerateStepProps {
  onGenerate: () => void;
  loading: boolean;
  error: string | null;
  result: string | null;
}

export function GenerateStep({ onGenerate, loading, error, result }: GenerateStepProps) {
  return (
    <div className="space-y-4">
      {!result && !loading && (
        <button
          onClick={onGenerate}
          disabled={loading}
          className="btn-press inline-flex w-full items-center justify-center gap-2.5 rounded-lg bg-accent px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <SparklesIcon className="w-5 h-5" />
          Generate Release Note
        </button>
      )}

      {loading && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-lg border border-accent/30 bg-accent-light px-4 py-3">
            <LoaderIcon className="w-5 h-5 text-accent" />
            <span className="text-sm font-medium text-accent">
              Generating your release note... This may take up to 30 seconds.
            </span>
          </div>
          <GenerateLoadingSkeleton />
        </div>
      )}

      {error && (
        <div className="animate-fade-in rounded-lg border border-error/30 bg-error-light px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      {result && !loading && (
        <div className="animate-slide-up space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-success" />
              <span className="text-sm font-medium text-success">Release note generated</span>
            </div>
            <CopyButton text={result} />
          </div>
          <div className="rounded-lg border border-card-border bg-muted/50 p-5 sm:p-6">
            <MarkdownRenderer content={result} />
          </div>
          <button
            onClick={onGenerate}
            className="btn-press inline-flex items-center gap-2 rounded-lg border border-card-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-all hover:bg-muted"
          >
            <SparklesIcon className="w-4 h-4" />
            Regenerate
          </button>
        </div>
      )}
    </div>
  );
}
