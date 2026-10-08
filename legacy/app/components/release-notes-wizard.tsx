"use client";

import { useState, useCallback } from "react";
import type { LocalMediaItem } from "@/app/lib/types";
import { fetchJiraContext, uploadFilesSequentially } from "@/app/lib/api";
import { saveNote } from "@/app/lib/history";
import { StepIndicator } from "./step-indicator";
import { StepCard } from "./step-card";
import { JiraStep } from "./jira-step";
import { GenerateStep } from "./generate-step";
import { HistoryPanel } from "./history-panel";
import { HistoryIcon } from "./icons";

export function ReleaseNotesWizard() {
  // Form state
  const [issueKeys, setIssueKeys] = useState<string[]>([""]);

  // Media (local files, not yet uploaded)
  const [media, setMedia] = useState<LocalMediaItem[]>([]);

  // Step 1
  const [jiraLoading, setJiraLoading] = useState(false);
  const [jiraError, setJiraError] = useState<string | null>(null);
  const [jiraResult, setJiraResult] = useState<string | null>(null);

  // Step 2
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateResult, setGenerateResult] = useState<string | null>(null);

  // History
  const [historyOpen, setHistoryOpen] = useState(false);

  // Derived
  const completedSteps = new Set<number>();
  if (jiraResult) completedSteps.add(1);
  if (generateResult) completedSteps.add(2);

  const currentStep = generateResult ? 2 : jiraResult ? 2 : 1;

  const handleFetchJira = useCallback(async () => {
    const validKeys = issueKeys.filter((k) => k.trim());
    setJiraLoading(true);
    setJiraError(null);
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

  const handleGenerate = useCallback(async () => {
    setGenerateLoading(true);
    setGenerateError(null);
    setGenerateResult(null);
    try {
      const files = media.map((m) => m.file);
      const urls = files.length > 0 ? await uploadFilesSequentially(files) : [];
      const mediaPayload = urls.map((url, i) => ({
        url,
        ai_context: media[i]?.ai_context || "",
      }));

      const validKeys = issueKeys.filter((k) => k.trim());
      const primaryKey = validKeys[0] ?? "";

      const res = await fetch("/api/release-notes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jira_tickets: validKeys, media: mediaPayload }),
      });
      const data = await res.json();
      setGenerateResult(data.output);

      const firstHeading = data.output?.match(/^#\s+(.+)$/m)?.[1] || primaryKey;
      saveNote({ jiraKey: primaryKey, title: firstHeading, markdown: data.output });
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : "Failed to generate release note");
    } finally {
      setGenerateLoading(false);
    }
  }, [issueKeys, media]);

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
          title="Generate Release Note"
          description="AI-powered blog post from Jira data"
          stepNumber={2}
          isActive={!!jiraResult}
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
