import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { FURNITURE_CATALOG, furnitureFromCatalog } from '../catalog';
import { MODELED_CATALOG_IDS, buildFurnitureModel, buildParametricCabinet3D } from '../editor3d/furnitureModels';
import { buildFurnitureMesh } from '../editor3d/sceneBuilders';
import { applyWorldUV, shade, surfaceKindOf } from '../materials/furniture';
import { createDefaultCabinetConfig } from '../parametric';

const meshCount = (g: THREE.Object3D) => {
  let n = 0;
  g.traverse((o) => o instanceof THREE.Mesh && n++);
  return n;
};
const boxOf = (g: THREE.Object3D) => {
  g.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(g);
};

describe('catalog', () => {
  it('has the requested new pieces with the requested sizes (cm -> mm)', () => {
    const by = (id: string) => FURNITURE_CATALOG.find((c) => c.id === id)!;
    expect([by('living_table').category, by('living_table').defaultWidth, by('living_table').defaultDepth]).toEqual(['salon', 1600, 900]);
    expect([by('living_chair').category, by('living_chair').defaultWidth, by('living_chair').defaultDepth]).toEqual(['salon', 400, 400]);
    expect([by('puff').category, by('puff').defaultWidth, by('puff').defaultDepth, by('puff').shape]).toEqual(['salon', 600, 600, 'circle']);
    expect([by('valet_stand').category, by('valet_stand').defaultWidth, by('valet_stand').defaultDepth]).toEqual(['dormitorio', 500, 200]);
    expect([by('bedroom_lamp').category, by('bedroom_lamp').defaultWidth, by('bedroom_lamp').defaultDepth, by('bedroom_lamp').shape]).toEqual(['dormitorio', 400, 400, 'circle']);
    expect([by('kitchen_chair').category, by('kitchen_chair').defaultWidth, by('kitchen_chair').defaultDepth]).toEqual(['cocina', 400, 400]);
    expect([by('kitchen_table').category, by('kitchen_table').defaultWidth, by('kitchen_table').defaultDepth]).toEqual(['cocina', 1500, 700]);
  });

  it('catalog ids are unique and furnitureFromCatalog carries the shape', () => {
    const ids = FURNITURE_CATALOG.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const puff = furnitureFromCatalog(FURNITURE_CATALOG.find((c) => c.id === 'puff')!, { x: 10, y: 20 });
    expect(puff.shape).toBe('circle');
    expect([puff.x, puff.y, puff.catalogId]).toEqual([10, 20, 'puff']);
    expect(furnitureFromCatalog(FURNITURE_CATALOG[0], { x: 0, y: 0 }).shape).toBeUndefined();
  });
});

