"use client";

import { useState, useCallback, useEffect, useRef, Fragment } from "react";
import dynamic from "next/dynamic";
import { DEFAULTS, DEFAULT_MEDIA } from "@/app/lib/constants";
import type { MediaItem } from "@/app/lib/types";
import { fetchJiraContext, fetchCommits, generateReleaseNote } from "@/app/lib/api";
import { saveNote } from "@/app/lib/history";
import { JiraStep } from "./jira-step";
import { GitHubStep } from "./github-step";
import { GenerateStep } from "./generate-step";
import { HistoryPanel } from "./history-panel";
import { HistoryIcon, CheckIcon } from "./icons";
import { JiraIcon, GitHubIcon, AIIcon, GridIcon, FocusIcon } from "./brand-icons";
import { PanoramicView } from "./panoramic-view";
import { WorkspaceView } from "./workspace-view";
import type { ParticleState } from "./three/particle-field";

const ParticleScene = dynamic(
  () => import("./three/particle-background").then((m) => m.ParticleScene),
  { ssr: false }
);

type ViewMode = "panoramic" | "workspace";

export function ImmersiveWizard() {
  // Form state
  const [issueKey, setIssueKey] = useState("");
  const [owner, setOwner] = useState<string>(DEFAULTS.owner);
  const [repo, setRepo] = useState<string>(DEFAULTS.repo);
  const [branch, setBranch] = useState<string>(DEFAULTS.branch);
  const [media, setMedia] = useState<MediaItem[]>(DEFAULT_MEDIA.map((m) => ({ ...m })));

  // Steps
  const [jiraLoading, setJiraLoading] = useState(false);
  const [jiraError, setJiraError] = useState<string | null>(null);
  const [jiraResult, setJiraResult] = useState<string | null>(null);

  const [commitsLoading, setCommitsLoading] = useState(false);
  const [commitsError, setCommitsError] = useState<string | null>(null);
  const [commitsResult, setCommitsResult] = useState<string | null>(null);

  const [generateLoading, setGenerateLoading] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateResult, setGenerateResult] = useState<string | null>(null);

  // UI
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("panoramic");
  const [activeStep, setActiveStep] = useState(1);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });

  // Mouse tracking (state for particles, ref for background)
  const mouseTargetRef = useRef({ x: 0, y: 0 });
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const mx = (e.clientX / window.innerWidth) * 2 - 1;
      const my = -(e.clientY / window.innerHeight) * 2 + 1;
      setMouse({ x: mx, y: my });
      mouseTargetRef.current = { x: mx, y: my };
    }
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  // Smooth panoramic background animation (GPU-accelerated)
  const bgElRef = useRef<HTMLDivElement>(null);
  const bgSmoothRef = useRef({ x: 0, y: 0 });
  useEffect(() => {
    let raf: number;
    let t = 0;
    function animate() {
      t += 0.0008;
      // Smooth lerp toward mouse (low factor = cinematic lag)
      bgSmoothRef.current.x += (mouseTargetRef.current.x - bgSmoothRef.current.x) * 0.018;
      bgSmoothRef.current.y += (mouseTargetRef.current.y - bgSmoothRef.current.y) * 0.018;

      if (bgElRef.current) {
        // Mouse-driven pan (wide horizontal for panorama)
        const autoX = Math.sin(t * 0.6) * 20;
        const autoY = Math.cos(t * 0.4) * 10;
        const tx = bgSmoothRef.current.x * -120 + autoX;
        const ty = bgSmoothRef.current.y * 40 + autoY;
        const scale = 1.18 + Math.sin(t * 0.25) * 0.025;
        bgElRef.current.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`;
      }
      raf = requestAnimationFrame(animate);
    }
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Refs
  const contentRef = useRef<HTMLElement>(null);

  function handleStepChange(step: number) {
    setActiveStep(step);
    contentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Derived
  const completedSteps = new Set<number>();
  if (jiraResult) completedSteps.add(1);
  if (commitsResult) completedSteps.add(2);
  if (generateResult) completedSteps.add(3);

  const particleState: ParticleState = generateLoading
    ? "ai-generating"
    : commitsLoading
    ? "commits-loading"
    : jiraLoading
    ? "jira-loading"
    : generateResult
    ? "complete"
    : "idle";

  // Handlers
  const handleFetchJira = useCallback(async () => {
    setJiraLoading(true);
    setJiraError(null);
    setCommitsResult(null);
    setCommitsError(null);
    setGenerateResult(null);
    setGenerateError(null);
    try {
      const data = await fetchJiraContext(issueKey.trim());
      setJiraResult(data.jira_context);
      setActiveStep(2);
    } catch (e) {
      setJiraError(e instanceof Error ? e.message : "Failed to fetch Jira context");
    } finally {
      setJiraLoading(false);
    }
  }, [issueKey]);

  const handleFetchCommits = useCallback(async () => {
    setCommitsLoading(true);
    setCommitsError(null);
    setGenerateResult(null);
    setGenerateError(null);
    try {
      const data = await fetchCommits({ owner, repo, branch, jira_ticket: issueKey.trim() });
      setCommitsResult(data.release_notes_input);
      setActiveStep(3);
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
        media: media.filter((m) => m.url.trim()),
      });
      setGenerateResult(data.output);
      const firstHeading = data.output.match(/^#\s+(.+)$/m)?.[1] || issueKey.trim();
      saveNote({ jiraKey: issueKey.trim(), title: firstHeading, markdown: data.output });
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : "Failed to generate release note");
    } finally {
      setGenerateLoading(false);
    }
  }, [owner, repo, branch, issueKey, media]);

  // Step nav icons
  const steps = [
    { num: 1, icon: <JiraIcon className="w-4 h-4" />, label: "Jira", color: "#0052CC" },
    { num: 2, icon: <GitHubIcon className="w-4 h-4" />, label: "GitHub", color: "#24292e" },
    { num: 3, icon: <AIIcon className="w-4 h-4" />, label: "Generate", color: "#7c3aed" },
  ];

  // Panel configs (shared between panoramic and workspace)
  const panelConfigs: [
    { icon: React.ReactNode; color: string; title: string; subtitle: string; isLocked: boolean; isComplete: boolean; content: React.ReactNode },
    { icon: React.ReactNode; color: string; title: string; subtitle: string; isLocked: boolean; isComplete: boolean; content: React.ReactNode },
    { icon: React.ReactNode; color: string; title: string; subtitle: string; isLocked: boolean; isComplete: boolean; content: React.ReactNode },
  ] = [
    {
      icon: <JiraIcon className="w-4 h-4" />,
      color: "#0052CC",
      title: "Jira Context",
      subtitle: "Fetch ticket details and context",
      isLocked: false,
      isComplete: !!jiraResult,
      content: (
        <JiraStep
          issueKey={issueKey}
          onIssueKeyChange={setIssueKey}
          onFetch={handleFetchJira}
          loading={jiraLoading}
          error={jiraError}
          result={jiraResult}
        />
      ),
    },
    {
      icon: <GitHubIcon className="w-4 h-4" />,
      color: "#24292e",
      title: "GitHub Commits",
      subtitle: "Gather commit history",
      isLocked: !jiraResult,
      isComplete: !!commitsResult,
      content: (
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
      ),
    },
    {
      icon: <AIIcon className="w-4 h-4" />,
      color: "#7c3aed",
      title: "Generate Release Note",
      subtitle: "AI-powered blog post",
      isLocked: !commitsResult,
      isComplete: !!generateResult,
      content: (
        <GenerateStep
          media={media}
          onMediaChange={setMedia}
          onGenerate={handleGenerate}
          loading={generateLoading}
          error={generateError}
          result={generateResult}
        />
      ),
    },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Panoramic landscape background - oversized for pan room */}
      <div className="fixed inset-0 z-0 overflow-hidden">
        <div
          ref={bgElRef}
          className="absolute will-change-transform"
          style={{
            inset: "-80px",
            backgroundImage: "url('/art-rural-landscape-field-grass-summer-time-country-side.jpg')",
            backgroundSize: "cover",
            backgroundPosition: "center 35%",
          }}
        />
      </div>
      {/* Dark gradient overlay for readability */}
      <div
        className="fixed inset-0 z-[1] pointer-events-none"
        style={{
          background: `
            linear-gradient(180deg, rgba(5,14,8,0.65) 0%, rgba(5,14,8,0.35) 30%, rgba(5,14,8,0.40) 60%, rgba(5,14,8,0.75) 100%),
            radial-gradient(ellipse at 50% 0%, rgba(16,185,129,0.06) 0%, transparent 60%)
          `,
        }}
      />

      {/* Particle overlay - renders ON TOP of HTML, pointer-events: none */}
      <ParticleScene state={particleState} mouse={mouse} />

      {/* Nav */}
      <nav className="glass-nav sticky top-0 z-40">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600">
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <path d="M14 2v6h6" />
              </svg>
            </div>
            <span className="hidden text-sm font-semibold text-white/90 sm:block">Release Notes</span>
          </div>

          {/* Step Nav */}
          <div className="flex items-center">
            {steps.map((step, i) => {
              const isComplete = completedSteps.has(step.num);
              const isCurrent = activeStep === step.num;
              const isUnlocked = step.num === 1 || completedSteps.has(step.num - 1);

              return (
                <Fragment key={step.num}>
                  <button
                    onClick={() => isUnlocked && handleStepChange(step.num)}
                    className={`flex flex-col items-center gap-1 transition-opacity ${
                      isUnlocked ? "cursor-pointer" : "cursor-not-allowed opacity-30"
                    }`}
                  >
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-300 ${
                        isComplete
                          ? "bg-emerald-500/20 ring-1 ring-emerald-500/30"
                          : isCurrent
                          ? "bg-white/15 ring-2 ring-white/20 shadow-[0_0_15px_rgba(255,255,255,0.1)]"
                          : "bg-white/5"
                      }`}
                    >
                      {isComplete ? (
                        <CheckIcon className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <span className={isCurrent ? "text-white" : "text-white/50"}>
                          {step.icon}
                        </span>
                      )}
                    </div>
                    <span className={`text-[10px] font-medium ${isCurrent ? "text-white/80" : "text-white/40"}`}>
                      {step.label}
                    </span>
                  </button>
                  {i < steps.length - 1 && (
                    <div
                      className={`mx-2 mb-4 h-px w-6 sm:w-10 rounded-full transition-colors ${
                        isComplete ? "bg-emerald-500/40" : "bg-white/10"
                      }`}
                    />
                  )}
                </Fragment>
              );
            })}
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            {/* View toggle - desktop only */}
            <button
              onClick={() => setViewMode(viewMode === "panoramic" ? "workspace" : "panoramic")}
              className="hidden sm:flex items-center gap-1.5 rounded-lg bg-white/8 px-3 py-2 text-[11px] font-medium text-white/60 hover:bg-white/12 hover:text-white/80 transition-colors"
            >
              {viewMode === "panoramic" ? (
                <>
                  <GridIcon className="w-3.5 h-3.5" /> Workspace
                </>
              ) : (
                <>
                  <FocusIcon className="w-3.5 h-3.5" /> Focus
                </>
              )}
            </button>
            <button
              onClick={() => setHistoryOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/8 text-white/50 hover:bg-white/12 hover:text-white/80 transition-colors"
              title="Saved release notes"
            >
              <HistoryIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main ref={contentRef} className="relative z-10 mx-auto max-w-5xl px-2 py-6 sm:px-4 sm:py-8">
        {viewMode === "panoramic" ? (
          <PanoramicView
            activeStep={activeStep}
            particleState={particleState}
            panels={panelConfigs}
            onStepChange={handleStepChange}
          />
        ) : (
          <WorkspaceView
            panels={panelConfigs}
            onResetView={() => setViewMode("panoramic")}
          />
        )}
      </main>

      {/* Loading overlay - icon + text in center of leaf whirlwind */}
      {(jiraLoading || commitsLoading || generateLoading) && (
        <div className="fixed inset-0 z-[15] pointer-events-none flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 animate-fade-in">
            {/* Spinning icon ring */}
            <div className="relative flex items-center justify-center">
              {/* Outer rotating ring */}
              <div
                className="absolute h-24 w-24 rounded-full border-2 border-transparent animate-spin"
                style={{
                  borderTopColor: jiraLoading
                    ? "#2684FF"
                    : commitsLoading
                    ? "#8b949e"
                    : "#a855f7",
                  borderRightColor: jiraLoading
                    ? "#0052CC40"
                    : commitsLoading
                    ? "#8b949e40"
                    : "#a855f740",
                  animationDuration: generateLoading ? "1s" : "1.5s",
                }}
              />
              {/* Inner pulsing glow */}
              <div
                className="absolute h-20 w-20 rounded-full loading-icon-pulse"
                style={{
                  background: `radial-gradient(circle, ${
                    jiraLoading
                      ? "rgba(0,82,204,0.2)"
                      : commitsLoading
                      ? "rgba(139,148,158,0.15)"
                      : "rgba(168,85,247,0.25)"
                  } 0%, transparent 70%)`,
                }}
              />
              {/* Brand icon */}
              <div
                className="relative flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-2xl loading-icon-bounce"
                style={{
                  background: `linear-gradient(135deg, ${
                    jiraLoading
                      ? "#0052CC, #2684FF"
                      : commitsLoading
                      ? "#24292e, #444d56"
                      : "#7c3aed, #a855f7"
                  })`,
                  boxShadow: `0 0 40px ${
                    jiraLoading
                      ? "rgba(0,82,204,0.4)"
                      : commitsLoading
                      ? "rgba(139,148,158,0.3)"
                      : "rgba(168,85,247,0.5)"
                  }`,
                }}
              >
                {jiraLoading && <JiraIcon className="w-7 h-7" />}
                {commitsLoading && <GitHubIcon className="w-7 h-7" />}
                {generateLoading && <AIIcon className="w-7 h-7" />}
              </div>
            </div>
            {/* Loading text */}
            <div className="flex flex-col items-center gap-1.5">
              <p className="text-sm font-semibold text-white/90 tracking-wide">
                {jiraLoading && "Fetching Jira Context"}
                {commitsLoading && "Fetching Commits"}
                {generateLoading && "Generating Release Note"}
              </p>
              <p className="text-xs text-white/50">
                {jiraLoading && "Connecting to Jira API..."}
                {commitsLoading && "Scanning repository history..."}
                {generateLoading && "AI is writing your blog post..."}
              </p>
              {/* Animated dots */}
              <div className="flex gap-1.5 mt-1">
                <span className="loading-dot h-1.5 w-1.5 rounded-full bg-white/60" style={{ animationDelay: "0ms" }} />
                <span className="loading-dot h-1.5 w-1.5 rounded-full bg-white/60" style={{ animationDelay: "150ms" }} />
                <span className="loading-dot h-1.5 w-1.5 rounded-full bg-white/60" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI generating glow */}
      {particleState === "ai-generating" && (
        <div className="fixed inset-0 z-0 pointer-events-none ai-glow-overlay" />
      )}

      <HistoryPanel open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </div>
  );
}
