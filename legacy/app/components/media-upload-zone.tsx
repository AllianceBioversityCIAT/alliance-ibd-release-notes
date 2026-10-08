"use client";

import { useRef, useState, useCallback } from "react";
import type { LocalMediaItem } from "@/app/lib/types";
import { UploadIcon, ImageIcon } from "./icons";

interface MediaUploadZoneProps {
  onFilesAdded: (items: LocalMediaItem[]) => void;
  variant?: "light" | "dark";
  disabled?: boolean;
}

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

export function MediaUploadZone({ onFilesAdded, variant = "light", disabled }: MediaUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const arr = Array.from(files);
      if (arr.length === 0) return;
      onFilesAdded(arr.map(fileToLocalMedia));
    },
    [onFilesAdded]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (disabled) return;
      handleFiles(e.dataTransfer.files);
    },
    [disabled, handleFiles]
  );

  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!disabled) setDragging(true);
    },
    [disabled]
  );

  const onDragLeave = useCallback(() => setDragging(false), []);

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) handleFiles(e.target.files);
      e.target.value = "";
    },
    [handleFiles]
  );

  const isDark = variant === "dark";

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      className={`relative rounded-lg border-2 border-dashed transition-colors ${
        dragging
          ? isDark
            ? "border-purple-400 bg-purple-500/10"
            : "border-accent bg-accent-light/50"
          : isDark
            ? "border-white/15 hover:border-white/25"
            : "border-card-border hover:border-muted-foreground/40"
      } ${disabled ? "pointer-events-none opacity-50" : "cursor-pointer"}`}
      onClick={() => !disabled && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={onInputChange}
      />

      <div className="flex flex-col items-center gap-2 px-4 py-4">
        <div className={`flex items-center gap-2 ${isDark ? "text-white/40" : "text-muted-foreground"}`}>
          <UploadIcon className="w-5 h-5" />
          <ImageIcon className="w-4 h-4" />
        </div>
        <div className="text-center">
          <span className={`text-xs font-medium ${isDark ? "text-white/60" : "text-foreground"}`}>
            Drop files here
          </span>
          <span className={`text-xs ${isDark ? "text-white/30" : "text-muted-foreground"}`}> or </span>
          <span className={`text-xs font-medium ${isDark ? "text-purple-400" : "text-accent"}`}>
            browse
          </span>
        </div>
        <span className={`text-[10px] ${isDark ? "text-white/25" : "text-muted-foreground/60"}`}>
          Images, videos, or files
        </span>
      </div>
    </div>
  );
}
