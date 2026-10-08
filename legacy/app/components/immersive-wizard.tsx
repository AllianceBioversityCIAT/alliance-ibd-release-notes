"use client";

import { useState, useCallback, useEffect, useRef, Fragment } from "react";
import dynamic from "next/dynamic";
import type { LocalMediaItem } from "@/app/lib/types";
import { fetchJiraContext, streamReleaseNote, uploadFilesSequentially } from "@/app/lib/api";
import { saveNote } from "@/app/lib/history";
import { JiraStep } from "./jira-step";
import { GenerateStep } from "./generate-step";
import { HistoryPanel } from "./history-panel";
import { HistoryIcon, CheckIcon, XIcon, SparklesIcon, EditIcon } from "./icons";
import { MarkdownRenderer } from "./markdown-renderer";
import { MarkdownEditorView } from "./markdown-editor";
import { CopyButton } from "./copy-button";
import { JiraIcon, AIIcon, GridIcon, FocusIcon, FlowIcon } from "./brand-icons";
import { PanoramicView } from "./panoramic-view";
import { WorkspaceView } from "./workspace-view";
import type { ParticleState } from "./three/particle-field";

const FlowView = dynamic(
  () => import("./flow-view").then((m) => m.FlowView),
  { ssr: false }
);


const ParticleScene = dynamic(
  () => import("./three/particle-background").then((m) => m.ParticleScene),
  { ssr: false }
);

type ViewMode = "panoramic" | "workspace" | "flow";

