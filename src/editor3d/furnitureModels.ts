import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FurnitureItem, ParametricCabinetConfig } from '../types';
import { AccentKind, SurfaceKind, applyWorldUV, createAccent, createSurface, shade, surfaceKindOf } from '../materials/furniture';

/**
 * Detailed procedural models for every catalog piece.
 *
 * Conventions (millimetres, Y up): the model is centred on X/Z, stands on y = 0, its width runs along X and its
 * depth along Z. The FRONT of the piece is +Z (backs, headboards and cisterns sit at -Z). The footprint never
 * exceeds width x depth; fixtures such as faucets and lamp arcs may rise above the catalog height.
 */

type V3 = [number, number, number];

// ---------------------------------------------------------------------------
// Materials: created lazily so a model only pays for what it uses
// ---------------------------------------------------------------------------

class Mats {
  private cache = new Map<string, THREE.Material>();
  readonly kind: SurfaceKind;

  constructor(
    private readonly color: string,
    material: string,
    private readonly selected: boolean
  ) {
    this.kind = surfaceKindOf(material);
  }

  private get(key: string, make: () => THREE.Material): THREE.Material {
    let m = this.cache.get(key);
    if (!m) {
      m = make();
      this.cache.set(key, m);
    }
    return m;
  }

  /** The piece's own material, tinted with its colour. */
  get main() {
    return this.get('main', () => createSurface(this.kind, this.color, this.selected));
  }
  /** Same material, darker (negative) or lighter (positive). */
  tone(amount: number) {
    return this.get(`tone${amount}`, () => createSurface(this.kind, shade(this.color, amount), this.selected));
  }
  /** Wood for legs and frames: the piece's colour if it is wooden, otherwise a warm walnut. */
  wood(amount = -0.25) {
    const base = this.kind === 'wood' ? this.color : '#8a5a3c';
    return this.get(`wood${amount}${base}`, () => createSurface('wood', shade(base, amount), this.selected));
  }
  surface(kind: SurfaceKind, color: string) {
    return this.get(`s${kind}${color}`, () => createSurface(kind, color, this.selected));
  }
  accent(kind: AccentKind) {
    return this.get(`a${kind}`, () => createAccent(kind, this.selected));
  }
}

// ---------------------------------------------------------------------------
// Parts: tiny mesh helpers (bottom-anchored boxes, rounded boxes, cylinders...)
// ---------------------------------------------------------------------------

class Parts {
  constructor(readonly group: THREE.Group) {}

  /** Adds a mesh; textured materials get world-scale UVs. */
  add(geo: THREE.BufferGeometry, mat: THREE.Material, centre: V3, rot?: V3): THREE.Mesh {
    const tile = mat.userData.tileMm as number | undefined;
    if (tile) applyWorldUV(geo, tile);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...centre);
    if (rot) mesh.rotation.set(...rot);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  /** Box whose BOTTOM centre is at pos. */
  box(mat: THREE.Material, [w, h, d]: V3, [x, y0, z]: V3, rot?: V3) {
    return this.add(new THREE.BoxGeometry(w, h, d), mat, [x, y0 + h / 2, z], rot);
  }

  rbox(mat: THREE.Material, [w, h, d]: V3, radius: number, [x, y0, z]: V3, rot?: V3) {
    const r = Math.max(0.5, Math.min(radius, w / 2 - 0.1, h / 2 - 0.1, d / 2 - 0.1));
    // tiny radii are invisible: fewer subdivisions keep heavy scenes light
    return this.add(new RoundedBoxGeometry(w, h, d, r < 12 ? 1 : 3, r), mat, [x, y0 + h / 2, z], rot);
  }

  /** Cylinder (or cone) whose bottom centre is at pos. */
  cyl(mat: THREE.Material, rTop: number, rBottom: number, h: number, [x, y0, z]: V3, segments = 32, rot?: V3, open = false) {
    return this.add(new THREE.CylinderGeometry(rTop, rBottom, h, segments, 1, open), mat, [x, y0 + h / 2, z], rot);
  }

  /** Square tapered leg (a 4-sided cone), `size` = side at the top. */
  leg(mat: THREE.Material, sizeTop: number, sizeBottom: number, h: number, [x, y0, z]: V3) {
    const k = Math.SQRT1_2;
    const g = new THREE.CylinderGeometry((sizeTop * k), (sizeBottom * k), h, 4);
    g.rotateY(Math.PI / 4);
    return this.add(g, mat, [x, y0 + h / 2, z]);
  }

  /** Horizontal cylinder (bar, rail) given by its CENTRE; `axis` is the direction it runs along. */
  bar(mat: THREE.Material, r: number, length: number, centre: V3, axis: 'x' | 'z' = 'x', segments = 16) {
    const g = new THREE.CylinderGeometry(r, r, length, segments);
    return this.add(g, mat, centre, axis === 'x' ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]);
  }

  sphere(mat: THREE.Material, r: number, centre: V3, scale: V3 = [1, 1, 1]) {
    const g = new THREE.SphereGeometry(r, 24, 16);
    g.scale(...scale);
    return this.add(g, mat, centre);
  }

  /** Horizontal bar handle on a front face at z. */
  barHandle(mat: THREE.Material, len: number, [x, y, z]: V3, vertical = false) {
    const g = vertical ? new THREE.BoxGeometry(10, len, 12) : new THREE.BoxGeometry(len, 10, 12);
    return this.add(g, mat, [x, y, z + 8]);
  }

  knob(mat: THREE.Material, [x, y, z]: V3, r = 11) {
    return this.cyl(mat, r, r * 0.8, 16, [x, y - 8, z], 16, [Math.PI / 2, 0, 0]);
  }
}

interface Ctx {
  p: Parts;
  m: Mats;
  W: number;
  D: number;
  H: number;
  item: FurnitureItem;
}

type ModelFn = (c: Ctx) => void;

/** Small deterministic PRNG (books on shelves etc.). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

/** Door/drawer fronts across [x0, x1] x [y0, y1] on the plane z, with gaps and handles. */
function fronts(
  c: Ctx,
  o: {
    x0: number;
    x1: number;
    y0: number;
    y1: number;
    z: number;
    count: number;
    rows?: number;
    handle: 'bar-v' | 'bar-h' | 'knob' | 'none';
    mat?: THREE.Material;
    thick?: number;
    gap?: number;
  }
) {
  const { p, m } = c;
  const { x0, x1, y0, y1, z, count, rows = 1, handle, thick = 18, gap = 4 } = o;
  const mat = o.mat ?? m.tone(0.05);
  const cw = (x1 - x0) / count;
  const rh = (y1 - y0) / rows;

  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < count; i++) {
      const w = cw - gap;
      const h = rh - gap;
      const cx = x0 + cw * (i + 0.5);
      const by = y0 + rh * r + gap / 2;
      p.rbox(mat, [w, h, thick], 3, [cx, by, z - thick / 2]);
      if (handle === 'bar-v') {
        // vertical bar on the inner edge of each leaf (pairs meet in the middle)
        const side = count > 1 ? (i % 2 === 0 ? 1 : -1) : 1;
        p.barHandle(m.accent('steel'), Math.min(260, h * 0.45), [cx + side * (w / 2 - 28), by + h / 2, z], true);
      } else if (handle === 'bar-h') {
        p.barHandle(m.accent('steel'), Math.min(200, w * 0.45), [cx, by + h - 38, z]);
      } else if (handle === 'knob') {
        p.knob(m.accent('brass'), [cx, by + h / 2, z + 6]);
      }
    }
  }
}

