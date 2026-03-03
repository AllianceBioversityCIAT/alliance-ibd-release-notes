"use client";

import { useState, useCallback } from "react";
import { DEFAULTS } from "@/app/lib/constants";
import type { LocalMediaItem } from "@/app/lib/types";
import { fetchJiraContext, fetchCommits, generateReleaseNote, uploadFilesSequentially } from "@/app/lib/api";
import { saveNote } from "@/app/lib/history";
import { StepIndicator } from "./step-indicator";
import { StepCard } from "./step-card";
import { JiraStep } from "./jira-step";
import { GitHubStep } from "./github-step";
import { GenerateStep } from "./generate-step";
import { HistoryPanel } from "./history-panel";
import { HistoryIcon } from "./icons";

export function ReleaseNotesWizard() {
  // Form state
  const [issueKeys, setIssueKeys] = useState<string[]>([""]);
  const [owner, setOwner] = useState<string>(DEFAULTS.owner);
  const [repo, setRepo] = useState<string>(DEFAULTS.repo);
  const [branch, setBranch] = useState<string>(DEFAULTS.branch);

  // Media (local files, not yet uploaded)
  const [media, setMedia] = useState<LocalMediaItem[]>([]);

  // Step 1
  const [jiraLoading, setJiraLoading] = useState(false);
  const [jiraError, setJiraError] = useState<string | null>(null);
  const [jiraResult, setJiraResult] = useState<string | null>(null);

  // Step 2
  const [commitsLoading, setCommitsLoading] = useState(false);
  const [commitsError, setCommitsError] = useState<string | null>(null);
  const [commitsResult, setCommitsResult] = useState<string | null>(null);

  // Step 3
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateResult, setGenerateResult] = useState<string | null>(null);

  // History
  const [historyOpen, setHistoryOpen] = useState(false);

  // Derived
  const completedSteps = new Set<number>();
  if (jiraResult) completedSteps.add(1);
  if (commitsResult) completedSteps.add(2);
  if (generateResult) completedSteps.add(3);

  const currentStep = generateResult ? 3 : commitsResult ? 3 : jiraResult ? 2 : 1;

  const handleFetchJira = useCallback(async () => {
    const validKeys = issueKeys.filter((k) => k.trim());
    setJiraLoading(true);
    setJiraError(null);
    setCommitsResult(null);
    setCommitsError(null);
    setGenerateResult(null);
    setGenerateError(null);
    try {
      const data = await fetchJiraContext(validKeys);
      setJiraResult(data.jira_context);
    } catch (e) {
      setJiraError(e instanceof Error ? e.message : "Failed to fetch Jira context");
    } finally {
      setJiraLoading(false);
    }
  }, [issueKeys]);

  const handleFetchCommits = useCallback(async () => {
    setCommitsLoading(true);
    setCommitsError(null);
    setGenerateResult(null);
    setGenerateError(null);
    try {
      const data = await fetchCommits({
        owner,
        repo,
        branch,
        jira_ticket: issueKeys[0]?.trim() ?? "",
      });
      setCommitsResult(data.release_notes_input);
    } catch (e) {
      setCommitsError(e instanceof Error ? e.message : "Failed to fetch commits");
    } finally {
      setCommitsLoading(false);
    }
  }, [owner, repo, branch, issueKeys]);

  const handleGenerate = useCallback(async () => {
    setGenerateLoading(true);
    setGenerateError(null);
    setGenerateResult(null);
    try {
      // 1. Upload files to S3 sequentially
      const files = media.map((m) => m.file);
      const urls = files.length > 0 ? await uploadFilesSequentially(files) : [];

      // 2. Build media array with S3 URLs + AI context
      const mediaPayload = urls.map((url, i) => ({
        url,
        ai_context: media[i]?.ai_context || "",
      }));

      // 3. Generate release note
      const validKeys = issueKeys.filter((k) => k.trim());
      const primaryKey = validKeys[0] ?? "";
      const data = await generateReleaseNote({
        owner,
        repo,
        branch,
        jira_tickets: validKeys,
        media: mediaPayload,
      });
      setGenerateResult(data.output);

      const firstHeading = data.output.match(/^#\s+(.+)$/m)?.[1] || primaryKey;
      saveNote({
        jiraKey: primaryKey,
        title: firstHeading,
        markdown: data.output,
      });
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : "Failed to generate release note");
    } finally {
      setGenerateLoading(false);
    }
  }, [owner, repo, branch, issueKeys, media]);

  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <div />
        <StepIndicator currentStep={currentStep} completedSteps={completedSteps} />
        <button
          onClick={() => setHistoryOpen(true)}
          className="btn-press rounded-lg border border-card-border bg-card p-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Saved release notes"
        >
          <HistoryIcon className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-5">
        <StepCard
          title="Jira Context"
          description="Fetch ticket details and context from Jira"
          stepNumber={1}
          isActive={true}
          isCompleted={!!jiraResult}
        >
          <JiraStep
            issueKeys={issueKeys}
            onIssueKeysChange={setIssueKeys}
            onFetch={handleFetchJira}
            loading={jiraLoading}
            error={jiraError}
            result={jiraResult}
          />
        </StepCard>

        <StepCard
          title="GitHub Commits"
          description="Gather commit history filtered by Jira ticket"
          stepNumber={2}
          isActive={!!jiraResult}
          isCompleted={!!commitsResult}
        >
          <GitHubStep
            owner={owner}
            repo={repo}
            branch={branch}
            jiraTicket={issueKeys[0] ?? ""}
            onOwnerChange={setOwner}
            onRepoChange={setRepo}
            onBranchChange={setBranch}
            onFetch={handleFetchCommits}
            loading={commitsLoading}
            error={commitsError}
            result={commitsResult}
          />
        </StepCard>

        <StepCard
          title="Generate Release Note"
          description="AI-powered blog post from Jira and GitHub data"
          stepNumber={3}
          isActive={!!commitsResult}
          isCompleted={!!generateResult}
        >
          <GenerateStep
            media={media}
            onMediaChange={setMedia}
            onGenerate={handleGenerate}
            loading={generateLoading}
            error={generateError}
            result={generateResult}
          />
        </StepCard>
      </div>

      <HistoryPanel open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </>
  );
}