describe('3D models', () => {
  it('every catalog piece has its own model (none falls back to a plain box)', () => {
    const missing = FURNITURE_CATALOG.filter((c) => c.id !== 'generic_box' && !MODELED_CATALOG_IDS.includes(c.id)).map((c) => c.id);
    expect(missing).toEqual([]);
  });

  it.each(FURNITURE_CATALOG.map((c) => [c.id, c] as const))('%s: detailed, inside its footprint, right height', (_id, def) => {
    const item = furnitureFromCatalog(def, { x: 0, y: 0 });
    const g = buildFurnitureModel(item, false);
    const box = boxOf(g);
    const size = box.getSize(new THREE.Vector3());

    if (def.id !== 'generic_box') expect(meshCount(g)).toBeGreaterThanOrEqual(5); // not a cube
    for (const v of [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z]) expect(Number.isFinite(v)).toBe(true);

    const tol = (n: number) => n * 0.03 + 12;
    expect(box.max.x).toBeLessThanOrEqual(item.width / 2 + tol(item.width));
    expect(box.min.x).toBeGreaterThanOrEqual(-item.width / 2 - tol(item.width));
    expect(box.max.z).toBeLessThanOrEqual(item.depth / 2 + tol(item.depth));
    expect(box.min.z).toBeGreaterThanOrEqual(-item.depth / 2 - tol(item.depth));
    expect(box.min.y).toBeGreaterThanOrEqual(-2);
    // fills most of the footprint and stands at about the catalog height (faucets/lamp arcs may rise above)
    expect(size.x).toBeGreaterThan(item.width * 0.7);
    expect(size.z).toBeGreaterThan(item.depth * 0.6);
    expect(size.y).toBeGreaterThan(item.height * 0.85);
    expect(size.y).toBeLessThan(item.height + 450);
  });

  it('round pieces stay within their circle', () => {
    for (const id of ['puff', 'bedroom_lamp']) {
      const item = furnitureFromCatalog(FURNITURE_CATALOG.find((c) => c.id === id)!, { x: 0, y: 0 });
      const g = buildFurnitureModel(item, false);
      g.updateMatrixWorld(true);
      const r = item.width / 2;
      let maxR = 0;
      g.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const pos = o.geometry.getAttribute('position');
        for (let i = 0; i < pos.count; i += 3) {
          const v = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
          maxR = Math.max(maxR, Math.hypot(v.x, v.z));
        }
      });
      expect(maxR).toBeLessThanOrEqual(r * 1.02);
    }
  });

  it('models scale with the item size (resizable on the plan)', () => {
    const def = FURNITURE_CATALOG.find((c) => c.id === 'kitchen_table')!;
    const item = { ...furnitureFromCatalog(def, { x: 0, y: 0 }), width: 2000, depth: 900 };
    const size = boxOf(buildFurnitureModel(item, false)).getSize(new THREE.Vector3());
    expect(Math.round(size.x)).toBeGreaterThanOrEqual(1950);
    expect(Math.round(size.z)).toBeGreaterThanOrEqual(850);
  });

  it('selection adds an outline instead of recolouring the whole piece', () => {
    const item = furnitureFromCatalog(FURNITURE_CATALOG.find((c) => c.id === 'sofa_3p')!, { x: 0, y: 0 });
    const plain = buildFurnitureModel(item, false);
    const selected = buildFurnitureModel(item, true);
    let lines = 0;
    selected.traverse((o) => o instanceof THREE.LineSegments && lines++);
    expect(lines).toBe(1);
    expect(meshCount(selected)).toBe(meshCount(plain));
  });

  it('placement matches the plan: position, elevation and rotation', () => {
    const item = { ...furnitureFromCatalog(FURNITURE_CATALOG[0], { x: 1200, y: 3400 }), z: 300, rotation: 90 };
    const g = buildFurnitureMesh(item, false);
    expect([g.position.x, g.position.y, g.position.z]).toEqual([1200, 300, 3400]);
    expect(g.rotation.y).toBeCloseTo(-Math.PI / 2);
  });

  it('parametric cabinets get real doors on top of the drawers', () => {
    const cfg = createDefaultCabinetConfig('closet');
    cfg.doors = [{ id: 'd1', type: 'double', handleType: 'bar', glassInsert: false }];
    cfg.drawers = [{ id: 'dr', positionFromBase: 0, frontHeight: 200, handleType: 'bar' }];
    const withDoors = buildParametricCabinet3D(cfg, false);
    cfg.doors = [];
    const without = buildParametricCabinet3D(cfg, false);
    expect(meshCount(withDoors)).toBeGreaterThan(meshCount(without));
    const box = boxOf(withDoors);
    expect(box.max.z).toBeLessThanOrEqual(cfg.exteriorDepth / 2 + 30);
  });
});

describe('surface materials', () => {
  it('maps catalog material names to surface kinds', () => {
    expect(surfaceKindOf('wood_oak')).toBe('wood');
    expect(surfaceKindOf('fabric_velvet')).toBe('fabric');
    expect(surfaceKindOf('stainless_steel')).toBe('metal');
    expect(surfaceKindOf('porcelain_white')).toBe('gloss');
    expect(surfaceKindOf('quartz_black')).toBe('stone');
    expect(surfaceKindOf('melamine_gray')).toBe('satin');
    expect(surfaceKindOf(undefined)).toBe('matte');
  });

  it('UVs are in real-world units: the same texture tile covers the same size on big and small parts', () => {
    const big = new THREE.BoxGeometry(1600, 40, 900);
    const small = new THREE.BoxGeometry(100, 40, 100);
    applyWorldUV(big, 400);
    applyWorldUV(small, 400);
    const range = (g: THREE.BufferGeometry) => {
      // top face (normal +Y) spans x
      const pos = g.getAttribute('position');
      const nor = g.getAttribute('normal');
      const uv = g.getAttribute('uv');
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i < pos.count; i++) {
        if (nor.getY(i) > 0.9) {
          lo = Math.min(lo, uv.getX(i));
          hi = Math.max(hi, uv.getX(i));
        }
      }
      return hi - lo;
    };
    expect(range(big)).toBeCloseTo(4, 5); // 1600 / 400 tiles
    expect(range(small)).toBeCloseTo(0.25, 5);
  });

  it('shade darkens and lightens', () => {
    const lum = (hex: string) => parseInt(hex.slice(1, 3), 16);
    expect(lum(shade('#808080', -0.5))).toBeLessThan(lum('#808080'));
    expect(lum(shade('#808080', 0.5))).toBeGreaterThan(lum('#808080'));
    expect(shade('#808080', -1)).toBe('#000000');
    expect(shade('#808080', 1)).toBe('#ffffff');
  });
});

describe('3D performance budget', () => {
  it.each(FURNITURE_CATALOG.map((c) => [c.id, c] as const))('%s stays light (triangles and draw calls)', (_id, def) => {
    const g = buildFurnitureModel(furnitureFromCatalog(def, { x: 0, y: 0 }), false);
    let tris = 0;
    let meshes = 0;
    g.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      meshes++;
      const geo = o.geometry as THREE.BufferGeometry;
      tris += (geo.index ? geo.index.count : geo.getAttribute('position').count) / 3;
    });
    expect(tris).toBeLessThan(15000);
    expect(meshes).toBeLessThan(60);
  });
});