export function ImmersiveWizard() {
  // Form state
  const [issueKeys, setIssueKeys] = useState<string[]>([""]);
  const [media, setMedia] = useState<LocalMediaItem[]>([]);

  // Steps
  const [jiraLoading, setJiraLoading] = useState(false);
  const [jiraError, setJiraError] = useState<string | null>(null);
  const [jiraResult, setJiraResult] = useState<string | null>(null);

  const [generateLoading, setGenerateLoading] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateResult, setGenerateResult] = useState<string | null>(null);
  const [generateStreaming, setGenerateStreaming] = useState(false);

  // UI
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("flow");
  const [activeStep, setActiveStep] = useState(1);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [markdownFullscreen, setMarkdownFullscreen] = useState(false);
  const [editingMarkdown, setEditingMarkdown] = useState(false);
  const [editDraft, setEditDraft] = useState("");
  const fullscreenScrollRef = useRef<HTMLDivElement>(null);

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


  // Auto-scroll fullscreen to bottom while streaming
  useEffect(() => {
    if (generateStreaming && fullscreenScrollRef.current) {
      const el = fullscreenScrollRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [generateResult, generateStreaming]);

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
  if (generateResult) completedSteps.add(2);

  const particleState: ParticleState = generateLoading
    ? "ai-generating"
    : jiraLoading
    ? "jira-loading"
    : generateResult
    ? "complete"
    : "idle";

  // Handlers
  const handleFetchJira = useCallback(async () => {
    setJiraLoading(true);
    setJiraError(null);
    setGenerateResult(null);
    setGenerateError(null);
    try {
      const validKeys = issueKeys.filter((k) => k.trim());
      const data = await fetchJiraContext(validKeys);
      setJiraResult(data.jira_context);
      setActiveStep(2);
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
    setGenerateStreaming(false);

    let accumulated = "";
    let isFirstChunk = true;
    let errorOccurred = false;

    try {
      const files = media.map((m) => m.file);
      const urls = files.length > 0 ? await uploadFilesSequentially(files) : [];
      const mediaPayload = urls.map((url, i) => ({ url, ai_context: media[i]?.ai_context || "" }));

      const validJiraKeys = issueKeys.filter((k) => k.trim());
      for await (const chunk of streamReleaseNote({ jira_tickets: validJiraKeys, media: mediaPayload })) {
        if (isFirstChunk) {
          isFirstChunk = false;
          setGenerateLoading(false);
          setGenerateStreaming(true);
          setMarkdownFullscreen(true);
        }
        accumulated += chunk;
        setGenerateResult(accumulated);
      }

      if (accumulated) {
        const primaryKey = issueKeys[0]?.trim() ?? "";
        const firstHeading = accumulated.match(/^#\s+(.+)$/m)?.[1] || primaryKey;
        saveNote({ jiraKey: primaryKey, title: firstHeading, markdown: accumulated });
      }
      setGenerateStreaming(false);
    } catch (e) {
      errorOccurred = true;
      setGenerateError(e instanceof Error ? e.message : "Failed to generate release note");
      setGenerateLoading(false);
      setGenerateStreaming(false);
    } finally {
      if (isFirstChunk && !errorOccurred) {
        setGenerateLoading(false);
        setGenerateStreaming(false);
        setGenerateError("No content returned. Please try again.");
      }
    }
  }, [issueKeys, media]);

  // Step nav icons
  const steps = [
    { num: 1, icon: <JiraIcon className="w-4 h-4" />, label: "Jira", color: "#0052CC" },
    { num: 2, icon: <AIIcon className="w-4 h-4" />, label: "Generate", color: "#7c3aed" },
  ];

  // Panel configs (shared between panoramic and workspace)
  const panelConfigs = [
    {
      icon: <JiraIcon className="w-4 h-4" />,
      color: "#0052CC",
      title: "Jira Context",
      subtitle: "Fetch ticket details and context",
      isLocked: false,
      isComplete: !!jiraResult,
      content: (
        <JiraStep
          issueKeys={issueKeys}
          onIssueKeysChange={setIssueKeys}
          onFetch={handleFetchJira}
          loading={jiraLoading}
          error={jiraError}
          result={jiraResult}
        />
      ),
    },
    {
      icon: <AIIcon className="w-4 h-4" />,
      color: "#7c3aed",
      title: "Generate Release Note",
      subtitle: "AI-powered blog post",
      isLocked: !jiraResult,
      isComplete: !!generateResult,
      content: (
        <GenerateStep
          media={media}
          onMediaChange={setMedia}
          onGenerate={handleGenerate}
          onFullscreen={() => setMarkdownFullscreen(true)}
          loading={generateLoading}
          error={generateError}
          result={generateResult}
          streaming={generateStreaming}
        />
      ),
    },
  ];

  const isFlow = viewMode === "flow";

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Panoramic landscape background - only when NOT in flow mode */}
      {!isFlow && (
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
      )}
      {/* Dark gradient overlay for readability */}
      {!isFlow && (
        <div
          className="fixed inset-0 z-[1] pointer-events-none"
          style={{
            background: `
              linear-gradient(180deg, rgba(5,14,8,0.65) 0%, rgba(5,14,8,0.35) 30%, rgba(5,14,8,0.40) 60%, rgba(5,14,8,0.75) 100%),
              radial-gradient(ellipse at 50% 0%, rgba(16,185,129,0.06) 0%, transparent 60%)
            `,
          }}
        />
      )}

      {/* Particle overlay - only when NOT in flow mode */}
      {!isFlow && <ParticleScene state={particleState} mouse={mouse} />}

      {/* Nav - hidden in flow mode */}
      {!isFlow && <nav className="glass-nav sticky top-0 z-40">
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
            <div className="hidden sm:flex items-center gap-1 rounded-lg bg-white/8 p-0.5">
              {([
                { mode: "panoramic" as ViewMode, icon: <FocusIcon className="w-3.5 h-3.5" />, label: "Focus" },
                { mode: "workspace" as ViewMode, icon: <GridIcon className="w-3.5 h-3.5" />, label: "Workspace" },
                { mode: "flow" as ViewMode, icon: <FlowIcon className="w-3.5 h-3.5" />, label: "Flow" },
              ]).map((v) => (
                <button
                  key={v.mode}
                  onClick={() => setViewMode(v.mode)}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                    viewMode === v.mode
                      ? "bg-white/15 text-white/90"
                      : "text-white/50 hover:text-white/70"
                  }`}
                >
                  {v.icon} {v.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setHistoryOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/8 text-white/50 hover:bg-white/12 hover:text-white/80 transition-colors"
              title="Saved release notes"
            >
              <HistoryIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </nav>}

      {/* Content */}
      <main ref={contentRef} className={`relative z-10 ${viewMode === "flow" ? "px-0 py-0" : "mx-auto max-w-5xl px-2 py-6 sm:px-4 sm:py-8"}`}>
        {viewMode === "panoramic" && (
          <PanoramicView
            activeStep={activeStep}
            particleState={particleState}
            panels={panelConfigs}
            onStepChange={handleStepChange}
          />
        )}
        {viewMode === "workspace" && (
          <WorkspaceView
            panels={panelConfigs}
            onResetView={() => setViewMode("panoramic")}
          />
        )}
      </main>

      {/* Flow mode — fullscreen overlay, no navbar, no background */}
      {viewMode === "flow" && (
        <div className="fixed inset-0 z-50">
          <FlowView
            onFullscreenMarkdown={(md: string) => {
              setGenerateResult(md);
              setMarkdownFullscreen(true);
            }}
            onStreamingChange={(s: boolean) => setGenerateStreaming(s)}
            onSwitchView={(mode) => setViewMode(mode)}
          />
        </div>
      )}

      {/* Loading overlay - icon + text in center of leaf whirlwind (only non-flow views) */}
      {!isFlow && (jiraLoading || generateLoading) && (
        <div className="fixed inset-0 z-[15] pointer-events-none flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 animate-fade-in rounded-3xl bg-black/40 backdrop-blur-md px-10 py-8">
            {/* Spinning icon ring */}
            <div className="relative flex items-center justify-center">
              {/* Outer rotating ring */}
              <div
                className="absolute h-24 w-24 rounded-full border-2 border-transparent animate-spin"
                style={{
                  borderTopColor: jiraLoading ? "#2684FF" : "#a855f7",
                  borderRightColor: jiraLoading ? "#0052CC40" : "#a855f740",
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
                      : "rgba(168,85,247,0.25)"
                  } 0%, transparent 70%)`,
                }}
              />
              {/* Brand icon */}
              <div
                className="relative flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-2xl loading-icon-bounce"
                style={{
                  background: `linear-gradient(135deg, ${
                    jiraLoading ? "#0052CC, #2684FF" : "#7c3aed, #a855f7"
                  })`,
                  boxShadow: `0 0 40px ${
                    jiraLoading ? "rgba(0,82,204,0.4)" : "rgba(168,85,247,0.5)"
                  }`,
                }}
              >
                {jiraLoading && <JiraIcon className="w-7 h-7" />}
                {generateLoading && <AIIcon className="w-7 h-7" />}
              </div>
            </div>
            {/* Loading text */}
            <div className="flex flex-col items-center gap-1.5">
              <p className="text-sm font-semibold text-white/90 tracking-wide">
                {jiraLoading && "Fetching Jira Context"}
                {generateLoading && "Generating Release Note"}
              </p>
              <p className="text-xs text-white/50">
                {jiraLoading && "Connecting to Jira API..."}
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

      {/* AI generating glow (only non-flow views) */}
      {!isFlow && particleState === "ai-generating" && (
        <div className="fixed inset-0 z-0 pointer-events-none ai-glow-overlay" />
      )}

      <HistoryPanel open={historyOpen} onClose={() => setHistoryOpen(false)} />

      {/* Markdown fullscreen overlay - auto-opens on generate, above everything */}
      {markdownFullscreen && generateResult && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-white animate-fade-in">
          {editingMarkdown ? (
            <MarkdownEditorView
              value={editDraft}
              onChange={setEditDraft}
              onSave={(v) => {
                setGenerateResult(v);
                setEditingMarkdown(false);
              }}
              onCancel={() => setEditingMarkdown(false)}
            />
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-gray-200 px-6 py-3 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-violet-600 text-white">
                    <SparklesIcon className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-semibold text-gray-900">
                    {generateStreaming ? "Generating..." : "Release Note"}
                  </span>
                  <div className={`h-2 w-2 rounded-full ${generateStreaming ? "bg-accent animate-pulse" : "bg-emerald-500"}`} />
                </div>
                <div className="flex items-center gap-2">
                  {!generateStreaming && (
                    <button
                      onClick={() => { setEditDraft(generateResult); setEditingMarkdown(true); }}
                      className="flex items-center gap-1.5 rounded-lg bg-purple-50 px-3 py-2 text-xs font-medium text-purple-700 hover:bg-purple-100 transition-colors"
                    >
                      <EditIcon className="w-3.5 h-3.5" />
                      Edit
                    </button>
                  )}
                  <CopyButton text={generateResult} />
                  <button
                    onClick={() => setMarkdownFullscreen(false)}
                    className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-200 transition-colors"
                  >
                    <XIcon className="w-3.5 h-3.5" />
                    Close
                  </button>
                </div>
              </div>
              <div ref={fullscreenScrollRef} className="flex-1 overflow-y-auto p-6 sm:p-10">
                <div className="mx-auto max-w-3xl">
                  <MarkdownRenderer content={generateResult} />
                  {generateStreaming && (
                    <span aria-hidden="true" className="inline-block h-4 w-0.5 bg-accent align-middle ml-0.5 animate-blink" />
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
