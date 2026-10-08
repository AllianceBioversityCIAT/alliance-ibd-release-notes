"use client";

import { useRef, useMemo } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";

export type ParticleState =
  | "idle"
  | "jira-loading"
  | "commits-loading"
  | "ai-generating"
  | "complete";

const COUNT = 50;

// How many leaves are visible per state
const VISIBLE: Record<ParticleState, number> = {
  idle: 0,
  "jira-loading": 35,
  "commits-loading": 35,
  "ai-generating": 50,
  complete: 0,
};

// Movement speeds per state
const SPEEDS: Record<ParticleState, { move: number; spin: number; vortex: number }> = {
  idle: { move: 0.25, spin: 0.3, vortex: 0 },
  "jira-loading": { move: 1.6, spin: 2.5, vortex: 1.0 },
  "commits-loading": { move: 1.6, spin: 2.5, vortex: 1.0 },
  "ai-generating": { move: 2.8, spin: 4, vortex: 2.0 },
  complete: { move: 0.35, spin: 0.4, vortex: 0 },
};

interface Props {
  state: ParticleState;
  mouse: { x: number; y: number };
}

function isLoading(s: ParticleState) {
  return s === "jira-loading" || s === "commits-loading" || s === "ai-generating";
}

export function LeafField({ state, mouse }: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const prevState = useRef(state);
  const scattering = useRef(false);

  // Reusable temp objects (avoid GC pressure)
  const tmp = useMemo(
    () => ({
      mat: new THREE.Matrix4(),
      quat: new THREE.Quaternion(),
      euler: new THREE.Euler(),
      pos: new THREE.Vector3(),
      scl: new THREE.Vector3(),
    }),
    []
  );

  // Leaf texture
  const texture = useLoader(
    THREE.TextureLoader,
    "/ai-generated-mango-leaf-clip-art-free-png.png"
  );

  // Per-leaf simulation data
  const leaf = useMemo(() => {
    const d = {
      px: new Float32Array(COUNT),
      py: new Float32Array(COUNT),
      pz: new Float32Array(COUNT),
      vx: new Float32Array(COUNT),
      vy: new Float32Array(COUNT),
      vz: new Float32Array(COUNT),
      // Full 3-axis rotation (accumulated, not clamped)
      rx: new Float32Array(COUNT),
      ry: new Float32Array(COUNT),
      rz: new Float32Array(COUNT),
      // Base rotation speeds per axis
      rsX: new Float32Array(COUNT),
      rsY: new Float32Array(COUNT),
      rsZ: new Float32Array(COUNT),
      // Burst impulse (explosion when loading ends)
      bx: new Float32Array(COUNT),
      by: new Float32Array(COUNT),
      bz: new Float32Array(COUNT),
      phase: new Float32Array(COUNT),
      scale: new Float32Array(COUNT),
      opacity: new Float32Array(COUNT),
    };
    for (let i = 0; i < COUNT; i++) {
      d.px[i] = (Math.random() - 0.5) * 30;
      d.py[i] = (Math.random() - 0.5) * 20;
      d.pz[i] = (Math.random() - 0.5) * 10 - 2;
      d.vx[i] = (Math.random() - 0.5) * 0.004;
      d.vy[i] = -Math.random() * 0.006 - 0.002; // falling
      d.vz[i] = (Math.random() - 0.5) * 0.001;
      // Random start orientation
      d.rx[i] = Math.random() * Math.PI * 2;
      d.ry[i] = Math.random() * Math.PI * 2;
      d.rz[i] = Math.random() * Math.PI * 2;
      // Varied rotation speeds per axis (some fast, some slow)
      d.rsX[i] = (Math.random() - 0.5) * 0.025;
      d.rsY[i] = (Math.random() - 0.5) * 0.03;
      d.rsZ[i] = (Math.random() - 0.5) * 0.02;
      d.phase[i] = Math.random() * Math.PI * 2;
      d.scale[i] = 0.3 + Math.random() * 0.5;
      d.opacity[i] = 0;
    }
    return d;
  }, []);

  // Instanced geometry with per-leaf opacity attribute
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(1, 1.4);
    geo.setAttribute(
      "aOpacity",
      new THREE.InstancedBufferAttribute(new Float32Array(COUNT), 1)
    );
    return geo;
  }, []);

  // Leaf shader material
  const material = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTexture: { value: texture } },
      vertexShader: `
        attribute float aOpacity;
        varying float vOp;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vOp = aOpacity;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uTexture;
        varying float vOp;
        varying vec2 vUv;
        void main() {
          vec4 tex = texture2D(uTexture, vUv);
          if (tex.a < 0.12) discard;
          gl_FragColor = vec4(tex.rgb, tex.a * vOp);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    return mat;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update texture when loaded
  useMemo(() => {
    if (texture) material.uniforms.uTexture.value = texture;
  }, [texture, material]);

  useFrame((fs) => {
    if (!meshRef.current) return;
    const t = fs.clock.elapsedTime;
    const { move, spin, vortex } = SPEEDS[state];
    const target = VISIBLE[state];
    const opAttr = geometry.getAttribute("aOpacity") as THREE.InstancedBufferAttribute;
    const opArr = opAttr.array as Float32Array;

    // Detect loading → not-loading transition → trigger scatter explosion
    if (state !== prevState.current) {
      if (isLoading(prevState.current) && !isLoading(state)) {
        scattering.current = true;
        for (let i = 0; i < COUNT; i++) {
          if (leaf.opacity[i] > 0.05) {
            // Direction: outward from center + random
            const px = leaf.px[i] || 0.1;
            const py = leaf.py[i] || 0.1;
            const dist = Math.sqrt(px * px + py * py) || 1;
            const force = 0.2 + Math.random() * 0.15;
            leaf.bx[i] = (px / dist) * force + (Math.random() - 0.5) * 0.1;
            leaf.by[i] = (py / dist) * force + (Math.random() - 0.5) * 0.1;
            leaf.bz[i] = (Math.random() - 0.5) * 0.08;
          }
        }
      }
      prevState.current = state;
    }

    // Check if scatter is done (all scattered leaves off-screen)
    if (scattering.current) {
      let anyVisible = false;
      for (let i = 0; i < COUNT; i++) {
        if (leaf.opacity[i] > 0.01) { anyVisible = true; break; }
      }
      if (!anyVisible) {
        scattering.current = false;
        // Reset burst velocities and re-randomize positions for next time
        for (let i = 0; i < COUNT; i++) {
          leaf.bx[i] = 0;
          leaf.by[i] = 0;
          leaf.bz[i] = 0;
          leaf.px[i] = (Math.random() - 0.5) * 30;
          leaf.py[i] = (Math.random() - 0.5) * 20;
          leaf.pz[i] = (Math.random() - 0.5) * 10 - 2;
        }
      }
    }

    for (let i = 0; i < COUNT; i++) {
      const isBursting = leaf.bx[i] !== 0 || leaf.by[i] !== 0 || leaf.bz[i] !== 0;

      // --- Opacity ---
      if (isBursting) {
        // During scatter: stay visible, kill only when off-screen
        const ax = Math.abs(leaf.px[i]);
        const ay = Math.abs(leaf.py[i]);
        if (ax > 20 || ay > 16) {
          leaf.opacity[i] = 0;
          leaf.bx[i] = 0;
          leaf.by[i] = 0;
          leaf.bz[i] = 0;
        }
      } else {
        // Normal: fade toward target
        const tgt = i < target ? 1.0 : 0.0;
        leaf.opacity[i] += (tgt - leaf.opacity[i]) * 0.03;
        if (leaf.opacity[i] < 0.005) leaf.opacity[i] = 0;
      }

      // --- Velocity ---
      let vx = leaf.vx[i] * move;
      let vy = leaf.vy[i] * move;
      let vz = leaf.vz[i] * move;

      // Leaf flutter (pendulum + drift)
      vx += Math.sin(t * 1.4 + leaf.phase[i]) * 0.005 * move;
      vy += Math.cos(t * 0.6 + leaf.phase[i] * 1.3) * 0.002 * move;

      // Burst velocity (decays slowly so leaves keep flying out)
      if (isBursting) {
        vx += leaf.bx[i];
        vy += leaf.by[i];
        vz += leaf.bz[i];
        leaf.bx[i] *= 0.985;
        leaf.by[i] *= 0.985;
        leaf.bz[i] *= 0.985;
      }

      // Vortex / whirlwind (only when NOT scattering)
      if (vortex > 0 && !isBursting) {
        const px = leaf.px[i];
        const py = leaf.py[i];
        const angle = Math.atan2(py, px);
        const dist = Math.sqrt(px * px + py * py);
        vx += Math.cos(angle + Math.PI / 2) * vortex * 0.016;
        vy += Math.sin(angle + Math.PI / 2) * vortex * 0.016;
        if (dist > 2) {
          vx -= px * 0.005 * vortex;
          vy -= py * 0.005 * vortex;
        }
        vy += 0.012 * vortex;
      }

      // Mouse scatter
      const mx = mouse.x * 14;
      const my = mouse.y * 10;
      const dx = leaf.px[i] - mx;
      const dy = leaf.py[i] - my;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 4.5 && d > 0.1) {
        const push = 0.035 / (d * d);
        vx += dx * push;
        vy += dy * push;
        leaf.rx[i] += push * 3;
        leaf.ry[i] += push * 4;
        leaf.rz[i] += push * 2.5;
      }

      // Apply position
      leaf.px[i] += vx;
      leaf.py[i] += vy;
      leaf.pz[i] += vz;

      // 3-axis rotation
      const spinMul = isBursting ? spin * 3 : spin; // extra tumble during burst
      leaf.rx[i] += leaf.rsX[i] * spinMul + Math.sin(t * 0.7 + leaf.phase[i] * 2.1) * 0.008 * spinMul;
      leaf.ry[i] += leaf.rsY[i] * spinMul + Math.cos(t * 0.9 + leaf.phase[i] * 1.7) * 0.01 * spinMul;
      leaf.rz[i] += leaf.rsZ[i] * spinMul + Math.sin(t * 0.5 + leaf.phase[i] * 3.2) * 0.006 * spinMul;

      // Wrap (only when NOT bursting - let burst leaves fly off-screen)
      if (!isBursting) {
        const bxW = 16, byW = 13, bzW = 8;
        if (leaf.px[i] > bxW) leaf.px[i] -= bxW * 2;
        if (leaf.px[i] < -bxW) leaf.px[i] += bxW * 2;
        if (leaf.py[i] > byW) leaf.py[i] -= byW * 2;
        if (leaf.py[i] < -byW) leaf.py[i] += byW * 2;
        if (leaf.pz[i] > bzW) leaf.pz[i] -= bzW * 2;
        if (leaf.pz[i] < -bzW) leaf.pz[i] += bzW * 2;
      }

      // --- Build transform matrix ---
      const s = leaf.scale[i] * Math.min(leaf.opacity[i] / 0.25, 1);

      tmp.euler.set(leaf.rx[i], leaf.ry[i], leaf.rz[i]);
      tmp.quat.setFromEuler(tmp.euler);
      tmp.pos.set(leaf.px[i], leaf.py[i], leaf.pz[i]);
      tmp.scl.set(s, s * 1.35, s);
      tmp.mat.compose(tmp.pos, tmp.quat, tmp.scl);
      meshRef.current.setMatrixAt(i, tmp.mat);

      opArr[i] = leaf.opacity[i];
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
    opAttr.needsUpdate = true;

    // Camera breathing
    fs.camera.position.x = Math.sin(t * 0.04) * 0.3;
    fs.camera.position.y = Math.cos(t * 0.06) * 0.18;
    fs.camera.lookAt(0, 0, 0);
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, COUNT]}
      frustumCulled={false}
    />
  );
}
