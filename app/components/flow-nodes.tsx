"use client";

import { memo, useState, useEffect } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { DEFAULTS } from "@/app/lib/constants";
import type { LocalMediaItem, UploadedMediaItem, NotionPublishPayload, NotionPublishResult } from "@/app/lib/types";
import { LoaderIcon, TrashIcon, ImageIcon, ExpandIcon, XIcon, PlusIcon, RefreshIcon, CheckIcon } from "./icons";
import { MarkdownRenderer } from "./markdown-renderer";
import { CopyButton } from "./copy-button";
import { JiraIcon, GitHubIcon, AIIcon, NotionIcon } from "./brand-icons";
import { MediaUploadZone } from "./media-upload-zone";
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
  const { jiraTicket, onSubmit, disabled } = data as {
    jiraTicket: string;
    onSubmit: (owner: string, repo: string, branch: string) => void;
    disabled: boolean;
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
        {disabled && <span className="ml-auto text-[10px] font-medium text-emerald-400 bg-emerald-500/20 rounded-full px-2 py-0.5">Done</span>}
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
          <button
            onClick={() => onSubmit(owner, repo, branch)}
            className="w-full rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-white hover:bg-gray-600 transition-colors"
          >
            Fetch Commits
          </button>
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
   Supports re-generation: after first generate, shows uploaded media
   and allows adding/removing before re-generating.
   ═══════════════════════════════════════════════════ */
export const GenerateInputNode = memo(function GenerateInputNode({ data }: NodeProps) {
  const { onSubmit, onRegenerate, disabled, uploadedMedia: initialUploaded } = data as {
    onSubmit: (newMedia: LocalMediaItem[], existingMedia: UploadedMediaItem[]) => void;
    onRegenerate?: () => void;
    disabled: boolean;
    uploadedMedia?: UploadedMediaItem[];
  };
  const [localMedia, setLocalMedia] = useState<LocalMediaItem[]>([]);
  const [uploaded, setUploaded] = useState<UploadedMediaItem[]>(initialUploaded ?? []);

  // Sync uploaded media when node data changes (e.g., re-enable after generate)
  useEffect(() => {
    if (initialUploaded) setUploaded(initialUploaded);
  }, [initialUploaded]);

  function removeLocal(i: number) {
    const item = localMedia[i];
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    setLocalMedia(localMedia.filter((_, idx) => idx !== i));
  }
  function updateLocalContext(i: number, value: string) {
    setLocalMedia(localMedia.map((item, idx) => (idx === i ? { ...item, ai_context: value } : item)));
  }
  function removeUploaded(i: number) {
    setUploaded(uploaded.filter((_, idx) => idx !== i));
  }
  function updateUploadedContext(i: number, value: string) {
    setUploaded(uploaded.map((item, idx) => (idx === i ? { ...item, ai_context: value } : item)));
  }

  const totalMedia = localMedia.length + uploaded.length;

  return (
    <div className={`rounded-2xl border-2 shadow-xl w-[400px] transition-all ${disabled ? "border-gray-600 bg-gray-800/80" : "border-purple-500/40 bg-[#1e1e38]"}`}>
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
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <ImageIcon className="w-3.5 h-3.5 text-white/40" />
            <span className="text-xs font-medium text-white/70">Media ({totalMedia})</span>
          </div>

          {/* All media items — scrollable */}
          {totalMedia > 0 && !disabled && (
            <div className="nowheel space-y-2 max-h-[400px] overflow-y-auto pr-1">
              {/* Already uploaded items */}
              {uploaded.map((item, i) => (
                <div key={`up-${i}`} className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-emerald-500/20">
                      <CheckIcon className="w-3 h-3 text-emerald-400" />
                    </div>
                    <p className="flex-1 text-[11px] font-medium text-white/60 truncate">{item.fileName}</p>
                    <button onClick={() => removeUploaded(i)} className="rounded p-1 text-white/30 hover:bg-red-500/20 hover:text-red-400 flex-shrink-0">
                      <XIcon className="w-3 h-3" />
                    </button>
                  </div>
                  <textarea value={item.ai_context} onChange={(e) => updateUploadedContext(i, e.target.value)}
                    placeholder="Describe what this image shows and how it relates to the release..."
                    rows={2}
                    className="nowheel w-full rounded border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] text-white placeholder:text-white/25 outline-none focus:ring-1 focus:ring-purple-500/40 resize-none" />
                </div>
              ))}
              {/* New local files */}
              {localMedia.map((item, i) => (
                <div key={`loc-${i}`} className="rounded-lg border border-white/10 bg-white/5 p-2 space-y-1.5">
                  <div className="flex items-center gap-2">
                    {item.type === "image" && item.previewUrl && (
                      <div className="h-12 w-16 flex-shrink-0 overflow-hidden rounded border border-white/10 bg-white/5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.previewUrl} alt={item.file.name} className="h-full w-full object-cover" />
                      </div>
                    )}
                    {item.type === "video" && item.previewUrl && (
                      <div className="h-12 w-16 flex-shrink-0 overflow-hidden rounded border border-white/10 bg-white/5">
                        <video src={item.previewUrl} className="h-full w-full object-cover" muted />
                      </div>
                    )}
                    {item.type === "file" && (
                      <div className="flex h-12 w-16 flex-shrink-0 items-center justify-center rounded border border-white/10 bg-white/5">
                        <span className="text-[8px] text-white/40 text-center px-0.5 break-all line-clamp-2">{item.file.name}</span>
                      </div>
                    )}
                    <p className="flex-1 text-[11px] font-medium text-white/60 truncate">{item.file.name}</p>
                    <button onClick={() => removeLocal(i)} className="rounded p-1 text-white/30 hover:bg-red-500/20 hover:text-red-400 flex-shrink-0">
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <textarea value={item.ai_context} onChange={(e) => updateLocalContext(i, e.target.value)}
                    placeholder="Describe what this image shows and how it relates to the release..."
                    rows={2}
                    className="nowheel w-full rounded border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] text-white placeholder:text-white/25 outline-none focus:ring-1 focus:ring-purple-500/40 resize-none" />
                </div>
              ))}
            </div>
          )}

          {/* Upload zone */}
          {!disabled && (
            <MediaUploadZone
              variant="dark"
              disabled={disabled}
              onFilesAdded={(items) => setLocalMedia((prev) => [...prev, ...items])}
            />
          )}
        </div>
        {!disabled && (
          <button
            onClick={() => onSubmit(localMedia, uploaded)}
            className="w-full rounded-lg bg-gradient-to-r from-purple-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:from-purple-700 hover:to-violet-700 transition-all"
          >
            {uploaded.length > 0 ? "Re-generate Release Note" : "Generate Release Note"}
          </button>
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
  const { markdown, title, color, icon, onFullscreen, streaming } = data as {
    markdown: string;
    title: string;
    color: string;
    icon: "jira" | "github" | "ai";
    onFullscreen?: () => void;
    streaming?: boolean;
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
          <a href={publishedUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm font-medium text-emerald-400 hover:underline">
            <CheckIcon className="w-4 h-4" /> View in Notion ↗
          </a>
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

/* ── Node type registry ── */
export const flowNodeTypes = {
  jiraInput: JiraInputNode,
  githubInput: GitHubInputNode,
  generateInput: GenerateInputNode,
  loading: LoadingNode,
  result: ResultNode,
  notionInput: NotionInputNode,
};
