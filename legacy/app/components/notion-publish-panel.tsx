"use client";

import { useState, useEffect } from "react";
import type { NotionPublishPayload, NotionPublishResult } from "@/app/lib/types";
import { LoaderIcon, CheckIcon } from "./icons";
import { NotionIcon } from "./brand-icons";
import { getNotionOptions } from "@/app/lib/api";

interface Props {
  onPublish: (payload: NotionPublishPayload) => Promise<NotionPublishResult>;
  /** "dark" for flow nodes (default), "light" for fullscreen white background */
  theme?: "dark" | "light";
}

export function NotionPublishPanel({ onPublish, theme = "dark" }: Props) {
  const [open, setOpen] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tags, setTags] = useState<string[]>([]);
  const [allProjects, setAllProjects] = useState<string[]>([]);
  const [tag, setTag] = useState("");
  const [projects, setProjects] = useState<string[]>([]);
  const [brief, setBrief] = useState("");

  useEffect(() => {
    if (!open || tags.length > 0) return;
    getNotionOptions()
      .then(({ tags: t, projects: p }) => { setTags(t); setAllProjects(p); })
      .catch(() => {});
  }, [open, tags.length]);

  async function handleSubmit() {
    setPublishing(true);
    setError(null);
    try {
      const res = await onPublish({ tag, projects, brief_description: brief });
      setPublishedUrl(res.url);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error publishing");
    } finally {
      setPublishing(false);
    }
  }

  const light = theme === "light";

  if (publishedUrl) {
    return (
      <div className={`flex items-center gap-2 px-4 py-2.5 ${light ? "bg-emerald-50 border border-emerald-200 rounded-lg" : "border-t border-white/10 bg-emerald-500/10"}`}>
        <CheckIcon className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
        <a href={publishedUrl} target="_blank" rel="noopener noreferrer"
          className={`text-sm font-medium hover:underline truncate ${light ? "text-emerald-700" : "text-emerald-400 text-[11px]"}`}>
          Published in Notion ↗
        </a>
      </div>
    );
  }

  return (
    <div className={light ? "" : "border-t border-white/10 bg-[#13131f]"}>
      {!open ? (
        <button onClick={() => setOpen(true)}
          className={`flex items-center gap-1.5 transition-colors ${
            light
              ? "rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 shadow-sm"
              : "w-full justify-center px-4 py-2 text-[11px] font-medium text-white/50 hover:text-white/80 hover:bg-white/5"
          }`}>
          <NotionIcon className="w-3.5 h-3.5" />
          Publish to Notion
        </button>
      ) : (
        <div
          className={`space-y-2.5 ${light ? "mt-2 rounded-xl border border-gray-200 bg-white p-4 shadow-md" : "p-3"}`}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Tag */}
          <div>
            <label className={`block text-[10px] font-medium mb-1 ${light ? "text-gray-500" : "text-white/40"}`}>Tag</label>
            <select value={tag} onChange={(e) => setTag(e.target.value)}
              className={`w-full rounded-md border px-2 py-1.5 text-xs outline-none focus:ring-1 ${
                light
                  ? "border-gray-200 bg-white text-gray-800 focus:ring-gray-300"
                  : "border-white/10 bg-white/5 text-white focus:ring-purple-500/40"
              }`}>
              <option value="">— none —</option>
              {tags.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Projects */}
          <div>
            <label className={`block text-[10px] font-medium mb-1 ${light ? "text-gray-500" : "text-white/40"}`}>Projects</label>
            <div className={`max-h-28 overflow-y-auto rounded-md border p-2 grid grid-cols-2 gap-x-3 gap-y-1 ${light ? "border-gray-200 bg-gray-50" : "border-white/10 bg-white/5"}`}>
              {allProjects.map((p) => (
                <label key={p} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={projects.includes(p)}
                    onChange={(e) => setProjects(e.target.checked ? [...projects, p] : projects.filter((x) => x !== p))}
                    className="accent-purple-500 w-3 h-3" />
                  <span className={`text-[10px] truncate ${light ? "text-gray-700" : "text-white/70"}`}>{p}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Brief description */}
          <div>
            <label className={`block text-[10px] font-medium mb-1 ${light ? "text-gray-500" : "text-white/40"}`}>Brief description (optional)</label>
            <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={2}
              placeholder="Short summary shown in the gallery..."
              className={`w-full rounded-md border px-2 py-1.5 text-xs placeholder:text-opacity-40 outline-none focus:ring-1 resize-none ${
                light
                  ? "border-gray-200 bg-white text-gray-800 placeholder:text-gray-400 focus:ring-gray-300"
                  : "border-white/10 bg-white/5 text-white placeholder:text-white/25 focus:ring-purple-500/40"
              }`} />
          </div>

          {error && <p className="text-[10px] text-red-500">{error}</p>}

          <div className="flex gap-2">
            <button onClick={() => setOpen(false)}
              className={`flex-1 rounded-md border px-3 py-1.5 text-[11px] transition-colors ${
                light ? "border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-50" : "border-white/10 text-white/50 hover:text-white/80"
              }`}>
              Cancel
            </button>
            <button onClick={handleSubmit} disabled={publishing}
              className={`flex-1 rounded-md px-3 py-1.5 text-[11px] font-semibold disabled:opacity-40 flex items-center justify-center gap-1 transition-colors ${
                light ? "bg-black text-white hover:bg-gray-800" : "bg-black text-white hover:bg-white/10"
              }`}>
              {publishing ? <LoaderIcon className="w-3 h-3" /> : <NotionIcon className="w-3 h-3" />}
              {publishing ? "Publishing..." : "Publish"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
