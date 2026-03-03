"use client";

import { DEFAULTS } from "@/app/lib/constants";
import { LoaderIcon, XIcon, PlusIcon } from "./icons";
import { LoadingSkeleton } from "./loading-skeleton";
import { MarkdownRenderer } from "./markdown-renderer";

interface JiraStepProps {
  issueKeys: string[];
  onIssueKeysChange: (keys: string[]) => void;
  onFetch: () => void;
  loading: boolean;
  error: string | null;
  result: string | null;
}

export function JiraStep({ issueKeys, onIssueKeysChange, onFetch, loading, error, result }: JiraStepProps) {
  const validKeys = issueKeys.filter((k) => k.trim());

  function updateKey(index: number, value: string) {
    const updated = [...issueKeys];
    updated[index] = value.toUpperCase();
    onIssueKeysChange(updated);
  }

  function addKey() {
    onIssueKeysChange([...issueKeys, ""]);
  }

  function removeKey(index: number) {
    if (issueKeys.length === 1) return;
    onIssueKeysChange(issueKeys.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {issueKeys.map((key, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={key}
              onChange={(e) => updateKey(i, e.target.value)}
              placeholder={i === 0 ? DEFAULTS.jiraPlaceholder : "e.g. P2-2161"}
              className="flex-1 rounded-lg border border-card-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-shadow focus:ring-2 focus:ring-ring/30 focus:border-ring"
              onKeyDown={(e) => {
                if (e.key === "Enter" && validKeys.length > 0 && !loading) onFetch();
              }}
            />
            {issueKeys.length > 1 && (
              <button
                onClick={() => removeKey(i)}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-card-border bg-background text-muted-foreground hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors"
                title="Remove"
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}

        {/* Add key button */}
        <button
          onClick={addKey}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-accent transition-colors disabled:opacity-40"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          Add another Jira key
        </button>
      </div>

      <button
        onClick={onFetch}
        disabled={validKeys.length === 0 || loading}
        className="btn-press inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading && <LoaderIcon className="w-4 h-4" />}
        {validKeys.length > 1 ? `Fetch ${validKeys.length} Jira Contexts` : "Fetch Jira Context"}
      </button>

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
