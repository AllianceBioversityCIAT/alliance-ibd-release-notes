"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import "@uiw/react-md-editor/markdown-editor.css";
import "@uiw/react-markdown-preview/markdown.css";

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave: (value: string) => void;
  onCancel: () => void;
}

export function MarkdownEditorView({ value, onChange, onSave, onCancel }: MarkdownEditorProps) {
  const [preview, setPreview] = useState<"edit" | "live" | "preview">("live");

  const handleSave = useCallback(() => {
    onSave(value);
  }, [value, onSave]);

  return (
    <div className="flex flex-col h-full" data-color-mode="light">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2 flex-shrink-0 bg-white">
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-gray-100 p-0.5">
            <button
              onClick={() => setPreview("edit")}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                preview === "edit" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Edit
            </button>
            <button
              onClick={() => setPreview("live")}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                preview === "live" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Split
            </button>
            <button
              onClick={() => setPreview("preview")}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                preview === "preview" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Preview
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="rounded-lg bg-purple-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-purple-700 transition-colors"
          >
            Save Changes
          </button>
        </div>
      </div>
      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        <MDEditor
          value={value}
          onChange={(v) => onChange(v ?? "")}
          preview={preview}
          height="100%"
          visibleDragbar={false}
          hideToolbar={false}
        />
      </div>
    </div>
  );
}
