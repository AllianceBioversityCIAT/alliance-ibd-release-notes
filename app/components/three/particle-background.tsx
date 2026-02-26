"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { LeafField, type ParticleState } from "./particle-field";

interface Props {
  state: ParticleState;
  mouse: { x: number; y: number };
}

export function ParticleScene({ state, mouse }: Props) {
  return (
    <div className="fixed inset-0" style={{ zIndex: 20, pointerEvents: "none" }}>
      <Canvas
        camera={{ position: [0, 0, 10], fov: 50 }}
        gl={{ alpha: true, antialias: false, powerPreference: "high-performance" }}
        dpr={[1, 1.5]}
        style={{ background: "transparent", pointerEvents: "none" }}
        eventSource={undefined as unknown as HTMLElement}
        eventPrefix="client"
      >
        <Suspense fallback={null}>
          <LeafField state={state} mouse={mouse} />
        </Suspense>
      </Canvas>
    </div>
  );
}
