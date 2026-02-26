"use client";

import type { LocalMediaItem } from "@/app/lib/types";
import { SparklesIcon, LoaderIcon, ImageIcon, TrashIcon, ExpandIcon } from "./icons";
import { GenerateLoadingSkeleton } from "./loading-skeleton";
import { MarkdownRenderer } from "./markdown-renderer";
import { CopyButton } from "./copy-button";
import { MediaUploadZone } from "./media-upload-zone";

interface GenerateStepProps {
  media: LocalMediaItem[];
  onMediaChange: (media: LocalMediaItem[]) => void;
  onGenerate: () => void;
  onFullscreen?: () => void;
  loading: boolean;
  error: string | null;
  result: string | null;
}

export function GenerateStep({ media, onMediaChange, onGenerate, onFullscreen, loading, error, result }: GenerateStepProps) {
  function removeMedia(index: number) {
    const item = media[index];
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    onMediaChange(media.filter((_, i) => i !== index));
  }

  function updateContext(index: number, value: string) {
    onMediaChange(media.map((item, i) => (i === index ? { ...item, ai_context: value } : item)));
  }

  return (
    <div className="space-y-5">
      {/* Media section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Media</span>
          <span className="text-xs text-muted-foreground">({media.length} file{media.length !== 1 ? "s" : ""})</span>
        </div>

        {/* Local file list */}
        {media.length > 0 && (
          <div className="space-y-2">
            {media.map((item, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg border border-card-border bg-muted/30 p-3">
                {/* Preview */}
                {item.type === "image" && item.previewUrl && (
                  <div className="h-16 w-24 flex-shrink-0 overflow-hidden rounded-md border border-card-border bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.previewUrl} alt={item.file.name} className="h-full w-full object-cover" />
                  </div>
                )}
                {item.type === "video" && item.previewUrl && (
                  <div className="h-16 w-24 flex-shrink-0 overflow-hidden rounded-md border border-card-border bg-muted">
                    <video src={item.previewUrl} className="h-full w-full object-cover" muted />
                  </div>
                )}
                {item.type === "file" && (
                  <div className="flex h-16 w-24 flex-shrink-0 items-center justify-center rounded-md border border-card-border bg-muted text-muted-foreground">
                    <span className="text-[10px] font-medium text-center px-1 break-all line-clamp-3">{item.file.name}</span>
                  </div>
                )}

                {/* Context input + filename */}
                <div className="flex-1 space-y-1.5">
                  <p className="text-xs font-medium text-foreground truncate">{item.file.name}</p>
                  <input
                    type="text"
                    value={item.ai_context}
                    onChange={(e) => updateContext(i, e.target.value)}
                    placeholder="Context for AI, e.g. Use as hero banner"
                    className="w-full rounded-md border border-card-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-shadow focus:ring-2 focus:ring-ring/30 focus:border-ring"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    {(item.file.size / 1024).toFixed(0)} KB
                  </p>
                </div>

                <button
                  onClick={() => removeMedia(i)}
                  className="mt-1 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-error-light hover:text-error"
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Upload zone */}
        <MediaUploadZone
          variant="light"
          onFilesAdded={(items) => onMediaChange([...media, ...items])}
        />
      </div>

      {/* Generate button */}
      {!result && !loading && (
        <button
          onClick={onGenerate}
          disabled={loading}
          className="btn-press inline-flex w-full items-center justify-center gap-2.5 rounded-lg bg-accent px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <SparklesIcon className="w-5 h-5" />
          Generate Release Note
        </button>
      )}

      {loading && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-lg border border-accent/30 bg-accent-light px-4 py-3">
            <LoaderIcon className="w-5 h-5 text-accent" />
            <span className="text-sm font-medium text-accent">
              Uploading files &amp; generating... This may take up to 30 seconds.
            </span>
          </div>
          <GenerateLoadingSkeleton />
        </div>
      )}

      {error && (
        <div className="animate-fade-in rounded-lg border border-error/30 bg-error-light px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      {result && !loading && (
        <div className="animate-slide-up space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-success" />
              <span className="text-sm font-medium text-success">Release note generated</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onGenerate}
                className="btn-press inline-flex items-center gap-1.5 rounded-md border border-card-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                <SparklesIcon className="w-3.5 h-3.5" />
                Regenerate
              </button>
              {onFullscreen && (
                <button
                  onClick={onFullscreen}
                  className="btn-press inline-flex items-center gap-1.5 rounded-md border border-card-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <ExpandIcon className="w-3.5 h-3.5" />
                  Fullscreen
                </button>
              )}
              <CopyButton text={result} />
            </div>
          </div>
          <div className="rounded-lg border border-card-border bg-muted/50 p-5 sm:p-6">
            <MarkdownRenderer content={result} />
          </div>
        </div>
      )}
    </div>
  );
}
