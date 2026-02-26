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

export function LeafField({ state, mouse }: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null!);

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
      rot: new Float32Array(COUNT),
      rotSpd: new Float32Array(COUNT),
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
      d.rot[i] = Math.random() * Math.PI * 2;
      d.rotSpd[i] = (Math.random() - 0.5) * 0.02;
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

    for (let i = 0; i < COUNT; i++) {
      // --- Opacity fade ---
      const tgt = i < target ? 1.0 : 0.0;
      leaf.opacity[i] += (tgt - leaf.opacity[i]) * 0.03;
      if (leaf.opacity[i] < 0.005) leaf.opacity[i] = 0;

      // --- Velocity ---
      let vx = leaf.vx[i] * move;
      let vy = leaf.vy[i] * move;
      const vz = leaf.vz[i] * move;

      // Leaf flutter (pendulum + drift)
      vx += Math.sin(t * 1.4 + leaf.phase[i]) * 0.005 * move;
      vy += Math.cos(t * 0.6 + leaf.phase[i] * 1.3) * 0.002 * move;

      // Vortex / whirlwind
      if (vortex > 0) {
        const px = leaf.px[i];
        const py = leaf.py[i];
        const angle = Math.atan2(py, px);
        const dist = Math.sqrt(px * px + py * py);
        // Tangential spin
        vx += Math.cos(angle + Math.PI / 2) * vortex * 0.016;
        vy += Math.sin(angle + Math.PI / 2) * vortex * 0.016;
        // Inward pull
        if (dist > 2) {
          vx -= px * 0.005 * vortex;
          vy -= py * 0.005 * vortex;
        }
        // Updraft
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
        leaf.rot[i] += push * 4; // tumble from mouse
      }

      // Apply position
      leaf.px[i] += vx;
      leaf.py[i] += vy;
      leaf.pz[i] += vz;
      leaf.rot[i] += leaf.rotSpd[i] * spin;

      // Wrap around world bounds
      const bx = 16, by = 13, bz = 8;
      if (leaf.px[i] > bx) leaf.px[i] -= bx * 2;
      if (leaf.px[i] < -bx) leaf.px[i] += bx * 2;
      if (leaf.py[i] > by) leaf.py[i] -= by * 2;
      if (leaf.py[i] < -by) leaf.py[i] += by * 2;
      if (leaf.pz[i] > bz) leaf.pz[i] -= bz * 2;
      if (leaf.pz[i] < -bz) leaf.pz[i] += bz * 2;

      // --- Build transform matrix ---
      // Natural wobble (3D tumble)
      const wobX = Math.sin(t * 2.1 + leaf.phase[i]) * 0.4;
      const wobY = Math.cos(t * 1.6 + leaf.phase[i] * 1.5) * 0.35;
      // Scale: shrink when fading in/out
      const s = leaf.scale[i] * Math.min(leaf.opacity[i] / 0.25, 1);

      tmp.euler.set(wobX, wobY, leaf.rot[i]);
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
