"use client";

import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import { ExpandIcon, ShrinkIcon } from "./icons";

interface PanelConfig {
  icon: ReactNode;
  color: string;
  title: string;
  isLocked: boolean;
  isComplete: boolean;
  content: ReactNode;
}

interface PanelRect {
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
}

function getDefaults(): Record<number, PanelRect> {
  const vw = window.innerWidth;
  const gap = 12;
  // Use 94% of viewport, leave 3% margin each side
  const total = Math.floor(vw * 0.94);
  const startX = Math.floor(vw * 0.03);
  const usable = total - gap * 2;
  const w0 = Math.floor(usable * 0.3);
  const w1 = Math.floor(usable * 0.3);
  const w2 = Math.floor(usable * 0.4);
  // Offset relative to the max-w-5xl container center
  const containerLeft = Math.max(0, (vw - 1024) / 2);
  const ox = startX - containerLeft;
  return {
    0: { x: ox, y: 10, w: w0, h: 520, z: 1 },
    1: { x: ox + w0 + gap, y: 10, w: w1, h: 520, z: 2 },
    2: { x: ox + w0 + gap + w1 + gap, y: 10, w: w2, h: 520, z: 3 },
  };
}

interface Props {
  panels: [PanelConfig, PanelConfig, PanelConfig];
  onResetView: () => void;
}

export function WorkspaceView({ panels, onResetView }: Props) {
  const [rects, setRects] = useState<Record<number, PanelRect>>(() => {
    if (typeof window === "undefined") {
      return { 0: { x: 0, y: 10, w: 293, h: 520, z: 1 }, 1: { x: 303, y: 10, w: 293, h: 520, z: 2 }, 2: { x: 606, y: 10, w: 392, h: 520, z: 3 } };
    }
    return getDefaults();
  });
  const [expandedPanel, setExpandedPanel] = useState<number | null>(null);
  const maxZ = useRef(3);

  // Drag state
  const dragRef = useRef<{
    type: "move" | "resize";
    id: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (!dragRef.current) return;
    const { type, id, startX, startY, origX, origY, origW, origH } = dragRef.current;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    setRects((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        ...(type === "move"
          ? { x: origX + dx, y: origY + dy }
          : { w: Math.max(280, origW + dx), h: Math.max(200, origH + dy) }),
      },
    }));
  }, []);

  const onPointerUp = useCallback(() => {
    if (dragRef.current) {
      dragRef.current = null;
      setDragging(false);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [onPointerMove, onPointerUp]);

  function bringToFront(id: number) {
    maxZ.current++;
    setRects((prev) => ({ ...prev, [id]: { ...prev[id], z: maxZ.current } }));
  }

  function startMove(id: number, e: React.PointerEvent) {
    e.preventDefault();
    bringToFront(id);
    dragRef.current = {
      type: "move",
      id,
      startX: e.clientX,
      startY: e.clientY,
      origX: rects[id].x,
      origY: rects[id].y,
      origW: rects[id].w,
      origH: rects[id].h,
    };
    setDragging(true);
  }

  function startResize(id: number, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    bringToFront(id);
    dragRef.current = {
      type: "resize",
      id,
      startX: e.clientX,
      startY: e.clientY,
      origX: rects[id].x,
      origY: rects[id].y,
      origW: rects[id].w,
      origH: rects[id].h,
    };
    setDragging(true);
  }

  // Fullscreen overlay
  if (expandedPanel !== null) {
    const panel = panels[expandedPanel];
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-white">
        <div
          className="flex items-center justify-between px-5 py-3 shadow-sm"
          style={{ background: `linear-gradient(135deg, ${panel.color}12 0%, transparent 60%)`, borderBottom: "1px solid rgba(0,0,0,0.08)" }}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg text-white" style={{ background: panel.color }}>
              {panel.icon}
            </div>
            <h2 className="text-sm font-semibold text-gray-900">{panel.title}</h2>
            {panel.isComplete && (
              <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Done
              </span>
            )}
          </div>
          <button
            onClick={() => setExpandedPanel(null)}
            className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-200 transition-colors"
          >
            <ShrinkIcon className="w-3.5 h-3.5" />
            Exit Fullscreen
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 sm:p-10">
          <div className="mx-auto max-w-4xl">{panel.content}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative" style={{ minHeight: "calc(100vh - 120px)" }}>
      {/* Controls */}
      <div className="flex items-center justify-end gap-2 mb-3">
        <button
          onClick={() => setRects(getDefaults())}
          className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white/60 hover:bg-white/15 hover:text-white/80 transition-colors"
        >
          Reset Layout
        </button>
        <button
          onClick={onResetView}
          className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white/60 hover:bg-white/15 hover:text-white/80 transition-colors"
        >
          Back to Focus
        </button>
      </div>

      {/* Floating panels */}
      {panels.map((panel, i) => {
        const r = rects[i];
        return (
          <div
            key={i}
            className="absolute"
            style={{
              left: r.x,
              top: r.y,
              width: r.w,
              height: r.h,
              zIndex: r.z,
              transition: dragging ? "none" : "left 0.3s ease, top 0.3s ease, width 0.3s ease, height 0.3s ease",
            }}
            onPointerDown={() => bringToFront(i)}
          >
            <div className="glass-panel flex flex-col h-full overflow-hidden">
              {/* Drag header */}
              <div
                className="flex items-center gap-2 px-3 py-2 select-none flex-shrink-0"
                style={{
                  background: `linear-gradient(135deg, ${panel.color}15 0%, transparent 60%)`,
                  borderBottom: "1px solid rgba(0,0,0,0.06)",
                  cursor: dragging && dragRef.current?.id === i && dragRef.current.type === "move" ? "grabbing" : "grab",
                }}
                onPointerDown={(e) => startMove(i, e)}
              >
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-white shadow-sm"
                  style={{ background: `linear-gradient(135deg, ${panel.color}, ${panel.color}cc)` }}
                >
                  {panel.icon}
                </div>
                <span className="text-xs font-semibold text-gray-900 truncate">{panel.title}</span>
                {panel.isComplete && (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                    <span className="h-1 w-1 rounded-full bg-emerald-500" />
                    Done
                  </span>
                )}
                {/* Expand */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedPanel(i);
                  }}
                  className="ml-auto rounded p-1 text-gray-400 hover:bg-black/5 hover:text-gray-600 transition-colors"
                  title="Fullscreen"
                >
                  <ExpandIcon className="w-3 h-3" />
                </button>
              </div>

              {/* Content */}
              <div className="relative flex-1 overflow-y-auto p-4">
                {panel.isLocked && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-white/90 backdrop-blur-sm">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
                      <svg className="w-5 h-5 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0110 0v4" />
                      </svg>
                    </div>
                    <p className="text-sm text-gray-400">Complete Step {i} first</p>
                  </div>
                )}
                {panel.content}
              </div>

              {/* Resize handle (bottom-right corner) */}
              <div
                className="absolute bottom-0 right-0 h-5 w-5 cursor-nwse-resize"
                onPointerDown={(e) => startResize(i, e)}
              >
                <svg className="absolute bottom-1 right-1 w-3 h-3 text-gray-300" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="20" cy="20" r="2.5" />
                  <circle cx="12" cy="20" r="2.5" />
                  <circle cx="20" cy="12" r="2.5" />
                </svg>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
