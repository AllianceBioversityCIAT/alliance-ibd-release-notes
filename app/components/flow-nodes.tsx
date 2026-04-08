"use client";

import { memo, useState, useEffect, useRef } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { DEFAULTS } from "@/app/lib/constants";
import type { LocalMediaItem, UploadedMediaItem, NotionPublishPayload, NotionPublishResult } from "@/app/lib/types";
import { LoaderIcon, ImageIcon, ExpandIcon, XIcon, PlusIcon, RefreshIcon, CheckIcon, ClipboardIcon } from "./icons";
import { MarkdownRenderer } from "./markdown-renderer";
import { CopyButton } from "./copy-button";
import { JiraIcon, GitHubIcon, AIIcon, NotionIcon } from "./brand-icons";
import { ChatMediaInput } from "./chat-media-input";
import { getNotionOptions, uploadFile } from "@/app/lib/api";

/* ── Shared Handle Styles ── */
const hRight = { width: 10, height: 10, background: "#22c55e", border: "2px solid #1a1a2e" };
const hBottom = { ...hRight };
const hTop = { ...hRight };
const hLeft = { ...hRight };

/* ═══════════════════════════════════════════════════
   1. Jira Input Node
   Handles: source-right (→ GitHub), source-bottom (↓ result)
   ═══════════════════════════════════════════════════ */