/** Open-back carcass: two sides, top, bottom and back, sitting from y0 to y1. */
function carcass(c: Ctx, x0: number, x1: number, y0: number, y1: number, depth: number, t: number, mat: THREE.Material) {
  const { p } = c;
  const w = x1 - x0;
  const cx = (x0 + x1) / 2;
  const cz = c.D / 2 - depth / 2;
  p.box(mat, [t, y1 - y0, depth], [x0 + t / 2, y0, cz]);
  p.box(mat, [t, y1 - y0, depth], [x1 - t / 2, y0, cz]);
  p.box(mat, [w - 2 * t, t, depth], [cx, y0, cz]);
  p.box(mat, [w - 2 * t, t, depth], [cx, y1 - t, cz]);
  p.box(mat, [w - 2 * t, y1 - y0 - 2 * t, 8], [cx, y0 + t, cz - depth / 2 + 4]);
}

/** Four tapered legs under a body, inset from the corners. */
function cornerLegs(c: Ctx, mat: THREE.Material, h: number, inset: number, top = 38, bottom = 24) {
  const { p, W, D } = c;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      p.leg(mat, top, bottom, h, [sx * (W / 2 - inset), 0, sz * (D / 2 - inset)]);
    }
  }
}

// ---------------------------------------------------------------------------
// Seating
// ---------------------------------------------------------------------------

function sofaLike(c: Ctx, o: { seats: number; arm: number; chaise?: boolean }) {
  const { p, m, W, D, H } = c;
  const legH = Math.round(H * 0.12);
  const frameH = Math.round(H * 0.18);
  const cushH = Math.round(H * 0.17);
  const base = legH + frameH;
  const seatTop = base + cushH;
  const armTop = H * 0.68;

  const sofaD = o.chaise ? D * 0.56 : D;
  const backD = Math.round(sofaD * 0.25);
  const chaiseW = o.chaise ? W * 0.34 : 0;
  const innerL = -W / 2 + o.arm;
  const innerR = o.chaise ? W / 2 : W / 2 - o.arm;
  const zBack = -D / 2;
  const frameMat = m.tone(-0.12);

  // Legs
  const legMat = m.wood(-0.3);
  const legX = W / 2 - 55;
  for (const sx of [-1, 1]) {
    p.leg(legMat, 44, 28, legH, [sx * legX, 0, zBack + 55]);
    p.leg(legMat, 44, 28, legH, [sx * legX, 0, zBack + sofaD - 55]);
  }
  if (o.chaise) p.leg(legMat, 44, 28, legH, [legX, 0, D / 2 - 55]); // only the chaise side reaches the front

  // Frame
  p.rbox(frameMat, [W - 4, frameH, sofaD - 4], 20, [0, legH, zBack + sofaD / 2]);
  if (o.chaise) p.rbox(frameMat, [chaiseW - 4, frameH, D - 4], 20, [W / 2 - chaiseW / 2, legH, 0]);

  // Arms
  p.rbox(m.main, [o.arm, armTop - legH, sofaD - 4], 36, [-W / 2 + o.arm / 2, legH, zBack + sofaD / 2]);
  if (!o.chaise) p.rbox(m.main, [o.arm, armTop - legH, sofaD - 4], 36, [W / 2 - o.arm / 2, legH, zBack + sofaD / 2]);

  // Back
  p.rbox(m.main, [innerR - innerL, H - legH, backD], 40, [(innerL + innerR) / 2, legH, zBack + backD / 2]);

  // Seat cushions
  const seatSpan = innerR - innerL - chaiseW;
  const cw = seatSpan / o.seats;
  const seatZ = zBack + backD + (sofaD - backD) / 2 - 6;
  const seatDepth = sofaD - backD + 4;
  for (let i = 0; i < o.seats; i++) {
    const cx = innerL + cw * (i + 0.5);
    p.rbox(m.tone(0.04), [cw - 6, cushH, seatDepth], 30, [cx, base, seatZ]);
    // Back cushion, leaning against the back
    p.rbox(m.tone(0.04), [cw - 24, H * 0.36, 150], 44, [cx, seatTop - 8, zBack + backD + 62], [-0.24, 0, 0]);
  }
  if (o.chaise) {
    const cx = W / 2 - chaiseW / 2;
    p.rbox(m.tone(0.04), [chaiseW - 6, cushH, D - backD + 4], 30, [cx, base, zBack + backD + (D - backD) / 2 - 6]);
    p.rbox(m.tone(0.04), [chaiseW - 24, H * 0.36, 150], 44, [cx, seatTop - 8, zBack + backD + 62], [-0.24, 0, 0]);
  }
}

function chair(c: Ctx, style: 'slats' | 'pad') {
  const { p, m, W, D, H } = c;
  const seatH = Math.round(H * 0.52);
  const legMat = m.wood(style === 'slats' ? 0 : -0.3);
  const inset = 26;

  // Front legs tapered; rear posts run up to form the back
  for (const sx of [-1, 1]) {
    p.leg(legMat, 34, 22, seatH - 22, [sx * (W / 2 - inset), 0, D / 2 - inset]); // ends inside the seat
    p.rbox(legMat, [32, H, 30], 6, [sx * (W / 2 - inset), 0, -D / 2 + inset]);
    // side stretcher
    p.box(legMat, [18, 20, D - 2 * inset], [sx * (W / 2 - inset), seatH * 0.32, 0]);
  }
  p.box(legMat, [W - 2 * inset, 18, 18], [0, seatH * 0.32, -D / 2 + inset]);

  // Seat
  p.rbox(m.main, [W, 46, D], 14, [0, seatH - 46, 0]);

  if (style === 'slats') {
    const top = H - 50;
    const n = 3;
    for (let i = 0; i < n; i++) {
      const y = seatH + 70 + (i * (top - seatH - 120)) / (n - 1);
      p.box(legMat, [W - 2 * inset - 30, 40, 16], [0, y, -D / 2 + inset]);
    }
    p.rbox(legMat, [W - 2 * inset + 10, 56, 24], 8, [0, H - 56, -D / 2 + inset]);
  } else {
    p.rbox(m.main, [W - 2 * inset - 16, H - seatH - 140, 40], 16, [0, seatH + 90, -D / 2 + inset + 6], [-0.1, 0, 0]);
    p.rbox(legMat, [W - 2 * inset + 6, 40, 26], 8, [0, H - 40, -D / 2 + inset]);
  }
}

