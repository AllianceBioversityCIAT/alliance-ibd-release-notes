"use client";

import { useState, useCallback } from "react";
import { DEFAULTS } from "@/app/lib/constants";
import { fetchJiraContext, fetchCommits, generateReleaseNote } from "@/app/lib/api";
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
  const [issueKey, setIssueKey] = useState("");
  const [owner, setOwner] = useState<string>(DEFAULTS.owner);
  const [repo, setRepo] = useState<string>(DEFAULTS.repo);
  const [branch, setBranch] = useState<string>(DEFAULTS.branch);

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
    setJiraLoading(true);
    setJiraError(null);
    // Cascade reset
    setCommitsResult(null);
    setCommitsError(null);
    setGenerateResult(null);
    setGenerateError(null);
    try {
      const data = await fetchJiraContext(issueKey.trim());
      setJiraResult(data.jira_context);
    } catch (e) {
      setJiraError(e instanceof Error ? e.message : "Failed to fetch Jira context");
    } finally {
      setJiraLoading(false);
    }
  }, [issueKey]);

  const handleFetchCommits = useCallback(async () => {
    setCommitsLoading(true);
    setCommitsError(null);
    // Cascade reset step 3
    setGenerateResult(null);
    setGenerateError(null);
    try {
      const data = await fetchCommits({
        owner,
        repo,
        branch,
        jira_ticket: issueKey.trim(),
      });
      setCommitsResult(data.release_notes_input);
    } catch (e) {
      setCommitsError(e instanceof Error ? e.message : "Failed to fetch commits");
    } finally {
      setCommitsLoading(false);
    }
  }, [owner, repo, branch, issueKey]);

  const handleGenerate = useCallback(async () => {
    setGenerateLoading(true);
    setGenerateError(null);
    setGenerateResult(null);
    try {
      const data = await generateReleaseNote({
        owner,
        repo,
        branch,
        jira_ticket: issueKey.trim(),
      });
      setGenerateResult(data.output);

      // Auto-save to history
      const firstHeading = data.output.match(/^#\s+(.+)$/m)?.[1] || issueKey.trim();
      saveNote({
        jiraKey: issueKey.trim(),
        title: firstHeading,
        markdown: data.output,
      });
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : "Failed to generate release note");
    } finally {
      setGenerateLoading(false);
    }
  }, [owner, repo, branch, issueKey]);

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
            issueKey={issueKey}
            onIssueKeyChange={setIssueKey}
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
            jiraTicket={issueKey}
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
