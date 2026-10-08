"use client";

import { LoaderIcon } from "./icons";
import { LoadingSkeleton } from "./loading-skeleton";
import { MarkdownRenderer } from "./markdown-renderer";

interface GitHubStepProps {
  owner: string;
  repo: string;
  branch: string;
  jiraTicket: string;
  onOwnerChange: (v: string) => void;
  onRepoChange: (v: string) => void;
  onBranchChange: (v: string) => void;
  onFetch: () => void;
  loading: boolean;
  error: string | null;
  result: string | null;
}

export function GitHubStep({
  owner, repo, branch, jiraTicket,
  onOwnerChange, onRepoChange, onBranchChange,
  onFetch, loading, error, result,
}: GitHubStepProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Owner</label>
          <input
            type="text"
            value={owner}
            onChange={(e) => onOwnerChange(e.target.value)}
            className="w-full rounded-lg border border-card-border bg-background px-3.5 py-2.5 text-sm text-foreground outline-none transition-shadow focus:ring-2 focus:ring-ring/30 focus:border-ring"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Repository</label>
          <input
            type="text"
            value={repo}
            onChange={(e) => onRepoChange(e.target.value)}
            className="w-full rounded-lg border border-card-border bg-background px-3.5 py-2.5 text-sm text-foreground outline-none transition-shadow focus:ring-2 focus:ring-ring/30 focus:border-ring"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Branch</label>
          <input
            type="text"
            value={branch}
            onChange={(e) => onBranchChange(e.target.value)}
            className="w-full rounded-lg border border-card-border bg-background px-3.5 py-2.5 text-sm text-foreground outline-none transition-shadow focus:ring-2 focus:ring-ring/30 focus:border-ring"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-accent-light px-3 py-1 text-xs font-medium text-accent">
          <span className="opacity-60">Jira:</span> {jiraTicket}
        </div>
        <button
          onClick={onFetch}
          disabled={loading}
          className="btn-press inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading && <LoaderIcon className="w-4 h-4" />}
          Fetch Commits
        </button>
      </div>

      {error && (
        <div className="animate-fade-in rounded-lg border border-error/30 bg-error-light px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      {loading && <LoadingSkeleton lines={8} />}

      {result && !loading && (
        <div className="animate-slide-up rounded-lg border border-card-border bg-muted/50 p-4 sm:p-5">
          <MarkdownRenderer content={result} />
        </div>
      )}
    </div>
  );
}
