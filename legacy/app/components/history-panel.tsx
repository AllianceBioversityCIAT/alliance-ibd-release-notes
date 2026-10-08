"use client";

import { useState, useEffect } from "react";
import type { HistoryEntry } from "@/app/lib/types";
import { getNotes, deleteNote } from "@/app/lib/history";
import { XIcon, TrashIcon, ArrowLeftIcon } from "./icons";
import { MarkdownRenderer } from "./markdown-renderer";
import { CopyButton } from "./copy-button";

interface HistoryPanelProps {
  open: boolean;
  onClose: () => void;
}

export function HistoryPanel({ open, onClose }: HistoryPanelProps) {
  const [notes, setNotes] = useState<HistoryEntry[]>([]);
  const [viewing, setViewing] = useState<HistoryEntry | null>(null);

  useEffect(() => {
    if (open) setNotes(getNotes());
  }, [open]);

  function handleDelete(id: string) {
    deleteNote(id);
    setNotes(getNotes());
    if (viewing?.id === id) setViewing(null);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative ml-auto flex h-full w-full max-w-2xl flex-col bg-card shadow-2xl animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-card-border px-5 py-4">
          <div className="flex items-center gap-3">
            {viewing && (
              <button
                onClick={() => setViewing(null)}
                className="rounded-md p-1 hover:bg-muted transition-colors"
              >
                <ArrowLeftIcon />
              </button>
            )}
            <h2 className="text-base font-semibold text-foreground">
              {viewing ? viewing.jiraKey : "Saved Release Notes"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 hover:bg-muted transition-colors"
          >
            <XIcon />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {viewing ? (
            <div className="space-y-4">
              <div className="flex justify-end">
                <CopyButton text={viewing.markdown} />
              </div>
              <MarkdownRenderer content={viewing.markdown} />
            </div>
          ) : notes.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              No saved release notes yet.
            </div>
          ) : (
            <div className="space-y-2">
              {notes.map((note) => (
                <div
                  key={note.id}
                  className="group flex items-center justify-between rounded-lg border border-card-border p-3.5 transition-colors hover:bg-muted cursor-pointer"
                  onClick={() => setViewing(note)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex rounded-full bg-accent-light px-2 py-0.5 text-xs font-medium text-accent">
                        {note.jiraKey}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(note.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm font-medium text-foreground">
                      {note.title}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(note.id);
                    }}
                    className="ml-3 rounded-md p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-error-light hover:text-error group-hover:opacity-100"
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
