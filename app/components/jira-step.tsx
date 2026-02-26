"use client";

import { DEFAULTS } from "@/app/lib/constants";
import { LoaderIcon } from "./icons";
import { LoadingSkeleton } from "./loading-skeleton";
import { MarkdownRenderer } from "./markdown-renderer";

interface JiraStepProps {
  issueKey: string;
  onIssueKeyChange: (v: string) => void;
  onFetch: () => void;
  loading: boolean;
  error: string | null;
  result: string | null;
}

export function JiraStep({ issueKey, onIssueKeyChange, onFetch, loading, error, result }: JiraStepProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={issueKey}
          onChange={(e) => onIssueKeyChange(e.target.value.toUpperCase())}
          placeholder={DEFAULTS.jiraPlaceholder}
          className="flex-1 rounded-lg border border-card-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-shadow focus:ring-2 focus:ring-ring/30 focus:border-ring"
          onKeyDown={(e) => {
            if (e.key === "Enter" && issueKey.trim() && !loading) onFetch();
          }}
        />
        <button
          onClick={onFetch}
          disabled={!issueKey.trim() || loading}
          className="btn-press inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading && <LoaderIcon className="w-4 h-4" />}
          Fetch Jira Context
        </button>
      </div>

      {error && (
        <div className="animate-fade-in rounded-lg border border-error/30 bg-error-light px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      {loading && <LoadingSkeleton lines={6} />}

      {result && !loading && (
        <div className="animate-slide-up rounded-lg border border-card-border bg-muted/50 p-4 sm:p-5">
          <MarkdownRenderer content={result} />
        </div>
      )}
    </div>
  );
}
