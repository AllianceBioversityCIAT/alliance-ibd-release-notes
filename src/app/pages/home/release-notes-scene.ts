/**
 * Animated release-notes scene drawn over the stage photo (public/home/stage.webp, 1408×768).
 * Jira tickets ride the teal channel into the machine; release-note pages come out of its
 * three slots (New / Improved / Fixed) and land on three stacks.
 *
 * Browser only: call it from afterNextRender. Returns a disposer.
 */
import type * as THREE_NS from 'three';

export const STAGE = { width: 1408, height: 768 } as const;

// Floor axes measured on the photo: U runs down the teal channel (30.5°), V along the plinth's other edge (25°).
const U = { x: -0.862, y: 0.507 };
const V = { x: 0.906, y: 0.423 };
const PLINTH = { x: 1079.4, y: 485.4 }; // top centre of the big plinth, under the machine
const MACHINE_BOX = { x: 995, y: 300, w: 170, h: 226 }; // where machine.webp sits on the stage

const TICKETS = [
  { key: 'P2-3824', label: 'ACTIVITY', top: '#2563eb', side: 0x1e40af },
  { key: 'P2-3858', label: 'STORY', top: '#7c3aed', side: 0x5b21b6 },
  { key: 'P2-3931', label: 'BUG', top: '#dc2626', side: 0x991b1b },
  { key: 'P2-3704', label: 'ACTIVITY', top: '#2563eb', side: 0x1e40af },
  { key: 'P2-3928', label: 'STORY', top: '#7c3aed', side: 0x5b21b6 },
];

// Bottom-lip midpoints of the three slots, measured on the photo.
const KINDS = [
  { slot: { x: 1027, y: 411 }, color: '#14b8a6', tag: 'NEW', stack: { x: 857, y: 619 } },
  { slot: { x: 1027, y: 448 }, color: '#f59e0b', tag: 'IMPROVED', stack: { x: 905, y: 548 } },
  { slot: { x: 1027, y: 485 }, color: '#f43f5e', tag: 'FIXED', stack: { x: 980, y: 600 } },
];

type Point = { x: number; y: number };

