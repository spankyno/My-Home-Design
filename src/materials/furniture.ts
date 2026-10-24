import * as THREE from 'three';

/**
 * Procedural surfaces for 3D furniture.
 *
 * Textures are generated on a canvas as *greyscale* patterns that are then tinted by the material colour, so the
 * colour chosen by the user still decides the look (a walnut chair and an oak chair share the same grain map).
 * Without a DOM (unit tests, SSR) the textures are skipped and plain coloured materials are returned.
 */

export type SurfaceKind = 'wood' | 'fabric' | 'metal' | 'gloss' | 'stone' | 'satin' | 'matte';

/** Maps the free-text catalog material ("wood_oak", "fabric_gray", "stainless_steel"...) to a surface kind. */
export function surfaceKindOf(material: string | undefined): SurfaceKind {
  const m = (material ?? '').toLowerCase();
  if (/wood|oak|walnut|teak|pine/.test(m)) return 'wood';
  if (/fabric|linen|cotton|velvet|mesh|textile/.test(m)) return 'fabric';
  if (/steel|brass|metal|chrome|alu|iron|copper/.test(m)) return 'metal';
  if (/porcelain|ceramic|resin|acrylic|glass|enamel/.test(m)) return 'gloss';
  if (/quartz|marble|stone|granite|terrazzo/.test(m)) return 'stone';
  if (/laminate|melamine|kitchen|lacquer/.test(m)) return 'satin';
  return 'matte';
}

type PatternKind = 'wood' | 'fabric' | 'brushed' | 'speckle';

const PATTERN_SIZE: Record<PatternKind, number> = { wood: 512, fabric: 128, brushed: 256, speckle: 256 };
/** Real-world size (mm) covered by one repetition of each pattern. */
const PATTERN_TILE_MM: Record<PatternKind, number> = { wood: 600, fabric: 90, brushed: 300, speckle: 260 };

const textureCache = new Map<PatternKind, THREE.CanvasTexture | null>();

/** Small deterministic PRNG so every browser draws the same grain. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawPattern(kind: PatternKind, ctx: CanvasRenderingContext2D, size: number) {
  const rand = mulberry32(kind.length * 7919 + size);

  if (kind === 'wood') {
    ctx.fillStyle = '#d9d9d9';
    ctx.fillRect(0, 0, size, size);
    // Long, slightly wavy grain lines, drawn 3 times vertically so the texture tiles seamlessly.
    for (let i = 0; i < 220; i++) {
      const y0 = rand() * size;
      const amp = 2 + rand() * 7;
      const freq = (0.004 + rand() * 0.01) * Math.PI * 2;
      const phase = rand() * Math.PI * 2;
      const dark = 0.04 + rand() * 0.16;
      ctx.strokeStyle = `rgba(40,40,40,${dark})`;
      ctx.lineWidth = 0.6 + rand() * 2.2;
      for (const wrap of [-size, 0, size]) {
        ctx.beginPath();
        for (let x = 0; x <= size; x += 8) {
          const y = y0 + wrap + Math.sin(x * freq + phase) * amp;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    // A few knots
    for (let k = 0; k < 3; k++) {
      const kx = rand() * size;
      const ky = rand() * size;
      for (let r = 4; r < 22; r += 4) {
        ctx.strokeStyle = `rgba(40,40,40,${0.22 - r * 0.008})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(kx, ky, r * 2.2, r, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  } else if (kind === 'fabric') {
    ctx.fillStyle = '#e4e4e4';
    ctx.fillRect(0, 0, size, size);
    // Woven threads
    for (let i = 0; i < size; i += 2) {
      ctx.fillStyle = `rgba(0,0,0,${0.1 + rand() * 0.07})`;
      ctx.fillRect(0, i, size, 1);
      ctx.fillStyle = `rgba(255,255,255,${0.12 + rand() * 0.08})`;
      ctx.fillRect(i, 0, 1, size);
    }
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(0,0,0,${rand() * 0.1})`;
      ctx.fillRect(rand() * size, rand() * size, 1, 1);
    }
  } else if (kind === 'brushed') {
    ctx.fillStyle = '#dcdcdc';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 520; i++) {
      const y = rand() * size;
      const light = rand() > 0.5;
      ctx.strokeStyle = light ? `rgba(255,255,255,${0.05 + rand() * 0.14})` : `rgba(0,0,0,${0.025 + rand() * 0.06})`;
      ctx.lineWidth = 0.5 + rand();
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y + (rand() - 0.5) * 2);
      ctx.stroke();
    }
  } else {
    // speckle: engineered stone / quartz
    ctx.fillStyle = '#e2e2e2';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 2600; i++) {
      const v = Math.floor(120 + rand() * 135);
      ctx.fillStyle = `rgba(${v},${v},${v},${0.25 + rand() * 0.5})`;
      const r = 0.5 + rand() * 1.8;
      ctx.beginPath();
      ctx.arc(rand() * size, rand() * size, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function getPattern(kind: PatternKind): THREE.CanvasTexture | null {
  if (textureCache.has(kind)) return textureCache.get(kind) ?? null;
  if (typeof document === 'undefined') {
    textureCache.set(kind, null);
    return null;
  }
  const size = PATTERN_SIZE[kind];
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    textureCache.set(kind, null);
    return null;
  }
  drawPattern(kind, ctx, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  textureCache.set(kind, tex);
  return tex;
}

interface SurfaceSpec {
  pattern?: PatternKind;
  roughness: number;
  metalness: number;
  bump?: number;
  clearcoat?: number;
  sheen?: number;
}

const SURFACES: Record<SurfaceKind, SurfaceSpec> = {
  wood: { pattern: 'wood', roughness: 0.55, metalness: 0, bump: 0.5, clearcoat: 0.15 },
  fabric: { pattern: 'fabric', roughness: 0.95, metalness: 0, bump: 1.2, sheen: 0.5 },
  metal: { pattern: 'brushed', roughness: 0.34, metalness: 0.85, bump: 0.08 },
  gloss: { roughness: 0.12, metalness: 0.02, clearcoat: 0.8 },
  stone: { pattern: 'speckle', roughness: 0.28, metalness: 0.02, clearcoat: 0.4 },
  satin: { roughness: 0.42, metalness: 0.02, clearcoat: 0.2 },
  matte: { roughness: 0.8, metalness: 0.02 },
};

const HIGHLIGHT = new THREE.Color('#0ea5e9');

/**
 * A tinted, textured material for a surface kind. `tileMm` (stored in userData) tells the UV mapper how big one
 * repetition of the pattern is in the real world.
 */