export const JiraInputNode = memo(function JiraInputNode({ data }: NodeProps) {
  const { onSubmit, disabled, onReset } = data as {
    onSubmit: (issueKeys: string[]) => void;
    disabled: boolean;
    onReset?: () => void;
  };
  const [keys, setKeys] = useState([""]);

  function updateKey(i: number, v: string) {
    const next = [...keys]; next[i] = v.toUpperCase(); setKeys(next);
  }
  function addKey() { setKeys([...keys, ""]); }
  function removeKey(i: number) { if (keys.length > 1) setKeys(keys.filter((_, idx) => idx !== i)); }

  const validKeys = keys.filter((k) => k.trim());

  return (
    <div className={`rounded-2xl border-2 shadow-xl w-[300px] transition-all ${disabled ? "border-gray-600 bg-gray-800/80" : "border-blue-500/60 bg-[#1e1e38]"}`}>
      <div className="flex items-center gap-2 px-4 py-3 rounded-t-2xl" style={{ background: "linear-gradient(135deg, rgba(0,82,204,0.25), transparent)" }}>
        <div className="flex h-7 w-7 items-center justify-center rounded-lg text-white shadow-md" style={{ background: "#0052CC" }}>
          <JiraIcon className="w-4 h-4" />
        </div>
        <span className="text-sm font-semibold text-white">Jira Context</span>
        {disabled && (
          <>
            <span className="ml-auto text-[10px] font-medium text-emerald-400 bg-emerald-500/20 rounded-full px-2 py-0.5">Done</span>
            {onReset && (
              <button
                onClick={onReset}
                title="Edit & re-fetch"
                className="flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[10px] font-medium text-white/60 hover:bg-blue-500/20 hover:text-blue-400 transition-colors"
              >
                <RefreshIcon className="w-3 h-3" /> Re-fetch
              </button>
            )}
          </>
        )}
      </div>
      <div className="p-4 space-y-2 border-t border-white/5">
        {keys.map((k, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              type="text"
              value={k}
              onChange={(e) => updateKey(i, e.target.value)}
              placeholder={i === 0 ? DEFAULTS.jiraPlaceholder : "e.g. P2-2161"}
              disabled={disabled}
              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 disabled:opacity-40"
              onKeyDown={(e) => { if (e.key === "Enter" && validKeys.length > 0 && !disabled) onSubmit(validKeys); }}
            />
            {keys.length > 1 && !disabled && (
              <button onClick={() => removeKey(i)} className="p-1.5 rounded text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                <XIcon className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
        {!disabled && (
          <button onClick={addKey} className="flex items-center gap-1 text-[11px] text-white/40 hover:text-blue-400 transition-colors">
            <PlusIcon className="w-3 h-3" /> Add another key
          </button>
        )}
        {!disabled && (
          <button
            onClick={() => validKeys.length > 0 && onSubmit(validKeys)}
            disabled={validKeys.length === 0}
            className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-30 transition-colors mt-1"
          >
            {validKeys.length > 1 ? `Fetch ${validKeys.length} Contexts` : "Fetch Jira Context"}
          </button>
        )}
      </div>
      <Handle type="source" position={Position.Right} id="right" style={hRight} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={hBottom} />
    </div>
  );
});

/* ═══════════════════════════════════════════════════
   2. GitHub Input Node
   Handles: target-left (← Jira), source-right (→ Generate), source-bottom (↓ result)
   ═══════════════════════════════════════════════════ */
export const GitHubInputNode = memo(function GitHubInputNode({ data }: NodeProps) {
  const { jiraTicket, onSubmit, onSkip, disabled, skipped } = data as {
    jiraTicket: string;
    onSubmit: (owner: string, repo: string, branch: string) => void;
    onSkip: () => void;
    disabled: boolean;
    skipped?: boolean;
  };
  const [owner, setOwner] = useState<string>(DEFAULTS.owner);
  const [repo, setRepo] = useState<string>(DEFAULTS.repo);
  const [branch, setBranch] = useState<string>(DEFAULTS.branch);

  return (
    <div className={`rounded-2xl border-2 shadow-xl w-[320px] transition-all ${disabled ? "border-gray-600 bg-gray-800/80" : "border-gray-500/40 bg-[#1e1e38]"}`}>
      <Handle type="target" position={Position.Left} id="left" style={hLeft} />
      <div className="flex items-center gap-2 px-4 py-3 rounded-t-2xl" style={{ background: "linear-gradient(135deg, rgba(36,41,46,0.4), transparent)" }}>
        <div className="flex h-7 w-7 items-center justify-center rounded-lg text-white shadow-md" style={{ background: "#24292e" }}>
          <GitHubIcon className="w-4 h-4" />
        </div>
        <span className="text-sm font-semibold text-white">GitHub Commits</span>
        {jiraTicket && <span className="text-[10px] font-medium text-blue-400 bg-blue-500/15 rounded-full px-2 py-0.5">{jiraTicket}</span>}
        {disabled && <span className={`ml-auto text-[10px] font-medium rounded-full px-2 py-0.5 ${skipped ? "text-yellow-400 bg-yellow-500/20" : "text-emerald-400 bg-emerald-500/20"}`}>{skipped ? "Skipped" : "Done"}</span>}
      </div>
      <div className="p-4 space-y-3 border-t border-white/5">
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-[10px] font-medium text-white/40 mb-0.5 block">Owner</label>
            <input type="text" value={owner} onChange={(e) => setOwner(e.target.value)} disabled={disabled}
              className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white outline-none focus:ring-1 focus:ring-gray-400/50 disabled:opacity-40" />
          </div>
          <div>
            <label className="text-[10px] font-medium text-white/40 mb-0.5 block">Repo</label>
            <input type="text" value={repo} onChange={(e) => setRepo(e.target.value)} disabled={disabled}
              className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white outline-none focus:ring-1 focus:ring-gray-400/50 disabled:opacity-40" />
          </div>
          <div>
            <label className="text-[10px] font-medium text-white/40 mb-0.5 block">Branch</label>
            <input type="text" value={branch} onChange={(e) => setBranch(e.target.value)} disabled={disabled}
              className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white outline-none focus:ring-1 focus:ring-gray-400/50 disabled:opacity-40" />
          </div>
        </div>
        {!disabled && (
          <div className="flex gap-2">
            <button
              onClick={() => onSubmit(owner, repo, branch)}
              className="flex-1 rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-white hover:bg-gray-600 transition-colors"
            >
              Fetch Commits
            </button>
            <button
              onClick={onSkip}
              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/60 hover:bg-white/10 hover:text-white transition-colors"
            >
              Skip →
            </button>
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} id="right" style={hRight} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={hBottom} />
    </div>
  );
});

/* ═══════════════════════════════════════════════════
   3. Generate Input Node
   Handles: target-left (← GitHub), source-bottom (↓ result)
   ChatGPT-style media input with paste, drag-drop, and per-image context.
   Supports re-generation with previously uploaded media.
   ═══════════════════════════════════════════════════ */
const RELEASE_NOTE_TYPES = [
  { value: "standard", label: "Standard", desc: "Balanced overview of changes" },
  { value: "detailed", label: "Detailed / Tutorial", desc: "In-depth walkthrough, step-by-step" },
  { value: "brief", label: "Brief / Patch", desc: "Short and to the point" },
] as const;

export type ReleaseNoteType = (typeof RELEASE_NOTE_TYPES)[number]["value"];

export const GenerateInputNode = memo(function GenerateInputNode({ data }: NodeProps) {
  const { onSubmit, onRegenerate, disabled, uploadedMedia: initialUploaded } = data as {
    onSubmit: (newMedia: LocalMediaItem[], existingMedia: UploadedMediaItem[], generalContext: string, noteType: ReleaseNoteType) => void;
    onRegenerate?: () => void;
    disabled: boolean;
    uploadedMedia?: UploadedMediaItem[];
  };
  const [localMedia, setLocalMedia] = useState<LocalMediaItem[]>([]);
  const [uploaded, setUploaded] = useState<UploadedMediaItem[]>(initialUploaded ?? []);
  const [generalContext, setGeneralContext] = useState("");
  const [noteType, setNoteType] = useState<ReleaseNoteType>("standard");
  const prevDisabledRef = useRef(disabled);

  // When transitioning disabled→enabled (re-generate), clear local media and sync uploaded
  useEffect(() => {
    if (prevDisabledRef.current && !disabled) {
      setLocalMedia([]);
      if (initialUploaded) setUploaded(initialUploaded);
    }
    prevDisabledRef.current = disabled;
  }, [disabled, initialUploaded]);

  const totalMedia = localMedia.length + uploaded.length;

  return (
    <div className={`rounded-2xl border-2 shadow-xl w-[420px] transition-all ${disabled ? "border-gray-600 bg-gray-800/80" : "border-purple-500/40 bg-[#1e1e38]"}`}>
      <Handle type="target" position={Position.Left} id="left" style={hLeft} />
      <div className="flex items-center gap-2 px-4 py-3 rounded-t-2xl" style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.25), transparent)" }}>
        <div className="flex h-7 w-7 items-center justify-center rounded-lg text-white shadow-md" style={{ background: "linear-gradient(135deg, #7c3aed, #a855f7)" }}>
          <AIIcon className="w-4 h-4" />
        </div>
        <span className="text-sm font-semibold text-white">Generate Release Note</span>
        {disabled && (
          <>
            <span className="ml-auto text-[10px] font-medium text-emerald-400 bg-emerald-500/20 rounded-full px-2 py-0.5">Done</span>
            {onRegenerate && (
              <button onClick={onRegenerate}
                className="flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[10px] font-medium text-white/60 hover:bg-purple-500/20 hover:text-purple-400 transition-colors">
                <RefreshIcon className="w-3 h-3" /> Re-generate
              </button>
            )}
          </>
        )}
      </div>
      <div className="p-4 space-y-3 border-t border-white/5">
        {!disabled ? (
          <>
            {/* Release note type selector */}
            <div>
              <label className="text-[10px] font-medium text-white/40 mb-1.5 block">Release Note Type</label>
              <div className="flex gap-1.5">
                {RELEASE_NOTE_TYPES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setNoteType(t.value)}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-center transition-all ${
                      noteType === t.value
                        ? "border-purple-500/60 bg-purple-500/20 text-purple-300"
                        : "border-white/10 bg-white/5 text-white/40 hover:border-white/20 hover:text-white/60"
                    }`}
                  >
                    <span className="text-[11px] font-medium block">{t.label}</span>
                    <span className="text-[9px] opacity-60 block">{t.desc}</span>
                  </button>
                ))}
              </div>
            </div>
            <ChatMediaInput
              localMedia={localMedia}
              setLocalMedia={setLocalMedia}
              uploaded={uploaded}
              setUploaded={setUploaded}
              generalContext={generalContext}
              setGeneralContext={setGeneralContext}
            />
            <button
              onClick={() => onSubmit(localMedia, uploaded, generalContext, noteType)}
              className="w-full rounded-lg bg-gradient-to-r from-purple-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:from-purple-700 hover:to-violet-700 transition-all"
            >
              {uploaded.length > 0 ? "Re-generate Release Note" : "Generate Release Note"}
            </button>
          </>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-white/40">
            <ImageIcon className="w-3.5 h-3.5" />
            <span>{totalMedia} media file{totalMedia !== 1 ? "s" : ""} attached</span>
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} id="bottom" style={hBottom} />
    </div>
  );
});

/* ═══════════════════════════════════════════════════
   4. Loading Node (appears below input while fetching)
   Handles: target-top (↑ from input)
   ═══════════════════════════════════════════════════ */
export const LoadingNode = memo(function LoadingNode({ data }: NodeProps) {
  const { label } = data as { label: string; color: string };
  return (
    <div className="rounded-2xl border-2 border-dashed border-white/20 bg-[#1e1e38]/90 shadow-lg w-[260px]">
      <Handle type="target" position={Position.Top} id="top" style={hTop} />
      <div className="flex items-center gap-3 px-5 py-4">
        <LoaderIcon className="w-5 h-5 text-emerald-400" />
        <span className="text-sm font-medium text-white/70">{label}</span>
      </div>
    </div>
  );
});

/* ═══════════════════════════════════════════════════
   5. Result Node (resizable, scrollable, with fullscreen)
   Handles: target-top (↑ from input), source-right (→ to next step)
   ═══════════════════════════════════════════════════ */
export const ResultNode = memo(function ResultNode({ data }: NodeProps) {
  const { markdown, title, color, icon, onFullscreen, streaming, jiraUrl } = data as {
    markdown: string;
    title: string;
    color: string;
    icon: "jira" | "github" | "ai";
    onFullscreen?: () => void;
    streaming?: boolean;
    jiraUrl?: string;
  };

  const IconComponent = icon === "jira" ? JiraIcon : icon === "github" ? GitHubIcon : AIIcon;

  return (
    <div className="rounded-2xl border-2 border-white/10 bg-[#1a1a2e] shadow-xl overflow-hidden">
      <Handle type="target" position={Position.Top} id="top" style={hTop} />
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5" style={{ background: `linear-gradient(135deg, ${color}30, transparent)` }}>
        <div className="flex h-6 w-6 items-center justify-center rounded-md text-white" style={{ background: color }}>
          <IconComponent className="w-3.5 h-3.5" />
        </div>
        <span className="text-xs font-semibold text-white/90 flex-1 truncate">{title}</span>
        {jiraUrl && (
          <a
            href={jiraUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded-md bg-blue-500/15 px-2.5 py-1 text-[11px] font-medium text-blue-400 hover:bg-blue-500/25 hover:text-blue-300 transition-colors"
          >
            <JiraIcon className="w-3 h-3" />
            Open
          </a>
        )}
        <CopyButton text={markdown} />
        <button
          onClick={onFullscreen}
          className="flex items-center gap-1 rounded-md bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/70 hover:bg-white/20 hover:text-white transition-colors"
        >
          <ExpandIcon className="w-3 h-3" />
          Fullscreen
        </button>
      </div>
      {/* Content — auto height, no scroll needed */}
      <div className="p-4 bg-white">
        <MarkdownRenderer content={markdown} />
        {streaming && (
          <span aria-hidden="true" className="inline-block h-4 w-0.5 bg-purple-600 align-middle ml-0.5 animate-blink" />
        )}
      </div>
      <Handle type="source" position={Position.Right} id="right" style={hRight} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={hBottom} />
    </div>
  );
});

/* ═══════════════════════════════════════════════════
   6. Notion Input Node — publish generated release note
   Handles: target-left (← from generate result)
   ═══════════════════════════════════════════════════ */
export const NotionInputNode = memo(function NotionInputNode({ data }: NodeProps) {
  const { onPublish } = data as {
    onPublish: (payload: NotionPublishPayload) => Promise<NotionPublishResult>;
  };
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [allProjects, setAllProjects] = useState<string[]>([]);
  const [tag, setTag] = useState("");
  const [projects, setProjects] = useState<string[]>([]);
  const [brief, setBrief] = useState("");
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);

  useEffect(() => {
    getNotionOptions()
      .then(({ tags: t, projects: p }) => { setTags(t); setAllProjects(p); })
      .catch(() => {});
  }, []);

  async function handleBannerChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBannerPreview(URL.createObjectURL(file));
    setBannerUrl(null);
    setBannerUploading(true);
    try {
      const url = await uploadFile(file);
      setBannerUrl(url);
    } catch {
      setBannerPreview(null);
    } finally {
      setBannerUploading(false);
    }
  }

  function removeBanner() {
    if (bannerPreview) URL.revokeObjectURL(bannerPreview);
    setBannerPreview(null);
    setBannerUrl(null);
  }

  async function handlePublish() {
    setPublishing(true);
    setError(null);
    try {
      const res = await onPublish({ tag, projects, brief_description: brief, cover_url: bannerUrl ?? undefined });
      setPublishedUrl(res.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error publishing");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="rounded-2xl border-2 shadow-xl w-[360px] transition-all border-gray-600/40 bg-[#1e1e38]">
      <Handle type="target" position={Position.Left} id="left" style={hLeft} />
      <div className="flex items-center gap-2 px-4 py-3 rounded-t-2xl" style={{ background: "linear-gradient(135deg, rgba(0,0,0,0.25), transparent)" }}>
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-black text-white shadow-md">
          <NotionIcon className="w-4 h-4" />
        </div>
        <span className="text-sm font-semibold text-white">Publish to Notion</span>
        {publishedUrl && <span className="ml-auto text-[10px] font-medium text-emerald-400 bg-emerald-500/20 rounded-full px-2 py-0.5">Published</span>}
      </div>
      <div className="nowheel p-4 space-y-3 border-t border-white/5">
        {publishedUrl ? (
          <div className="flex items-center gap-3">
            <a href={publishedUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm font-medium text-emerald-400 hover:underline">
              <CheckIcon className="w-4 h-4" /> View in Notion ↗
            </a>
            <button
              onClick={() => { navigator.clipboard.writeText(publishedUrl); }}
              className="flex items-center gap-1.5 text-sm font-medium text-white/60 hover:text-white transition-colors"
              title="Copy URL"
            >
              <ClipboardIcon className="w-4 h-4" /> Copy
            </button>
          </div>
        ) : (
          <>
            {/* Tag */}
            <div>
              <label className="text-[10px] font-medium text-white/40 mb-0.5 block">Tag</label>
              <select value={tag} onChange={(e) => setTag(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white outline-none focus:ring-1 focus:ring-gray-400/50">
                <option value="">— none —</option>
                {tags.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {/* Projects — always-visible scrollbar, wheel captured */}
            <div>
              <label className="text-[10px] font-medium text-white/40 mb-0.5 block">Projects</label>
              <div
                className="nowheel rounded-md border border-white/10 bg-white/5 p-2 grid grid-cols-2 gap-x-3 gap-y-1"
                style={{ maxHeight: 200, overflowY: "scroll" }}
              >
                {allProjects.map((p) => (
                  <label key={p} className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={projects.includes(p)}
                      onChange={(e) => setProjects(e.target.checked ? [...projects, p] : projects.filter((x) => x !== p))}
                      className="accent-purple-500 w-3 h-3 flex-shrink-0" />
                    <span className="text-[10px] text-white/70 truncate">{p}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Banner / Cover */}
            <div>
              <label className="text-[10px] font-medium text-white/40 mb-0.5 block">Banner / Cover (optional)</label>
              {bannerPreview ? (
                <div className="relative rounded-md overflow-hidden border border-white/10 h-20">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={bannerPreview} alt="banner" className="w-full h-full object-cover" />
                  {bannerUploading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <LoaderIcon className="w-4 h-4 text-white" />
                    </div>
                  )}
                  {!bannerUploading && (
                    <button onClick={removeBanner}
                      className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white/70 hover:text-white transition-colors">
                      <XIcon className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ) : (
                <label className="flex items-center justify-center gap-1.5 rounded-md border border-dashed border-white/20 bg-white/5 px-3 py-3 text-[10px] text-white/40 hover:text-white/60 hover:border-white/30 transition-colors cursor-pointer">
                  <ImageIcon className="w-3.5 h-3.5" /> Upload image
                  <input type="file" accept="image/*" className="sr-only" onChange={handleBannerChange} />
                </label>
              )}
            </div>

            {/* Brief */}
            <div>
              <label className="text-[10px] font-medium text-white/40 mb-0.5 block">Brief description (optional)</label>
              <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={2}
                placeholder="Short summary shown in the gallery..."
                className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white placeholder:text-white/25 outline-none focus:ring-1 focus:ring-gray-400/50 resize-none" />
            </div>

            {error && <p className="text-[10px] text-red-400">{error}</p>}

            <button onClick={handlePublish} disabled={publishing || bannerUploading}
              className="w-full rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-40 flex items-center justify-center gap-2 transition-colors">
              {publishing ? <LoaderIcon className="w-4 h-4" /> : <NotionIcon className="w-4 h-4" />}
              {publishing ? "Publishing..." : bannerUploading ? "Uploading banner..." : "Publish to Notion"}
            </button>
          </>
        )}
      </div>
    </div>
  );
});

/* ═══════════════════════════════════════════════════
   7. Refine Chat Node — iterative refinement via chat
   Handles: target-top (↑ from generate result)
   ═══════════════════════════════════════════════════ */
interface RefineMessage {
  instruction: string;
  mediaCount: number;
  status: "applying" | "applied" | "error";
  error?: string;
}

export const RefineChatNode = memo(function RefineChatNode({ data }: NodeProps) {
  const { onRefine, streaming } = data as {
    onRefine: (instruction: string, files: File[]) => void;
    streaming?: boolean;
  };
  const [instruction, setInstruction] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [history, setHistory] = useState<RefineMessage[]>([]);
  const historyRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mark last message as applied/error when streaming finishes
  const prevStreaming = useRef(streaming);
  useEffect(() => {
    if (prevStreaming.current && !streaming) {
      setHistory((h) => {
        if (h.length === 0) return h;
        const last = h[h.length - 1];
        if (last.status !== "applying") return h;
        return [...h.slice(0, -1), { ...last, status: "applied" }];
      });
    }
    prevStreaming.current = streaming;
  }, [streaming]);

  // Auto-scroll chat
  useEffect(() => {
    historyRef.current?.scrollTo({ top: historyRef.current.scrollHeight, behavior: "smooth" });
  }, [history]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newFiles = Array.from(e.target.files ?? []);
    setFiles((prev) => [...prev, ...newFiles]);
    setPreviews((prev) => [...prev, ...newFiles.map((f) => URL.createObjectURL(f))]);
    e.target.value = "";
  }

  function removeFile(i: number) {
    URL.revokeObjectURL(previews[i]);
    setFiles((f) => f.filter((_, idx) => idx !== i));
    setPreviews((p) => p.filter((_, idx) => idx !== i));
  }

  function handleSend() {
    const text = instruction.trim();
    if (!text && files.length === 0) return;
    setHistory((h) => [...h, { instruction: text || "(images attached)", mediaCount: files.length, status: "applying" }]);
    onRefine(text, files);
    setInstruction("");
    setFiles([]);
    previews.forEach((p) => URL.revokeObjectURL(p));
    setPreviews([]);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData.items);
    const imageFiles = items
      .filter((item) => item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((f): f is File => f !== null);
    if (imageFiles.length > 0) {
      setFiles((prev) => [...prev, ...imageFiles]);
      setPreviews((prev) => [...prev, ...imageFiles.map((f) => URL.createObjectURL(f))]);
    }
  }

  return (
    <div className="rounded-2xl border-2 border-purple-500/30 bg-[#1e1e38] shadow-xl w-[450px] transition-all">
      <Handle type="target" position={Position.Top} id="top" style={hTop} />
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-t-2xl" style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.15), transparent)" }}>
        <div className="flex h-6 w-6 items-center justify-center rounded-md text-white" style={{ background: "linear-gradient(135deg, #7c3aed, #a855f7)" }}>
          <AIIcon className="w-3.5 h-3.5" />
        </div>
        <span className="text-xs font-semibold text-white/90">Refine Release Note</span>
        {streaming && <LoaderIcon className="w-3.5 h-3.5 text-purple-400 ml-auto" />}
      </div>

      <div className="border-t border-white/5 p-3 space-y-2">
        {/* Chat history */}
        {history.length > 0 && (
          <div ref={historyRef} className="nowheel space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
            {history.map((msg, i) => (
              <div key={i} className="rounded-lg bg-white/5 px-3 py-2">
                <p className="text-[11px] text-white/70 leading-relaxed">{msg.instruction}</p>
                <div className="flex items-center gap-2 mt-1">
                  {msg.mediaCount > 0 && (
                    <span className="text-[9px] text-purple-400/70">
                      <ImageIcon className="w-2.5 h-2.5 inline mr-0.5" />{msg.mediaCount} image{msg.mediaCount > 1 ? "s" : ""}
                    </span>
                  )}
                  <span className={`text-[9px] font-medium ml-auto ${
                    msg.status === "applied" ? "text-emerald-400" :
                    msg.status === "error" ? "text-red-400" :
                    "text-purple-400"
                  }`}>
                    {msg.status === "applied" ? "Applied" :
                     msg.status === "error" ? (msg.error ?? "Error") :
                     "Applying..."}
                    {msg.status === "applied" && <CheckIcon className="w-2.5 h-2.5 inline ml-0.5" />}
                    {msg.status === "applying" && <LoaderIcon className="w-2.5 h-2.5 inline ml-0.5" />}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Image previews */}
        {previews.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {previews.map((src, i) => (
              <div key={i} className="relative w-12 h-12 rounded-md overflow-hidden border border-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="w-full h-full object-cover" />
                <button onClick={() => removeFile(i)}
                  className="absolute top-0 right-0 rounded-bl-md bg-black/70 p-0.5 text-white/70 hover:text-white">
                  <XIcon className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input area */}
        <div className="flex gap-1.5 items-end">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={streaming}
            className="flex-shrink-0 rounded-md border border-white/10 bg-white/5 p-2 text-white/40 hover:text-white/70 hover:border-white/20 disabled:opacity-30 transition-colors"
            title="Attach images"
          >
            <ImageIcon className="w-3.5 h-3.5" />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="sr-only" onChange={handleFileChange} />
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            disabled={streaming}
            placeholder={streaming ? "Applying changes..." : 'e.g. "Add more detail to the notifications section" or paste images...'}
            rows={2}
            className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder:text-white/25 outline-none focus:ring-1 focus:ring-purple-500/50 resize-none disabled:opacity-40"
          />
          <button
            onClick={handleSend}
            disabled={streaming || (!instruction.trim() && files.length === 0)}
            className="flex-shrink-0 rounded-lg bg-purple-600 px-3 py-2 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-30 transition-colors"
          >
            Apply
          </button>
        </div>
        <p className="text-[9px] text-white/25 leading-tight">
          Tell the AI what to change. Attach images and say where to place them. Shift+Enter for new line.
        </p>
      </div>
    </div>
  );
});

/* ── Node type registry ── */
export const flowNodeTypes = {
  jiraInput: JiraInputNode,
  githubInput: GitHubInputNode,
  generateInput: GenerateInputNode,
  loading: LoadingNode,
  result: ResultNode,
  notionInput: NotionInputNode,
  refineChat: RefineChatNode,
};