export async function startReleaseNotesScene(canvas: HTMLCanvasElement, assetsBase = 'home/'): Promise<() => void> {
  const THREE = await import('three');
  const { width: W, height: H } = STAGE;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(W, H, false);
  const camera = new THREE.OrthographicCamera(0, W, 0, -H, -2000, 2000);
  const world = new THREE.Scene();
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(d: T) => (disposables.push(d), d);

  // Local floor coords → screen: x along U, z along V, y up (pixels). `o` is a screen point.
  const floorMatrix = (o: Point, lift = 0) =>
    new THREE.Matrix4().set(U.x, 0, V.x, o.x, -U.y, 1, -V.y, -o.y + lift, 0, 0, 1, 0, 0, 0, 0, 1);

  const canvasTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
    const c = document.createElement('canvas');
    c.width = w * 3;
    c.height = h * 3;
    const g = c.getContext('2d')!;
    g.scale(3, 3);
    draw(g);
    const t = track(new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  const basic = (p: THREE_NS.MeshBasicMaterialParameters) =>
    track(new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, ...p }));

  // ── Tickets: rounded raised slabs, coloured by issue type ─────────────────────
  const TL = 54, TW = 34, TH = 6, TR = 7;
  const shape = new THREE.Shape();
  {
    const x = -TL / 2, y = -TW / 2;
    shape.moveTo(x + TR, y);
    shape.lineTo(x + TL - TR, y);
    shape.quadraticCurveTo(x + TL, y, x + TL, y + TR);
    shape.lineTo(x + TL, y + TW - TR);
    shape.quadraticCurveTo(x + TL, y + TW, x + TL - TR, y + TW);
    shape.lineTo(x + TR, y + TW);
    shape.quadraticCurveTo(x, y + TW, x, y + TW - TR);
    shape.lineTo(x, y + TR);
    shape.quadraticCurveTo(x, y, x + TR, y);
  }
  const bodyGeo = track(
    new THREE.ExtrudeGeometry(shape, { depth: TH - 2, bevelEnabled: true, bevelThickness: 1, bevelSize: 1, bevelSegments: 3, curveSegments: 10 }),
  );
  bodyGeo.rotateX(-Math.PI / 2);
  bodyGeo.translate(0, 1, 0);
  const faceGeo = track(new THREE.PlaneGeometry(TL + 2, TW + 2));
  faceGeo.rotateX(-Math.PI / 2);
  faceGeo.scale(-1, 1, 1); // U points left on screen: un-mirror the print
  faceGeo.translate(0, TH + 0.05, 0);

  const tickets = TICKETS.map((k) => {
    const top = canvasTex(112, 72, (g) => {
      g.fillStyle = k.top;
      g.beginPath();
      g.roundRect(0, 0, 112, 72, 14);
      g.fill();
      const sheen = g.createLinearGradient(0, 0, 0, 72);
      sheen.addColorStop(0, 'rgba(255,255,255,.22)');
      sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
      g.fillStyle = sheen;
      g.beginPath();
      g.roundRect(0, 0, 112, 72, 14);
      g.fill();
      g.fillStyle = '#fff';
      g.font = '600 12px Inter, sans-serif';
      g.fillText(k.key, 12, 24);
      g.font = '600 7px Inter, sans-serif';
      g.fillStyle = 'rgba(255,255,255,.85)';
      g.fillText(k.label, 12, 36);
      g.fillStyle = 'rgba(255,255,255,.5)';
      [47, 57].forEach((y, i) => {
        g.beginPath();
        g.roundRect(12, y, 78 - i * 26, 4.5, 2.25);
        g.fill();
      });
    });
    const group = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, basic({ color: k.side }));
    const face = new THREE.Mesh(faceGeo, basic({ map: top, side: THREE.DoubleSide }));
    body.renderOrder = 1;
    face.renderOrder = 1.01;
    group.add(body, face);
    group.matrixAutoUpdate = false;
    world.add(group);
    return group;
  });
  const TICKET_V = 9; // centres the tickets on the teal line
  const placeTicket = (g: THREE_NS.Group, sc: number) => {
    g.matrix.copy(floorMatrix(PLINTH, 1)).multiply(new THREE.Matrix4().makeTranslation(sc, 0, TICKET_V));
    g.matrixWorldNeedsUpdate = true;
  };

  // ── Machine cut-out: above the tickets (they slip behind it), below the paper ──
  const machineTex = track(new THREE.TextureLoader().load(`${assetsBase}machine.webp`));
  machineTex.colorSpace = THREE.SRGBColorSpace;
  const machine = new THREE.Mesh(track(new THREE.PlaneGeometry(MACHINE_BOX.w, MACHINE_BOX.h)), basic({ map: machineTex }));
  machine.position.set(MACHINE_BOX.x + MACHINE_BOX.w / 2, -(MACHINE_BOX.y + MACHINE_BOX.h / 2), 0);
  machine.renderOrder = 2;
  world.add(machine);

  // ── Trays for the two extra stacks ──────────────────────────────────────────
  const trayGeo = track(new THREE.BoxGeometry(62, 6, 52));
  trayGeo.translate(0, 3, 0);
  const rimGeo = track(new THREE.EdgesGeometry(trayGeo));
  KINDS.slice(1).forEach((k) => {
    const tray = new THREE.Mesh(trayGeo, basic({ color: 0x2a3236 }));
    const rim = new THREE.LineSegments(rimGeo, track(new THREE.LineBasicMaterial({ color: 0x5eead4, depthTest: false })));
    [tray, rim].forEach((o) => {
      o.matrixAutoUpdate = false;
      o.matrix.copy(floorMatrix(k.stack));
      o.renderOrder = 0.5;
      world.add(o);
    });
  });

  // ── Pages: deformable sheets that bend like paper ───────────────────────────
  const PL = 52, PW = 40, PER = 4;
  const pageTex = KINDS.map((k) =>
    canvasTex(140, 104, (g) => {
      g.fillStyle = '#fff';
      g.fillRect(0, 0, 140, 104);
      g.fillStyle = k.color;
      g.fillRect(0, 0, 140, 5);
      g.fillStyle = '#0f2a2e';
      g.font = '600 10px Inter, sans-serif';
      g.fillText('IBD Release Notes', 10, 20);
      g.fillStyle = k.color;
      g.beginPath();
      g.roundRect(10, 27, 8 + k.tag.length * 5, 10, 5);
      g.fill();
      g.fillStyle = '#fff';
      g.font = '600 6px Inter, sans-serif';
      g.fillText(k.tag, 14, 34);
      g.fillStyle = '#cfd8da';
      for (let y = 46, i = 0; y < 98; y += 9, i++) g.fillRect(10, y, i % 3 === 2 ? 70 : 118, 3.5);
    }),
  );
  const sheet = (tex: THREE_NS.Texture) => {
    const geo = track(new THREE.PlaneGeometry(PL, PW, 24, 2));
    geo.rotateX(-Math.PI / 2);
    geo.scale(-1, 1, 1); // un-mirror the print
    const m = new THREE.Mesh(geo, basic({ map: tex, side: THREE.DoubleSide }));
    m.matrixAutoUpdate = false;
    world.add(m);
    return { m, base: Float32Array.from(geo.attributes['position'].array) };
  };
  const pages = KINDS.flatMap((k, ki) => Array.from({ length: PER }, (_, i) => ({ k, ki, i, ...sheet(pageTex[ki]) })));

  // Pose a sheet: origin `o`, centre `sc` along U, height `h`. With `clip`, the part still inside
  // the slot (x < 0) collapses onto the slot lip, so the paper looks masked by the opening.
  const pose = (p: (typeof pages)[number], o: Point, sc: number, h: number, bend: number, flutter: number, t: number, clip: boolean) => {
    p.m.matrix.copy(floorMatrix(o));
    p.m.matrixWorldNeedsUpdate = true;
    const pos = p.m.geometry.attributes['position'];
    for (let i = 0; i < pos.count; i++) {
      const lx = p.base[i * 3], z = p.base[i * 3 + 2];
      let x = sc + lx;
      if (clip && x < 0) x = 0;
      const free = clip ? x : lx + PL / 2;
      const y = h - bend * free * free + flutter * Math.sin((lx / PL) * Math.PI * 2.2 - t * 7) + flutter * 0.35 * (z / 40) * Math.sin(t * 5);
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
  };

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ease = (k: number) => k * k * (3 - 2 * k);
  const lerp = (a: Point, b: Point, e: number) => ({ x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e });
  let raf = 0;

  const frame = (now: number) => {
    const t = reduce ? 9 : now / 1000;

    tickets.forEach((g, i) => {
      const u = (t / 11 + i / tickets.length) % 1;
      g.children.forEach((c) => (((c as THREE_NS.Mesh).material as THREE_NS.Material).opacity = Math.min(1, u / 0.06)));
      placeTicket(g, -470 + 450 * u); // straight along the channel
    });

    // Every slot prints in turn; each page lands on its own stack.
    const T = 1.5, cycle = T * KINDS.length * PER + 2.5, c = t % cycle;
    pages.forEach((p) => {
      const { k, ki, i, m } = p;
      const n = i * KINDS.length + ki, kk = (c - n * T) / (T * 1.6), rest = 2 + i * 1.6;
      let op = 1;
      m.renderOrder = 4 + k.stack.y / 1000 + i / 1e4; // resting: nearer stack and higher sheet on top
      if (kk < 0) {
        op = 0;
        pose(p, k.stack, 0, rest, 0, 0, t, false);
      } else if (kk < 0.4) {
        const e = ease(kk / 0.4);
        m.renderOrder = 6 + k.slot.y / 1000;
        pose(p, k.slot, -PL / 2 + (PL + 4) * e, 0, 0.006, 0.3 * e, t, true);
      } else if (kk < 1) {
        m.renderOrder = 7 + n / 1e3; // in flight: above every resting sheet
        const e = ease((kk - 0.4) / 0.6);
        const from = { x: k.slot.x + U.x * (PL / 2 + 4), y: k.slot.y + U.y * (PL / 2 + 4) };
        pose(p, lerp(from, k.stack, e), 0, rest * e + 26 * Math.sin(Math.PI * e), 0.006 * (1 - e), 2.4 * Math.sin(Math.PI * e), t, false);
      } else pose(p, k.stack, 0, rest, 0, 0, t, false);
      if (c > cycle - 0.8) op *= (cycle - c) / 0.8;
      (m.material as THREE_NS.Material).opacity = op;
    });

    renderer.render(world, camera);
    if (!reduce) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    disposables.forEach((d) => d.dispose());
    renderer.dispose();
  };
}