function puff(c: Ctx) {
  const { p, m, W, H } = c;
  const R = W / 2;
  const profile = new THREE.SplineCurve([
    new THREE.Vector2(0.01, 0),
    new THREE.Vector2(R * 0.84, 0),
    new THREE.Vector2(R * 0.98, H * 0.16),
    new THREE.Vector2(R, H * 0.45),
    new THREE.Vector2(R * 0.97, H * 0.78),
    new THREE.Vector2(R * 0.82, H * 0.96),
    new THREE.Vector2(R * 0.45, H),
    new THREE.Vector2(0.01, H * 0.97),
  ])
    .getPoints(40)
    // the spline can overshoot slightly: keep the profile on the floor and on the axis
    .map((v) => new THREE.Vector2(Math.max(0.01, v.x), Math.max(0, v.y)));
  p.add(new THREE.LatheGeometry(profile, 48), m.main, [0, 0, 0]);

  // Piping around the middle, base ring and a top button
  const pipe = new THREE.TorusGeometry(R * 0.995, 5, 8, 64);
  pipe.rotateX(Math.PI / 2);
  p.add(pipe, m.tone(-0.25), [0, H * 0.62, 0]);
  const topPipe = new THREE.TorusGeometry(R * 0.8, 4, 8, 56);
  topPipe.rotateX(Math.PI / 2);
  p.add(topPipe, m.tone(-0.25), [0, H * 0.945, 0]);
  p.cyl(m.accent('rubber'), R * 0.78, R * 0.8, 12, [0, 0, 0], 40);
  p.sphere(m.tone(-0.35), 18, [0, H - 8, 0], [1, 0.55, 1]);
}

// ---------------------------------------------------------------------------
// Tables, storage and bedroom furniture
// ---------------------------------------------------------------------------

function table(c: Ctx, o: { top?: number; apron?: boolean; inset?: number } = {}) {
  const { p, m, W, D, H } = c;
  const topT = o.top ?? 36;
  const inset = o.inset ?? 70;
  const legMat = m.wood(-0.3);
  const legH = H - topT;
  p.rbox(m.main, [W, topT, D], 8, [0, legH, 0]);

  if (o.apron !== false) {
    const rail = m.tone(-0.18);
    const rh = Math.min(80, legH * 0.18);
    p.box(rail, [W - 2 * inset, rh, 22], [0, legH - rh, D / 2 - inset]);
    p.box(rail, [W - 2 * inset, rh, 22], [0, legH - rh, -D / 2 + inset]);
    p.box(rail, [22, rh, D - 2 * inset], [W / 2 - inset, legH - rh, 0]);
    p.box(rail, [22, rh, D - 2 * inset], [-W / 2 + inset, legH - rh, 0]);
  }
  cornerLegs(c, legMat, legH - 2, inset, 56, 34);
}

function coffeeTable(c: Ctx) {
  const { p, m, W, D, H } = c;
  const topT = 38;
  p.rbox(m.main, [W, topT, D], 10, [0, H - topT, 0]);
  p.rbox(m.tone(-0.12), [W - 200, 20, D - 150], 6, [0, 110, 0]); // lower shelf
  cornerLegs(c, m.wood(-0.3), H - topT, 70, 50, 34);
}

function tvUnit(c: Ctx) {
  const { p, m, W, D, H } = c;
  const legH = 110;
  const t = 18;
  p.box(m.accent('blackMetal'), [W - 40, 14, D - 60], [0, legH - 14, 0]);
  cornerLegs(c, m.wood(-0.3), legH - 14, 60, 40, 26);
  carcass(c, -W / 2, W / 2, legH, H - 22, D, t, m.tone(-0.1));
  p.rbox(m.main, [W, 22, D], 6, [0, H - 22, 0]);
  const sideW = W * 0.24;
  // centre doors + open side bays with a shelf each
  fronts(c, { x0: -W / 2 + sideW, x1: W / 2 - sideW, y0: legH + 6, y1: H - 24, z: D / 2, count: 2, handle: 'knob' });
  for (const s of [-1, 1]) {
    p.box(m.tone(-0.05), [sideW - 2 * t, 14, D - 40], [s * (W / 2 - sideW / 2), legH + (H - legH) / 2, -6]);
  }
}

function livingShelf(c: Ctx) {
  const { p, m, W, D, H } = c;
  const t = 22;
  const frame = m.main;
  p.box(frame, [t, H, D], [-W / 2 + t / 2, 0, 0]);
  p.box(frame, [t, H, D], [W / 2 - t / 2, 0, 0]);
  p.box(frame, [W - 2 * t, t, D], [0, 0, 0]);
  p.box(frame, [W - 2 * t, t, D], [0, H - t, 0]);
  p.box(m.tone(-0.2), [W - 2 * t, H - 2 * t, 8], [0, t, -D / 2 + 4]);

  const shelves = 5;
  const bay = (H - t) / shelves;
  const rand = rng(1234);
  const palette = ['#b91c1c', '#1d4ed8', '#15803d', '#a16207', '#6d28d9', '#334155', '#be185d', '#0f766e'];
  // Books are plain boxes merged per colour: ~150 books cost 8 draw calls instead of 150 meshes.
  const booksByColor = new Map<string, THREE.BufferGeometry[]>();
  for (let s = 0; s < shelves; s++) {
    const y = t + s * bay;
    if (s > 0) p.box(frame, [W - 2 * t, 20, D - 10], [0, y - 10, 2]);
    let x = -W / 2 + t + 14;
    const end = W / 2 - t - 14;
    const mode = s % 3;
    while (x < end - 30) {
      if (mode === 2 && rand() > 0.6) {
        x += 40 + rand() * 120; // gap
        continue;
      }
      const bw = 22 + rand() * 24;
      const bh = bay * (0.55 + rand() * 0.35) - 24;
      if (x + bw > end) break;
      const color = palette[Math.floor(rand() * palette.length)];
      const geo = new THREE.BoxGeometry(bw, bh, D - 90 + rand() * 20);
      geo.translate(x + bw / 2, y + 10 + bh / 2, 4);
      if (!booksByColor.has(color)) booksByColor.set(color, []);
      booksByColor.get(color)!.push(geo);
      x += bw + 2;
    }
  }
  for (const [color, geos] of booksByColor) {
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (merged) p.add(merged, m.surface('matte', color), [0, 0, 0]);
  }
}

function floorLampArc(c: Ctx) {
  const { p, m, W, H } = c;
  const baseX = -W / 2 + 145; // base disc (r = 140) stays inside the footprint
  const endX = W * 0.2;
  p.cyl(m.accent('blackMetal'), 130, 140, 28, [baseX, 0, 0], 40);
  p.cyl(m.accent('steel'), 44, 60, 26, [baseX, 28, 0], 24);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(baseX, 28, 0),
    new THREE.Vector3(baseX, H * 0.68, 0),
    new THREE.Vector3(baseX + 40, H * 0.92, 0),
    new THREE.Vector3(endX - 30, H * 0.98, 0),
    new THREE.Vector3(endX, H * 0.9, 0),
  ]);
  p.add(new THREE.TubeGeometry(curve, 56, 11, 12), m.accent('steel'), [0, 0, 0]);
  // Dome shade with a glowing bulb
  const dome = new THREE.CylinderGeometry(70, 118, 150, 40, 1, true);
  p.add(dome, m.accent('lampGlow'), [endX, H * 0.9 - 150, 0]);
  p.sphere(m.accent('lampGlow'), 34, [endX, H * 0.9 - 130, 0]);
  p.cyl(m.accent('steel'), 22, 70, 28, [endX, H * 0.9 - 2, 0], 24); // shade cap
}

