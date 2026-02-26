"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";

interface PanelConfig {
  icon: ReactNode;
  color: string;
  title: string;
  isLocked: boolean;
  isComplete: boolean;
  content: ReactNode;
}

interface PanelPos {
  x: number;
  y: number;
  z: number;
}

const DEFAULTS: Record<number, PanelPos> = {
  0: { x: 20, y: 10, z: 1 },
  1: { x: 500, y: 10, z: 2 },
  2: { x: 260, y: 420, z: 3 },
};

interface Props {
  panels: [PanelConfig, PanelConfig, PanelConfig];
  onResetView: () => void;
}

export function WorkspaceView({ panels, onResetView }: Props) {
  const [positions, setPositions] = useState(DEFAULTS);
  const maxZ = useRef(3);
  const dragRef = useRef<{
    id: number;
    startX: number;
    startY: number;
    panelX: number;
    panelY: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragRef.current) return;
      const { id, startX, startY, panelX, panelY } = dragRef.current;
      setPositions((prev) => ({
        ...prev,
        [id]: {
          ...prev[id],
          x: panelX + (e.clientX - startX),
          y: panelY + (e.clientY - startY),
        },
      }));
    }

    function onUp() {
      if (dragRef.current) {
        dragRef.current = null;
        setIsDragging(false);
      }
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  function startDrag(id: number, e: React.MouseEvent) {
    e.preventDefault();
    maxZ.current++;
    setPositions((prev) => ({
      ...prev,
      [id]: { ...prev[id], z: maxZ.current },
    }));
    dragRef.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      panelX: positions[id].x,
      panelY: positions[id].y,
    };
    setIsDragging(true);
  }

  function resetLayout() {
    setPositions(DEFAULTS);
  }

  return (
    <div className="relative min-h-[800px]">
      {/* Reset + back buttons */}
      <div className="absolute -top-12 right-0 flex gap-2 z-50">
        <button
          onClick={resetLayout}
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

      {panels.map((panel, i) => {
        const pos = positions[i];
        return (
          <div
            key={i}
            className="absolute"
            style={{
              left: pos.x,
              top: pos.y,
              zIndex: pos.z,
              width: "min(460px, calc(100vw - 40px))",
              transition: isDragging ? "none" : "left 0.4s ease, top 0.4s ease",
            }}
          >
            <div className="glass-panel overflow-hidden shadow-2xl">
              {/* Drag header */}
              <div
                className="flex items-center gap-2.5 px-4 py-2.5 select-none"
                style={{
                  background: panel.color,
                  cursor: isDragging && dragRef.current?.id === i ? "grabbing" : "grab",
                }}
                onMouseDown={(e) => startDrag(i, e)}
              >
                <div className="text-white/90">{panel.icon}</div>
                <span className="text-sm font-semibold text-white">{panel.title}</span>
                {panel.isComplete && (
                  <span className="ml-auto rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-medium text-white">
                    Done
                  </span>
                )}
              </div>
              {/* Content */}
              <div className="relative max-h-[60vh] overflow-y-auto p-4">
                {panel.isLocked && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 backdrop-blur-[2px]">
                    <p className="text-sm text-gray-400">Complete Step {i} first</p>
                  </div>
                )}
                {panel.content}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