export function createSurface(kind: SurfaceKind, color: string, selected = false): THREE.MeshPhysicalMaterial {
  const spec = SURFACES[kind];
  const tex = spec.pattern ? getPattern(spec.pattern) : null;

  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    roughness: spec.roughness,
    metalness: spec.metalness,
    clearcoat: spec.clearcoat ?? 0,
    clearcoatRoughness: 0.35,
    sheen: spec.sheen ?? 0,
    sheenRoughness: 0.8,
    sheenColor: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.4),
  });
  if (tex) {
    mat.map = tex;
    if (spec.bump) {
      mat.bumpMap = tex;
      mat.bumpScale = spec.bump;
    }
    mat.userData.tileMm = PATTERN_TILE_MM[spec.pattern!];
  }
  if (selected) {
    mat.emissive = HIGHLIGHT.clone();
    mat.emissiveIntensity = 0.28;
  }
  return mat;
}

/** Darker / lighter variant of a colour, for secondary parts made of the same material. */
export function shade(color: string, amount: number): string {
  const c = new THREE.Color(color);
  const target = amount < 0 ? new THREE.Color('#000000') : new THREE.Color('#ffffff');
  return `#${c.lerp(target, Math.min(1, Math.abs(amount))).getHexString()}`;
}

/**
 * Re-maps UVs so one texture tile covers `tileMm` of real surface, whatever the mesh size. The projection axis is
 * the one most aligned with each vertex normal. On tall, thin parts (legs, posts) the grain runs along the part.
 */
export function applyWorldUV(geometry: THREE.BufferGeometry, tileMm: number) {
  const pos = geometry.getAttribute('position');
  const nor = geometry.getAttribute('normal');
  if (!pos || !nor) return;

  geometry.computeBoundingBox();
  const size = geometry.boundingBox!.getSize(new THREE.Vector3());
  const vertical = size.y > 2 * Math.max(size.x, size.z);

  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const nz = Math.abs(nor.getZ(i));
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);

    let u: number;
    let v: number;
    if (ny >= nx && ny >= nz) {
      u = x;
      v = z;
    } else if (nx >= nz) {
      u = vertical ? y : z;
      v = vertical ? z : y;
    } else {
      u = vertical ? y : x;
      v = vertical ? x : y;
    }
    uv[i * 2] = u / tileMm;
    uv[i * 2 + 1] = v / tileMm;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

// ---------------------------------------------------------------------------
// Fixed accent materials (no texture): metals, glass, ceramics, rubber...
// ---------------------------------------------------------------------------

export type AccentKind =
  | 'chrome'
  | 'brass'
  | 'steel'
  | 'blackMetal'
  | 'rubber'
  | 'glass'
  | 'mirror'
  | 'ceramic'
  | 'screen'
  | 'lampGlow'
  | 'water';

export function createAccent(kind: AccentKind, selected = false): THREE.MeshPhysicalMaterial {
  const base: Record<AccentKind, THREE.MeshPhysicalMaterialParameters> = {
    chrome: { color: '#e5e7eb', metalness: 1, roughness: 0.08 },
    brass: { color: '#d4a64a', metalness: 0.95, roughness: 0.28 },
    steel: { color: '#cbd5e1', metalness: 0.9, roughness: 0.3 },
    blackMetal: { color: '#1f2937', metalness: 0.7, roughness: 0.45 },
    rubber: { color: '#111827', metalness: 0, roughness: 0.9 },
    glass: { color: '#bfdbfe', metalness: 0, roughness: 0.05, transparent: true, opacity: 0.35 },
    mirror: { color: '#f1f5f9', metalness: 1, roughness: 0.03 },
    ceramic: { color: '#fafafa', metalness: 0, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.08 },
    screen: { color: '#0b1220', metalness: 0.3, roughness: 0.1, clearcoat: 1 },
    lampGlow: { color: '#fff3c4', emissive: new THREE.Color('#ffd98a'), emissiveIntensity: 0.75, roughness: 0.6, side: THREE.DoubleSide },
    water: { color: '#bae6fd', metalness: 0, roughness: 0.02, transparent: true, opacity: 0.6 },
  };
  const mat = new THREE.MeshPhysicalMaterial(base[kind]);
  if (selected && kind !== 'glass' && kind !== 'lampGlow') {
    mat.emissive = HIGHLIGHT.clone();
    mat.emissiveIntensity = 0.2;
  }
  return mat;
}
