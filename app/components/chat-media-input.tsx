"use client";

import { useRef, useState, useCallback } from "react";
import type { LocalMediaItem, UploadedMediaItem } from "@/app/lib/types";
import { ImageIcon, XIcon, PlusIcon, CheckIcon } from "./icons";

function fileToLocalMedia(file: File): LocalMediaItem {
  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  return {
    file,
    ai_context: "",
    previewUrl: isImage || isVideo ? URL.createObjectURL(file) : "",
    type: isImage ? "image" : isVideo ? "video" : "file",
  };
}

interface ChatMediaInputProps {
  localMedia: LocalMediaItem[];
  setLocalMedia: React.Dispatch<React.SetStateAction<LocalMediaItem[]>>;
  uploaded: UploadedMediaItem[];
  setUploaded: React.Dispatch<React.SetStateAction<UploadedMediaItem[]>>;
  generalContext: string;
  setGeneralContext: React.Dispatch<React.SetStateAction<string>>;
  disabled?: boolean;
}

export function ChatMediaInput({
  localMedia,
  setLocalMedia,
  uploaded,
  setUploaded,
  generalContext,
  setGeneralContext,
  disabled,
}: ChatMediaInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<{ type: "local" | "uploaded"; idx: number } | null>(null);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const arr = Array.from(files).filter(
        (f) => f.type.startsWith("image/") || f.type.startsWith("video/")
      );
      if (arr.length === 0) return;
      setLocalMedia((prev) => [...prev, ...arr.map(fileToLocalMedia)]);
    },
    [setLocalMedia]
  );

  // Handle paste (Cmd+V) — detect images in clipboard
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === "file" && (item.type.startsWith("image/") || item.type.startsWith("video/"))) {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        addFiles(files);
      }
    },
    [addFiles]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (disabled) return;
      addFiles(e.dataTransfer.files);
    },
    [disabled, addFiles]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!disabled) setDragOver(true);
    },
    [disabled]
  );

  const removeLocal = (i: number) => {
    const item = localMedia[i];
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    setLocalMedia((prev) => prev.filter((_, idx) => idx !== i));
    if (expandedIdx?.type === "local" && expandedIdx.idx === i) setExpandedIdx(null);
  };

  const removeUploaded = (i: number) => {
    setUploaded((prev) => prev.filter((_, idx) => idx !== i));
    if (expandedIdx?.type === "uploaded" && expandedIdx.idx === i) setExpandedIdx(null);
  };

  const updateLocalContext = (i: number, value: string) => {
    setLocalMedia((prev) => prev.map((item, idx) => (idx === i ? { ...item, ai_context: value } : item)));
  };

  const updateUploadedContext = (i: number, value: string) => {
    setUploaded((prev) => prev.map((item, idx) => (idx === i ? { ...item, ai_context: value } : item)));
  };

  const totalMedia = uploaded.length + localMedia.length;

  return (
    <div className={`space-y-2 ${disabled ? "pointer-events-none opacity-50" : ""}`}>
      {/* Image thumbnails row */}
      {totalMedia > 0 && (
        <div className="nowheel flex flex-wrap gap-1.5 max-h-[200px] overflow-y-auto pr-1">
          {/* Uploaded thumbnails */}
          {uploaded.map((item, i) => (
            <div key={`up-${i}`} className="relative group">
              <button
                onClick={() => setExpandedIdx(expandedIdx?.type === "uploaded" && expandedIdx.idx === i ? null : { type: "uploaded", idx: i })}
                className={`relative h-14 w-14 rounded-lg border-2 overflow-hidden transition-all ${
                  expandedIdx?.type === "uploaded" && expandedIdx.idx === i
                    ? "border-purple-500 ring-2 ring-purple-500/30"
                    : "border-emerald-500/40 hover:border-emerald-500"
                }`}
              >
                <div className="absolute inset-0 bg-emerald-500/10 flex items-center justify-center">
                  <CheckIcon className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-0.5 py-px">
                  <span className="text-[7px] text-white/80 truncate block">{item.fileName.slice(0, 10)}</span>
                </div>
              </button>
              <button
                onClick={() => removeUploaded(i)}
                className="absolute -top-1 -right-1 rounded-full bg-gray-800 border border-white/20 p-0.5 text-white/60 hover:text-red-400 hover:bg-red-500/20 opacity-0 group-hover:opacity-100 transition-all"
              >
                <XIcon className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
          {/* Local thumbnails */}
          {localMedia.map((item, i) => (
            <div key={`loc-${i}`} className="relative group">
              <button
                onClick={() => setExpandedIdx(expandedIdx?.type === "local" && expandedIdx.idx === i ? null : { type: "local", idx: i })}
                className={`relative h-14 w-14 rounded-lg border-2 overflow-hidden transition-all ${
                  expandedIdx?.type === "local" && expandedIdx.idx === i
                    ? "border-purple-500 ring-2 ring-purple-500/30"
                    : "border-white/20 hover:border-white/40"
                }`}
              >
                {item.type === "image" && item.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-white/5 flex items-center justify-center">
                    <ImageIcon className="w-4 h-4 text-white/30" />
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-0.5 py-px">
                  <span className="text-[7px] text-white/80 truncate block">{item.file.name.slice(0, 10)}</span>
                </div>
              </button>
              <button
                onClick={() => removeLocal(i)}
                className="absolute -top-1 -right-1 rounded-full bg-gray-800 border border-white/20 p-0.5 text-white/60 hover:text-red-400 hover:bg-red-500/20 opacity-0 group-hover:opacity-100 transition-all"
              >
                <XIcon className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
          {/* Add more button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="h-14 w-14 rounded-lg border-2 border-dashed border-white/15 hover:border-purple-500/40 flex items-center justify-center transition-colors"
          >
            <PlusIcon className="w-4 h-4 text-white/30" />
          </button>
        </div>
      )}

      {/* Per-image context (expanded) */}
      {expandedIdx && (
        <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-2 space-y-1">
          <p className="text-[10px] font-medium text-purple-400">
            Context for: {expandedIdx.type === "uploaded"
              ? uploaded[expandedIdx.idx]?.fileName
              : localMedia[expandedIdx.idx]?.file.name}
          </p>
          <textarea
            value={
              expandedIdx.type === "uploaded"
                ? uploaded[expandedIdx.idx]?.ai_context ?? ""
                : localMedia[expandedIdx.idx]?.ai_context ?? ""
            }
            onChange={(e) =>
              expandedIdx.type === "uploaded"
                ? updateUploadedContext(expandedIdx.idx, e.target.value)
                : updateLocalContext(expandedIdx.idx, e.target.value)
            }
            placeholder="What does this image show? (optional)"
            rows={2}
            className="nowheel w-full rounded border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] text-white placeholder:text-white/25 outline-none focus:ring-1 focus:ring-purple-500/40 resize-none"
          />
        </div>
      )}

      {/* Main textarea — paste images or type general context */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={() => setDragOver(false)}
        className={`relative rounded-xl border-2 transition-colors ${
          dragOver ? "border-purple-400 bg-purple-500/10" : "border-white/10 hover:border-white/20"
        }`}
      >
        <textarea
          ref={textareaRef}
          value={generalContext}
          onChange={(e) => setGeneralContext(e.target.value)}
          onPaste={handlePaste}
          placeholder={totalMedia > 0
            ? "General context for all images... (or paste more images with Cmd+V)"
            : "Paste images (Cmd+V), drag & drop, or type context..."}
          rows={3}
          className="nowheel w-full rounded-xl bg-transparent px-3 py-2.5 text-xs text-white placeholder:text-white/25 outline-none resize-none"
        />
        <div className="flex items-center justify-between px-3 pb-2">
          <div className="flex items-center gap-2 text-[10px] text-white/30">
            <ImageIcon className="w-3 h-3" />
            <span>Paste, drop, or</span>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-purple-400 hover:text-purple-300 font-medium"
            >
              import
            </button>
          </div>
          {totalMedia > 0 && (
            <span className="text-[10px] text-white/40">{totalMedia} file{totalMedia !== 1 ? "s" : ""}</span>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