function bedroomLamp(c: Ctx) {
  const { p, m, W, H } = c;
  const R = W / 2;
  p.cyl(m.accent('brass'), R * 0.62, R * 0.7, 26, [0, 0, 0], 48);
  p.cyl(m.accent('brass'), 10, 10, H * 0.78, [0, 26, 0], 20);
  p.sphere(m.accent('brass'), 20, [0, 26 + H * 0.78, 0]);
  // Drum shade (open ends, glowing) with thin brass rims
  const shadeH = H * 0.22;
  const y = H - shadeH;
  p.cyl(m.accent('lampGlow'), R * 0.82, R * 0.98, shadeH, [0, y, 0], 48, undefined, true);
  p.cyl(m.accent('brass'), R * 0.83, R * 0.83, 6, [0, H - 6, 0], 48, undefined, true);
  p.sphere(m.accent('lampGlow'), 38, [0, y + shadeH * 0.45, 0]);
}

function valetStand(c: Ctx) {
  const { p, m, W, D, H } = c;
  const wood = m.main;
  const px = W / 2 - 34;
  // Feet along the depth
  for (const s of [-1, 1]) {
    p.rbox(wood, [40, 24, D], 8, [s * px, 0, 0]);
    p.rbox(wood, [32, H - 24, 32], 6, [s * px, 24, 0]);
  }
  // Cross rails
  p.box(wood, [W - 40, 22, 22], [0, 120, 0]);
  p.rbox(wood, [W - 50, 26, D - 30], 8, [0, 470, 0]); // seat / tray
  p.bar(m.accent('brass'), 9, W - 70, [0, 800, 0]); // trousers bar
  // Shoulder hanger on top: crossbar plus two sloped arms
  p.rbox(wood, [W - 70, 26, 24], 8, [0, H - 26, 0]);
  for (const s of [-1, 1]) {
    p.rbox(wood, [W * 0.28, 22, 22], 8, [s * (W * 0.3), H - 52, 0], [0, 0, s * 0.35]);
  }
  p.cyl(m.accent('brass'), 11, 11, 12, [0, H, 0], 16); // hook knob
}

function nightstand(c: Ctx) {
  const { p, m, W, D, H } = c;
  const legH = 170;
  p.rbox(m.main, [W, 26, D], 6, [0, H - 26, 0]);
  p.rbox(m.tone(-0.05), [W - 24, H - legH - 26, D - 20], 4, [0, legH, 0]);
  fronts(c, { x0: -W / 2 + 14, x1: W / 2 - 14, y0: legH + 6, y1: legH + (H - legH - 26) * 0.5, z: D / 2 - 8, count: 1, handle: 'knob', mat: m.tone(0.04) });
  fronts(c, { x0: -W / 2 + 14, x1: W / 2 - 14, y0: legH + (H - legH - 26) * 0.5 + 4, y1: H - 30, z: D / 2 - 8, count: 1, handle: 'knob', mat: m.tone(0.04) });
  cornerLegs(c, m.wood(-0.3), legH, 36, 38, 22);
}

function wardrobe(c: Ctx) {
  const { p, m, W, D, H } = c;
  const plinth = 90;
  const crown = 36;
  p.box(m.accent('blackMetal'), [W - 30, plinth, D - 50], [0, 0, 0]);
  carcass(c, -W / 2, W / 2, plinth, H - crown, D, 20, m.tone(-0.12));
  p.rbox(m.main, [W + 0, crown, D], 4, [0, H - crown, 0]); // cornice
  const doors = Math.max(2, Math.round(W / 600));
  fronts(c, { x0: -W / 2 + 4, x1: W / 2 - 4, y0: plinth + 4, y1: H - crown - 4, z: D / 2, count: doors, handle: 'bar-v', thick: 20 });
  // Mirror on the middle leaf for 3+ doors
  if (doors >= 3) {
    const cw = (W - 8) / doors;
    const cx = -W / 2 + 4 + cw * (Math.floor(doors / 2) + 0.5);
    p.box(m.accent('mirror'), [cw - 60, H - plinth - crown - 160, 4], [cx, plinth + 80, D / 2 + 1]);
  }
}

function dresser(c: Ctx) {
  const { p, m, W, D, H } = c;
  const legH = 130;
  p.rbox(m.main, [W, 34, D], 8, [0, H - 34, 0]);
  p.rbox(m.tone(-0.08), [W - 30, H - legH - 34, D - 24], 4, [0, legH, -6]);
  fronts(c, { x0: -W / 2 + 18, x1: W / 2 - 18, y0: legH + 6, y1: H - 38, z: D / 2 - 14, count: 1, rows: 4, handle: 'bar-h', thick: 22, mat: m.tone(0.03) });
  cornerLegs(c, m.wood(-0.3), legH, 55, 46, 28);
}

function sideboard(c: Ctx) {
  const { p, m, W, D, H } = c;
  const legH = 150;
  p.rbox(m.main, [W, 30, D], 6, [0, H - 30, 0]);
  p.rbox(m.tone(-0.08), [W - 24, H - legH - 30, D - 18], 4, [0, legH, -4]);
  fronts(c, { x0: -W / 2 + 14, x1: W / 2 - 14, y0: legH + 6, y1: H - 32, z: D / 2 - 8, count: 4, handle: 'bar-v', thick: 20, mat: m.tone(0.04) });
  cornerLegs(c, m.wood(-0.3), legH, 60, 44, 24);
}

function storageTall(c: Ctx) {
  const { p, m, W, D, H } = c;
  const plinth = 80;
  p.box(m.accent('blackMetal'), [W - 24, plinth, D - 40], [0, 0, 0]);
  carcass(c, -W / 2, W / 2, plinth, H, D, 20, m.tone(-0.1));
  fronts(c, { x0: -W / 2 + 4, x1: W / 2 - 4, y0: plinth + 4, y1: H * 0.62, z: D / 2, count: 2, handle: 'bar-v', thick: 20 });
  fronts(c, { x0: -W / 2 + 4, x1: W / 2 - 4, y0: H * 0.62 + 4, y1: H - 4, z: D / 2, count: 2, handle: 'bar-v', thick: 20 });
}

function bed(c: Ctx) {
  const { p, m, W, D, H } = c;
  const legH = 140;
  const frameH = 150;
  const mattressH = 230;
  const hbT = 90;
  const bodyD = D - hbT; // from the headboard to the foot
  const bodyZ = -D / 2 + hbT + bodyD / 2;
  const top = legH + frameH;

  // Headboard: tall panel with vertical channels
  p.rbox(m.tone(-0.05), [W, H, hbT], 10, [0, 0, -D / 2 + hbT / 2]);
  const channels = Math.max(4, Math.round(W / 220));
  for (let i = 0; i < channels; i++) {
    const cw = (W - 120) / channels;
    p.rbox(m.tone(0.06), [cw - 14, H * 0.5, 30], 12, [-W / 2 + 60 + cw * (i + 0.5), H * 0.38, -D / 2 + hbT + 8]);
  }

  // Frame + legs
  p.rbox(m.wood(-0.2), [W, frameH, bodyD], 8, [0, legH, bodyZ]);
  for (const sx of [-1, 1]) {
    p.leg(m.wood(-0.4), 56, 34, legH, [sx * (W / 2 - 50), 0, D / 2 - 50]);
    p.leg(m.wood(-0.4), 56, 34, legH, [sx * (W / 2 - 50), 0, -D / 2 + hbT + 30]);
  }

  // Mattress, duvet, pillows
  p.rbox(m.surface('fabric', '#f3f4f6'), [W - 40, mattressH, bodyD - 30], 32, [0, top - 10, bodyZ + 6]);
  const duvetD = bodyD * 0.7;
  p.rbox(m.main, [W - 6, 60, duvetD], 28, [0, top + mattressH - 40, -D / 2 + hbT + bodyD - duvetD / 2 + 10]);
  p.rbox(m.tone(-0.1), [W - 30, 70, 130], 30, [0, top + mattressH - 36, -D / 2 + hbT + bodyD - duvetD + 40]); // folded edge
  const pillows = W > 1300 ? 2 : 1;
  const pw = Math.min(640, (W - 100) / pillows - 20);
  for (let i = 0; i < pillows; i++) {
    const x = pillows === 1 ? 0 : (i - 0.5) * (pw + 30);
    p.rbox(m.surface('fabric', '#fafafa'), [pw, 120, 400], 50, [x, top + mattressH - 14, -D / 2 + hbT + 230], [-0.12, 0, 0]);
  }
}

