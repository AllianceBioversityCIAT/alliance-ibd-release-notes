"use client";

import { useRef, type ReactNode } from "react";
import type { ParticleState } from "./three/particle-field";

interface PanelConfig {
  icon: ReactNode;
  color: string;
  title: string;
  subtitle: string;
  isLocked: boolean;
  isComplete: boolean;
  content: ReactNode;
}

interface Props {
  activeStep: number;
  particleState: ParticleState;
  panels: PanelConfig[];
  onStepChange: (step: number) => void;
}

export function PanoramicView({ activeStep, particleState, panels, onStepChange }: Props) {
  const touchStart = useRef(0);

  function onTouchStart(e: React.TouchEvent) {
    touchStart.current = e.touches[0].clientX;
  }

  function onTouchEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0].clientX - touchStart.current;
    if (dx > 60 && activeStep > 1) onStepChange(activeStep - 1);
    if (dx < -60 && activeStep < 3 && !panels[activeStep]?.isLocked) onStepChange(activeStep + 1);
  }

  const isLoadingOrAI =
    particleState.includes("loading") || particleState === "ai-generating";

  return (
    <div className="relative overflow-hidden" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div
        className="flex"
        style={{
          transform: `translateX(-${(activeStep - 1) * 100}%)`,
          transition: "transform 800ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {panels.map((panel, i) => {
          const offset = i - (activeStep - 1);
          const isActive = offset === 0;

          return (
            <div
              key={i}
              className="w-full flex-shrink-0 px-2 sm:px-4"
              style={{
                transform: `perspective(1200px) rotateY(${offset * -5}deg) scale(${isActive ? 1 : 0.88})`,
                opacity: isActive ? 1 : 0.3,
                transition: "all 800ms cubic-bezier(0.22, 1, 0.36, 1)",
                transformOrigin: offset < 0 ? "right center" : offset > 0 ? "left center" : "center center",
              }}
            >
              <div
                className={`glass-panel overflow-hidden ${isActive ? "animated-border" : ""} ${
                  isActive && isLoadingOrAI ? "border-glow" : ""
                }`}
              >
                {/* Header */}
                <div
                  className="flex items-center gap-3 px-5 py-3.5"
                  style={{
                    background: `linear-gradient(135deg, ${panel.color}10 0%, transparent 60%)`,
                    borderBottom: "1px solid rgba(0,0,0,0.06)",
                  }}
                >
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-lg"
                    style={{ background: `linear-gradient(135deg, ${panel.color}, ${panel.color}cc)` }}
                  >
                    {panel.icon}
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900">{panel.title}</h2>
                    <p className="text-[11px] text-gray-400">{panel.subtitle}</p>
                  </div>
                  {panel.isComplete && (
                    <span className="ml-auto flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Done
                    </span>
                  )}
                </div>
                {/* Content */}
                <div className="relative p-5 sm:p-6">
                  {panel.isLocked && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-white/90 backdrop-blur-sm rounded-b-[20px]">
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
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
