"use client";

import type { MediaItem } from "@/app/lib/types";
import { SparklesIcon, LoaderIcon, PlusIcon, ImageIcon, TrashIcon, ExpandIcon } from "./icons";
import { GenerateLoadingSkeleton } from "./loading-skeleton";
import { MarkdownRenderer } from "./markdown-renderer";
import { CopyButton } from "./copy-button";

interface GenerateStepProps {
  media: MediaItem[];
  onMediaChange: (media: MediaItem[]) => void;
  onGenerate: () => void;
  onFullscreen?: () => void;
  loading: boolean;
  error: string | null;
  result: string | null;
}

export function GenerateStep({ media, onMediaChange, onGenerate, onFullscreen, loading, error, result }: GenerateStepProps) {
  function addMedia() {
    onMediaChange([...media, { url: "", ai_context: "" }]);
  }

  function removeMedia(index: number) {
    onMediaChange(media.filter((_, i) => i !== index));
  }

  function updateMedia(index: number, field: keyof MediaItem, value: string) {
    const updated = media.map((item, i) => (i === index ? { ...item, [field]: value } : item));
    onMediaChange(updated);
  }

  return (
    <div className="space-y-5">
      {/* Media section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Media</span>
            <span className="text-xs text-muted-foreground">({media.length} image{media.length !== 1 ? "s" : ""})</span>
          </div>
          <button
            onClick={addMedia}
            className="btn-press inline-flex items-center gap-1.5 rounded-md border border-card-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            Add Image
          </button>
        </div>

        {media.length > 0 && (
          <div className="space-y-2">
            {media.map((item, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg border border-card-border bg-muted/30 p-3">
                <div className="flex-1 space-y-2">
                  <input
                    type="text"
                    value={item.url}
                    onChange={(e) => updateMedia(i, "url", e.target.value)}
                    placeholder="https://example.com/image.png"
                    className="w-full rounded-md border border-card-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-shadow focus:ring-2 focus:ring-ring/30 focus:border-ring"
                  />
                  <input
                    type="text"
                    value={item.ai_context}
                    onChange={(e) => updateMedia(i, "ai_context", e.target.value)}
                    placeholder="e.g. Use as hero banner at the top of the blog post"
                    className="w-full rounded-md border border-card-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none transition-shadow focus:ring-2 focus:ring-ring/30 focus:border-ring"
                  />
                </div>
                {/* Thumbnail preview */}
                {item.url && (
                  <div className="h-14 w-20 flex-shrink-0 overflow-hidden rounded-md border border-card-border bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.url}
                      alt={item.ai_context || "preview"}
                      className="h-full w-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  </div>
                )}
                <button
                  onClick={() => removeMedia(i)}
                  className="mt-1.5 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-error-light hover:text-error"
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
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
              Generating your release note... This may take up to 30 seconds.
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