function officeDesk(c: Ctx) {
  const { p, m, W, D, H } = c;
  const topT = 32;
  p.rbox(m.main, [W, topT, D], 6, [0, H - topT, 0]);
  const steel = m.accent('blackMetal');
  // Trestle on the left, drawer pedestal on the right
  const left = -W / 2 + 60;
  for (const z of [-D / 2 + 60, D / 2 - 60]) p.box(steel, [40, H - topT, 40], [left, 0, z]);
  p.box(steel, [40, 40, D - 80], [left, 60, 0]);
  p.box(steel, [W * 0.55, 30, 30], [-W * 0.2, H - topT - 60, -D / 2 + 70]);

  const pedW = 420;
  const px = W / 2 - pedW / 2 - 20;
  p.rbox(m.tone(-0.08), [pedW, H - topT - 40, D - 80], 4, [px, 40, 0]);
  fronts(c, { x0: px - pedW / 2 + 8, x1: px + pedW / 2 - 8, y0: 48, y1: H - topT - 6, z: D / 2 - 40, count: 1, rows: 3, handle: 'bar-h', thick: 18 });
  p.cyl(steel, 22, 28, 40, [px, 0, 0], 16);
}

function officeChair(c: Ctx) {
  const { p, m, W, D, H } = c;
  const steel = m.accent('blackMetal');
  const rubber = m.accent('rubber');
  const spokeLen = Math.min(W, D) * 0.46;

  // Five-star base with castors
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const g = new THREE.BoxGeometry(spokeLen, 26, 40);
    p.add(g, steel, [Math.cos(a) * spokeLen * 0.5, 62, Math.sin(a) * spokeLen * 0.5], [0, -a, 0]);
    p.cyl(rubber, 26, 26, 30, [Math.cos(a) * spokeLen * 0.95, 11, Math.sin(a) * spokeLen * 0.95], 16, [0, -a, Math.PI / 2]);
  }
  p.cyl(steel, 30, 36, 40, [0, 75, 0], 20);
  p.cyl(m.accent('chrome'), 24, 24, 300, [0, 100, 0], 20);

  // Seat, tilting backrest, arms
  const seatY = Math.round(H * 0.42);
  p.rbox(m.main, [W * 0.78, 80, D * 0.74], 26, [0, seatY, 20]);
  p.rbox(m.main, [W * 0.72, H * 0.46, 54], 24, [0, seatY + 120, -D * 0.28], [-0.14, 0, 0]);
  p.box(steel, [40, 160, 40], [0, seatY + 20, -D * 0.2], [0, 0, 0]);
  for (const s of [-1, 1]) {
    p.box(steel, [26, 180, 26], [s * W * 0.36, seatY + 70, 10]);
    p.rbox(rubber, [50, 28, 260], 10, [s * W * 0.36, seatY + 250, 30]);
  }
}

// ---------------------------------------------------------------------------
// Kitchen
// ---------------------------------------------------------------------------

const WORKTOP_T = 38;

function kitchenBase(c: Ctx, o: { doors: number; worktop?: THREE.Material; handle?: 'bar-h' | 'bar-v' }) {
  const { p, m, W, D, H } = c;
  const plinth = 100;
  p.box(m.accent('blackMetal'), [W - 20, plinth, D - 60], [0, 0, -10]);
  carcass(c, -W / 2, W / 2, plinth, H - WORKTOP_T, D, 18, m.tone(-0.1));
  p.rbox(o.worktop ?? m.surface('stone', '#2f3338'), [W, WORKTOP_T, D], 4, [0, H - WORKTOP_T, 0]);
  fronts(c, { x0: -W / 2 + 3, x1: W / 2 - 3, y0: plinth + 3, y1: H - WORKTOP_T - 3, z: D / 2, count: o.doors, handle: o.handle ?? 'bar-h', thick: 18 });
}

function kitchenSink(c: Ctx) {
  const { p, m, W, D, H } = c;
  const plinth = 100;
  p.box(m.accent('blackMetal'), [W - 20, plinth, D - 60], [0, 0, -10]);
  carcass(c, -W / 2, W / 2, plinth, H - WORKTOP_T, D, 18, m.tone(-0.1));
  fronts(c, { x0: -W / 2 + 3, x1: W / 2 - 3, y0: plinth + 3, y1: H - WORKTOP_T - 3, z: D / 2, count: 2, handle: 'bar-h', thick: 18 });

  // Worktop with a real cut-out for the basin
  const bw = W * 0.55;
  const bd = D * 0.62;
  const shape = new THREE.Shape();
  shape.moveTo(-W / 2, -D / 2);
  shape.lineTo(W / 2, -D / 2);
  shape.lineTo(W / 2, D / 2);
  shape.lineTo(-W / 2, D / 2);
  shape.closePath();
  const hole = new THREE.Path();
  const hx = -W * 0.05;
  const hz = 0;
  hole.moveTo(hx - bw / 2, hz - bd / 2);
  hole.lineTo(hx - bw / 2, hz + bd / 2);
  hole.lineTo(hx + bw / 2, hz + bd / 2);
  hole.lineTo(hx + bw / 2, hz - bd / 2);
  hole.closePath();
  shape.holes.push(hole);
  const top = new THREE.ExtrudeGeometry(shape, { depth: WORKTOP_T, bevelEnabled: false });
  top.rotateX(Math.PI / 2); // shape XY -> XZ, extrusion goes down
  p.add(top, m.surface('stone', '#cbd5e1'), [0, H, 0]);

  // Basin: steel walls and floor, 190 mm deep
  const steel = m.accent('steel');
  const basinD = 190;
  p.box(steel, [bw, 12, bd], [hx, H - WORKTOP_T - basinD, hz]);
  p.box(steel, [bw, basinD, 8], [hx, H - WORKTOP_T - basinD, hz - bd / 2 + 4]);
  p.box(steel, [bw, basinD, 8], [hx, H - WORKTOP_T - basinD, hz + bd / 2 - 4]);
  p.box(steel, [8, basinD, bd], [hx - bw / 2 + 4, H - WORKTOP_T - basinD, hz]);
  p.box(steel, [8, basinD, bd], [hx + bw / 2 - 4, H - WORKTOP_T - basinD, hz]);
  p.cyl(m.accent('blackMetal'), 30, 30, 4, [hx, H - WORKTOP_T - basinD + 12, hz], 20);

  // Faucet behind the basin
  const fx = hx;
  const fz = -D / 2 + 60;
  p.cyl(m.accent('chrome'), 24, 28, 40, [fx, H, fz], 20);
  const spout = new THREE.CatmullRomCurve3([
    new THREE.Vector3(fx, H + 40, fz),
    new THREE.Vector3(fx, H + 230, fz),
    new THREE.Vector3(fx, H + 280, fz + 60),
    new THREE.Vector3(fx, H + 250, fz + 170),
  ]);
  p.add(new THREE.TubeGeometry(spout, 32, 14, 12), m.accent('chrome'), [0, 0, 0]);
  p.cyl(m.accent('chrome'), 9, 9, 70, [fx + 70, H, fz], 12, [0, 0, -Math.PI / 2 + 0.2]); // lever
}

function kitchenStove(c: Ctx) {
  const { p, m, W, D, H } = c;
  const black = m.accent('screen');
  const steel = m.accent('steel');
  const plinth = 60;
  p.box(m.accent('blackMetal'), [W - 20, plinth, D - 60], [0, 0, -10]);
  const fz = D / 2 - 34; // front plane: handles and knobs end at the catalog depth
  p.rbox(m.main, [W, H - plinth - 24, D - 34], 4, [0, plinth, -17]);

  // Hob: glass slab with four burner rings
  p.rbox(black, [W, 24, D - 34], 6, [0, H - 24, -17]);
  const bx = W * 0.24;
  const bz = D * 0.22;
  const burners: Array<[number, number, number]> = [
    [-bx, -bz, 90],
    [bx, -bz, 70],
    [-bx, bz, 70],
    [bx, bz, 60],
  ];
  for (const [x, z, r] of burners) {
    const ring = new THREE.TorusGeometry(r, 4, 8, 32);
    ring.rotateX(Math.PI / 2);
    p.add(ring, m.surface('metal', '#9ca3af'), [x, H + 1, z]);
    p.cyl(steel, r * 0.4, r * 0.4, 5, [x, H - 2, z], 20);
  }

  // Oven door (dark glass) with a bar handle, and the control knobs
  const doorY = plinth + 120;
  p.rbox(m.tone(-0.2), [W - 10, H - plinth - 24 - 140 - 90, 22], 6, [0, doorY, fz - 11]);
  p.rbox(black, [W - 90, H - plinth - 24 - 140 - 220, 6], 4, [0, doorY + 70, fz + 1]);
  p.bar(steel, 9, W - 100, [0, H - 24 - 120, fz + 24]); // oven handle
  for (let i = 0; i < 4; i++) {
    p.cyl(m.accent('blackMetal'), 20, 22, 24, [-W / 2 + W * (0.2 + i * 0.2), H - 24 - 66, fz + 5], 20, [Math.PI / 2, 0, 0]);
  }
}

function kitchenFridge(c: Ctx) {
  const { p, m, W, D, H } = c;
  const steel = m.main;
  const plinth = 50;
  const fz = D / 2 - 34; // doors + handles end at the catalog depth
  p.box(m.accent('blackMetal'), [W - 20, plinth, D - 70], [0, 0, -17]);
  p.rbox(steel, [W, H - plinth, D - 34], 14, [0, plinth, -17]);
  // Two doors: freezer below, fridge above
  const split = (H - plinth) * 0.35 + plinth;
  p.rbox(m.tone(0.05), [W - 12, split - plinth - 6, 14], 6, [0, plinth + 3, fz - 4]);
  p.rbox(m.tone(0.05), [W - 12, H - split - 12, 14], 6, [0, split + 3, fz - 4]);
  const hx = -W / 2 + 40;
  p.cyl(m.accent('chrome'), 9, 9, 520, [hx, split + 200, fz + 24], 12);
  p.cyl(m.accent('chrome'), 9, 9, 300, [hx, plinth + 160, fz + 24], 12);
  for (const y of [split + 200, split + 720, plinth + 160, plinth + 460]) {
    p.cyl(m.accent('chrome'), 8, 8, 24, [hx, y - 2, fz + 12], 10, [Math.PI / 2, 0, 0]);
  }
}

function kitchenIsland(c: Ctx) {
  const { p, m, W, D, H } = c;
  const plinth = 100;
  p.box(m.accent('blackMetal'), [W - 40, plinth, D - 80], [0, 0, 0]);
  p.rbox(m.main, [W - 6, H - plinth - 40, D - 6], 6, [0, plinth, 0]);
  p.rbox(m.surface('stone', '#e5e7eb'), [W, 40, D], 6, [0, H - 40, 0]);
  // Cabinet fronts on the working side (+Z) and a recessed panel on the back
  const doors = Math.max(3, Math.round(W / 450));
  fronts(c, { x0: -W / 2 + 6, x1: W / 2 - 6, y0: plinth + 4, y1: H - 44, z: D / 2 - 2, count: doors, handle: 'bar-h', thick: 18, mat: m.tone(0.05) });
  for (let i = 0; i < doors; i++) {
    const cw = (W - 12) / doors;
    p.rbox(m.tone(-0.12), [cw - 40, H - plinth - 140, 8], 3, [-W / 2 + 6 + cw * (i + 0.5), plinth + 50, -D / 2 - 0 + 4]);
  }
}

// ---------------------------------------------------------------------------
// Bathroom
// ---------------------------------------------------------------------------

function bathVanity(c: Ctx) {
  const { p, m, W, D, H } = c;
  const ceramic = m.accent('ceramic');
  const legH = 150;
  p.rbox(m.main, [W, H - legH - 36, D], 6, [0, legH, 0]);
  fronts(c, { x0: -W / 2 + 6, x1: W / 2 - 6, y0: legH + 6, y1: H - 40, z: D / 2, count: 1, rows: 2, handle: 'bar-h', thick: 18 });
  for (const s of [-1, 1]) p.box(m.accent('blackMetal'), [30, legH, 30], [s * (W / 2 - 50), 0, 0]);
  p.rbox(ceramic, [W + 0, 36, D], 8, [0, H - 36, 0]);

  // Raised basin with a drain
  const bR = Math.min(W, D) * 0.34;
  p.cyl(ceramic, bR, bR * 0.95, 70, [0, H, D * 0.06], 40, undefined).scale.set(1.3, 1, 1);
  p.cyl(m.surface('gloss', '#e5e7eb'), bR * 0.78, bR * 0.7, 3, [0, H + 68, D * 0.06], 40).scale.set(1.3, 1, 1);
  p.cyl(m.accent('chrome'), 22, 22, 4, [0, H + 70, D * 0.06], 20);

  // Faucet
  const fz = -D / 2 + 55;
  p.cyl(m.accent('chrome'), 18, 22, 130, [0, H, fz], 16);
  p.box(m.accent('chrome'), [18, 18, 110], [0, H + 112, fz + 40]);
}

function bathToilet(c: Ctx) {
  const { p, m, W, D } = c;
  const ceramic = m.accent('ceramic');
  const tankD = 190;
  const bowlD = D - tankD + 20;

  // Pedestal and bowl
  p.rbox(ceramic, [W * 0.52, 250, D * 0.55], 70, [0, 0, D * 0.12]);
  const bowl = p.sphere(ceramic, 1, [0, 330, D / 2 - bowlD / 2 - 6], [W / 2, 190, bowlD / 2]);
  bowl.castShadow = true;
  // Seat ring and lid
  const ring = new THREE.TorusGeometry(1, 0.07, 10, 40);
  ring.scale(W * 0.47, bowlD * 0.46, 1);
  ring.rotateX(Math.PI / 2);
  p.add(ring, m.accent('ceramic'), [0, 458, D / 2 - bowlD / 2 - 4]);
  const lid = p.sphere(m.surface('gloss', '#f1f5f9'), 1, [0, 470, D / 2 - bowlD / 2 - 4], [W * 0.43, 16, bowlD * 0.44]);
  lid.rotation.x = -0.1;

  // Cistern against the wall, with push buttons
  p.rbox(ceramic, [W * 0.92, 380, tankD], 28, [0, 380, -D / 2 + tankD / 2]);
  p.rbox(ceramic, [W * 0.96, 24, tankD + 10], 12, [0, 760, -D / 2 + tankD / 2]);
  p.cyl(m.accent('chrome'), 24, 24, 10, [-30, 782, -D / 2 + tankD / 2], 20);
  p.cyl(m.accent('chrome'), 24, 24, 10, [30, 782, -D / 2 + tankD / 2], 20);
}

function bathShower(c: Ctx) {
  const { p, m, W, D, H } = c;
  const rim = 55;
  const shape = new THREE.Shape();
  const rr = 36;
  const roundRect = (s: THREE.Shape | THREE.Path, w: number, d: number) => {
    s.moveTo(-w / 2 + rr, -d / 2);
    s.lineTo(w / 2 - rr, -d / 2);
    s.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + rr);
    s.lineTo(w / 2, d / 2 - rr);
    s.quadraticCurveTo(w / 2, d / 2, w / 2 - rr, d / 2);
    s.lineTo(-w / 2 + rr, d / 2);
    s.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - rr);
    s.lineTo(-w / 2, -d / 2 + rr);
    s.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + rr, -d / 2);
  };
  roundRect(shape, W, D);
  const hole = new THREE.Path();
  roundRect(hole, W - 2 * rim, D - 2 * rim);
  shape.holes.push(hole);
  const ring = new THREE.ExtrudeGeometry(shape, { depth: H - 14, bevelEnabled: false });
  ring.rotateX(Math.PI / 2);
  p.add(ring, m.accent('ceramic'), [0, H, 0]);
  p.rbox(m.accent('ceramic'), [W - 2 * rim + 8, 20, D - 2 * rim + 8], 6, [0, 0, 0]);
  p.cyl(m.accent('chrome'), 48, 48, 4, [W * 0.1, 20, 0], 24);
  p.cyl(m.accent('blackMetal'), 14, 14, 5, [W * 0.1, 22, 0], 16);
  for (const dz of [-20, 0, 20]) p.box(m.accent('chrome'), [80, 3, 6], [W * 0.1, 24, dz]); // grate bars
}

function bathTub(c: Ctx) {
  const { p, m, W, D, H } = c;
  const wall = 62;
  const outer = new THREE.Shape();
  const inner = new THREE.Path();
  const stadium = (s: THREE.Shape | THREE.Path, w: number, d: number) => {
    const r = d / 2;
    s.moveTo(-w / 2 + r, -d / 2);
    s.lineTo(w / 2 - r, -d / 2);
    s.absarc(w / 2 - r, 0, r, -Math.PI / 2, Math.PI / 2, false);
    s.lineTo(-w / 2 + r, d / 2);
    s.absarc(-w / 2 + r, 0, r, Math.PI / 2, (3 * Math.PI) / 2, false);
  };
  stadium(outer, W, D);
  stadium(inner, W - 2 * wall, D - 2 * wall);
  outer.holes.push(inner);
  const body = new THREE.ExtrudeGeometry(outer, { depth: H - 50, bevelEnabled: false });
  body.rotateX(Math.PI / 2);
  const ceramic = m.accent('ceramic');
  p.add(body, ceramic, [0, H, 0]);

  // Floor, feet and water
  const floor = new THREE.Shape();
  stadium(floor, W - 2 * wall + 8, D - 2 * wall + 8);
  const floorGeo = new THREE.ExtrudeGeometry(floor, { depth: 70, bevelEnabled: false });
  floorGeo.rotateX(Math.PI / 2);
  p.add(floorGeo, ceramic, [0, 120, 0]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    p.cyl(m.accent('chrome'), 28, 22, 50, [sx * W * 0.32, 0, sz * D * 0.22], 16);
  }
  const water = new THREE.Shape();
  stadium(water, W - 2 * wall - 20, D - 2 * wall - 20);
  const waterGeo = new THREE.ShapeGeometry(water);
  waterGeo.rotateX(-Math.PI / 2);
  p.add(waterGeo, m.accent('water'), [0, H - 130, 0]);

  // Deck-mounted faucet at one end
  const fx = -W / 2 + wall + 70;
  p.cyl(m.accent('chrome'), 20, 24, 90, [fx, H - 30, 0], 16);
  p.box(m.accent('chrome'), [100, 16, 16], [fx + 50, H + 60, 0]);
}

// ---------------------------------------------------------------------------
// Stairs and generic
// ---------------------------------------------------------------------------

function stairs(c: Ctx) {
  const { p, m, W, D, H } = c;
  const steps = Math.max(8, Math.round(H / 180));
  const rise = H / steps;
  const run = D / steps;
  const stringer = 50;
  const tread = m.wood(-0.1);

  // Climbs towards -Z: the lowest step is at the front (+Z)
  for (let i = 0; i < steps; i++) {
    const zc = D / 2 - run * (i + 0.5);
    const top = rise * (i + 1);
    p.rbox(tread, [W - 2 * stringer, 42, run + 28], 5, [0, top - 42, zc - 10]);
    p.box(m.tone(-0.15), [W - 2 * stringer, rise - 42, 22], [0, top - rise, zc + run / 2 - 22 + 4]);
  }
  // Closed side stringers: the stepped profile, extruded
  const profile = new THREE.Shape();
  profile.moveTo(D / 2, 0);
  profile.lineTo(-D / 2, 0);
  profile.lineTo(-D / 2, H);
  for (let i = steps - 1; i >= 0; i--) {
    const back = D / 2 - run * (i + 1);
    profile.lineTo(back, rise * (i + 1));
    profile.lineTo(back + run, rise * (i + 1));
    if (i > 0) profile.lineTo(back + run, rise * i);
  }
  profile.lineTo(D / 2, 0);
  for (const s of [-1, 1]) {
    const side = new THREE.ExtrudeGeometry(profile, { depth: stringer, bevelEnabled: false });
    side.rotateY(-Math.PI / 2); // profile x -> world z; extrusion runs towards -x
    p.add(side, m.surface('wood', '#6b4a32'), [s < 0 ? -W / 2 + stringer : W / 2, 0, 0]);
  }
}

function genericBox(c: Ctx) {
  const { p, m, W, D, H } = c;
  p.rbox(m.main, [W, H, D], Math.min(18, W / 6, H / 6, D / 6), [0, 0, 0]);
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const MODELS: Record<string, ModelFn> = {
  sofa_3p: (c) => sofaLike(c, { seats: 3, arm: Math.min(200, c.W * 0.08) }),
  sofa_chaise: (c) => sofaLike(c, { seats: 2, arm: Math.min(180, c.W * 0.07), chaise: true }),
  armchair: (c) => sofaLike(c, { seats: 1, arm: Math.min(140, c.W * 0.15) }),
  coffee_table: coffeeTable,
  tv_unit: tvUnit,
  living_shelf: livingShelf,
  floor_lamp: floorLampArc,
  living_table: (c) => table(c, { top: 38, inset: 90 }),
  living_chair: (c) => chair(c, 'pad'),
  puff,

  bed_single: bed,
  bed_double: bed,
  bed_king: bed,
  nightstand,
  wardrobe_3d: wardrobe,
  dresser_drawers: dresser,
  valet_stand: valetStand,
  bedroom_lamp: bedroomLamp,

  kitchen_base_unit: (c) => kitchenBase(c, { doors: c.W > 700 ? 2 : 1 }),
  kitchen_sink_unit: kitchenSink,
  kitchen_stove_unit: kitchenStove,
  kitchen_fridge: kitchenFridge,
  kitchen_island: kitchenIsland,
  kitchen_chair: (c) => chair(c, 'slats'),
  kitchen_table: (c) => table(c, { top: 34, inset: 60 }),

  bath_vanity: bathVanity,
  bath_toilet: bathToilet,
  bath_shower: bathShower,
  bath_tub: bathTub,

  dining_table: (c) => table(c, { top: 36, inset: 90 }),
  dining_chair: (c) => chair(c, 'pad'),
  sideboard,
  office_desk: officeDesk,
  office_chair: officeChair,
  storage_tall: storageTall,
  stairs_straight: stairs,
  generic_box: genericBox,
};

/** Catalog ids that have a dedicated model (exported for tests). */
export const MODELED_CATALOG_IDS = Object.keys(MODELS);

/** Best-effort model lookup for items without a known catalog id (older projects, imports). */
function resolveModel(item: FurnitureItem): ModelFn {
  if (item.catalogId && MODELS[item.catalogId]) return MODELS[item.catalogId];
  const n = item.name.toLowerCase();
  if (/sof[aá]/.test(n)) return MODELS.sofa_3p;
  if (/cama|bed/.test(n)) return MODELS.bed_double;
  if (/silla|chair/.test(n)) return MODELS.dining_chair;
  if (/mesa|table/.test(n)) return MODELS.dining_table;
  if (/arm[aá]rio|wardrobe/.test(n)) return MODELS.wardrobe_3d;
  return genericBox;
}

/**
 * Builds the 3D model of a plan item. The result is centred on X/Z and stands on y = 0;
 * the caller positions and rotates it. `selected` tints every surface and adds an outline box.
 */
export function buildFurnitureModel(item: FurnitureItem, selected: boolean): THREE.Group {
  const group = new THREE.Group();
  const ctx: Ctx = {
    p: new Parts(group),
    m: new Mats(item.color || '#cbd5e1', item.material, selected),
    W: item.width,
    D: item.shape === 'circle' ? item.width : item.depth,
    H: item.height,
    item,
  };
  resolveModel(item)(ctx);

  if (selected) {
    const round = item.shape === 'circle';
    const geo = round
      ? new THREE.CylinderGeometry(ctx.W / 2, ctx.W / 2, ctx.H, 48)
      : new THREE.BoxGeometry(ctx.W, ctx.H, ctx.D);
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: '#0284c7' }));
    outline.position.y = ctx.H / 2;
    group.add(outline);
    geo.dispose();
  }
  return group;
}

// ---------------------------------------------------------------------------
// Parametric cabinets (built from their config, with real doors)
// ---------------------------------------------------------------------------

export function buildParametricCabinet3D(config: ParametricCabinetConfig, selected: boolean): THREE.Group {
  const group = new THREE.Group();
  const p = new Parts(group);
  const { exteriorWidth: W, exteriorHeight: H, exteriorDepth: D, boardThickness: T, plinthHeight: P } = config;
  const kind = surfaceKindOf(config.finishMaterial);
  const color = config.finishColor || '#f8fafc';
  const body = createSurface(kind, shade(color, -0.06), selected);
  const front = createSurface(kind, color, selected);
  const dark = createSurface('matte', '#334155', selected);
  const steel = createAccent('steel', selected);
  const glass = createAccent('glass');

  const sideH = H - P;
  const innerW = W - 2 * T;

  if (P > 0) p.box(dark, [W - 20, P, D - 40], [0, 0, 0]);
  p.box(body, [T, sideH, D], [-W / 2 + T / 2, P, 0]);
  p.box(body, [T, sideH, D], [W / 2 - T / 2, P, 0]);
  p.box(body, [innerW, T, D], [0, P, 0]);
  p.box(body, [innerW, T, D], [0, H - T, 0]);
  if (config.hasBack) p.box(body, [innerW, sideH - 2 * T, 8], [0, P + T, -D / 2 + 4]);

  for (const div of config.dividers) {
    p.box(body, [div.thickness, sideH - 2 * T, D - 20], [-W / 2 + div.positionFromLeft, P + T, -10]);
  }
  for (const s of config.shelves) {
    p.box(body, [innerW, s.thickness, s.fullDepth ? D - 20 : D * 0.6], [0, P + T + s.heightFromBase, s.fullDepth ? -10 : -D * 0.2 - 4]);
  }

  // Drawer fronts with handles
  for (const d of config.drawers) {
    const y = P + T + d.positionFromBase;
    p.rbox(front, [innerW - 6, d.frontHeight - 4, 20], 3, [0, y + 2, D / 2 - 10]);
    if (d.handleType === 'knob') p.knob(steel, [0, y + d.frontHeight / 2, D / 2 + 4]);
    else if (d.handleType === 'bar') p.barHandle(steel, Math.min(200, innerW * 0.4), [0, y + d.frontHeight * 0.55, D / 2 - 2]);
  }

  // Doors cover the front above the drawers
  const drawerTop = config.drawers.reduce((top, d) => Math.max(top, d.positionFromBase + d.frontHeight), 0);
  const doorY0 = P + T + 3 + drawerTop;
  const doorY1 = H - T - 3;
  const drawn = (x0: number, x1: number, d: ParametricCabinetConfig['doors'][number], leaf: 'left' | 'right') => {
    const w = x1 - x0;
    const cx = (x0 + x1) / 2;
    const mat = d.glassInsert ? steel : front;
    p.rbox(mat, [w, doorY1 - doorY0, 20], 3, [cx, doorY0, D / 2 - 10]);
    if (d.glassInsert) p.box(glass, [w - 90, doorY1 - doorY0 - 90, 6], [cx, doorY0 + 45, D / 2 + 1]);
    const hx = leaf === 'left' ? x1 - 36 : x0 + 36;
    if (d.handleType === 'knob') p.knob(steel, [hx, (doorY0 + doorY1) / 2, D / 2 + 4]);
    else if (d.handleType === 'bar') p.barHandle(steel, 320, [hx, (doorY0 + doorY1) / 2, D / 2 - 2], true);
  };
  for (const d of config.doors) {
    if (d.type === 'double') {
      drawn(-W / 2 + 2, -1.5, d, 'left');
      drawn(1.5, W / 2 - 2, d, 'right');
    } else if (d.type === 'sliding') {
      drawn(-W / 2 + 2, 6, d, 'left');
      drawn(-6, W / 2 - 2, d, 'right');
    } else {
      drawn(-W / 2 + 2, W / 2 - 2, d, d.type === 'single_left' ? 'right' : 'left');
    }
  }
  return group;
}
