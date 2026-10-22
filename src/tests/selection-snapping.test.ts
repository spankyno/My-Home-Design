import { describe, it, expect } from 'vitest';
import { hitTest } from '../editor2d/hitTest';
import { adaptiveGridStep, collectSnapLines, rectOfBox, snapRect } from '../editor2d/snapping';
import { createEmptyProject } from '../storage';
import type { Project, FurnitureItem, Opening } from '../types';

const piece = (id: string, x: number, y: number, w = 1000, d = 500, rotation = 0): FurnitureItem => ({
  id, name: id, category: 'generico', x, y, z: 0, width: w, depth: d, height: 500, rotation,
  color: '#fff', material: 'x', isLocked: false, lockProportions: true,
});

function scene(): Project {
  const p = createEmptyProject();
  p.walls = [{ id: 'wN', start: { x: 0, y: 0 }, end: { x: 5000, y: 0 }, thickness: 200, height: 2600 }];
  p.openings = [{ id: 'win', wallId: 'wN', type: 'window', distanceAlongWall: 2500, width: 1600, height: 1200, elevation: 900, flipSide: false, flipDirection: false } as Opening];
  p.rooms = [
    { id: 'big', name: 'big', points: [{ x: 0, y: 0 }, { x: 5000, y: 0 }, { x: 5000, y: 4000 }, { x: 0, y: 4000 }], floorColor: '#fff', floorMaterial: 'parquet_herringbone', height: 2600 },
    { id: 'small', name: 'small', points: [{ x: 3000, y: 2000 }, { x: 4500, y: 2000 }, { x: 4500, y: 3500 }, { x: 3000, y: 3500 }], floorColor: '#fff', floorMaterial: 'parquet_herringbone', height: 2600 },
  ];
  return p;
}
const Z = 0.12;

describe('hitTest', () => {
  it('clicking the floor next to a window selects the room, not the window (no disc spilling into the room)', () => {
    const p = scene();
    // 700 mm inside the room, right below the window centre: the old 900 mm disc would hit the window
    expect(hitTest(p, { x: 2500, y: 700 }, { zoom: Z })).toEqual({ type: 'room', id: 'big' });
    // but the window itself (on the wall) is hit
    expect(hitTest(p, { x: 2500, y: 0 }, { zoom: Z })).toEqual({ type: 'opening', id: 'win' });
    // and the wall beside the window is the wall
    expect(hitTest(p, { x: 500, y: 0 }, { zoom: Z })).toEqual({ type: 'wall', id: 'wN' });
  });

  it('picks the smallest room when rooms overlap', () => {
    expect(hitTest(scene(), { x: 3500, y: 2500 }, { zoom: Z })).toEqual({ type: 'room', id: 'small' });
  });

  it('hidden layers cannot be selected', () => {
    const p = scene();
    p.furniture = [piece('a', 1000, 2000)];
    expect(hitTest(p, { x: 1000, y: 2000 }, { zoom: Z })?.type).toBe('furniture');
    p.layers.furniture = false;
    expect(hitTest(p, { x: 1000, y: 2000 }, { zoom: Z })?.type).toBe('room');
    p.layers.walls = false;
    expect(hitTest(p, { x: 500, y: 0 }, { zoom: Z })?.type).toBe('room'); // the wall is hidden: only the room is left
    p.layers.rooms = false;
    expect(hitTest(p, { x: 500, y: 0 }, { zoom: Z })).toBeNull();
    expect(hitTest(p, { x: 1000, y: 2000 }, { zoom: Z })).toBeNull();
  });

  it('topmost piece wins, but an already-selected overlapping piece is kept', () => {
    const p = scene();
    p.furniture = [piece('under', 1000, 2000), piece('over', 1300, 2000)];
    const overlap = { x: 1100, y: 2000 };
    expect(hitTest(p, overlap, { zoom: Z })).toEqual({ type: 'furniture', id: 'over' });
    expect(hitTest(p, overlap, { zoom: Z, selectedIds: ['under'] })).toEqual({ type: 'furniture', id: 'under' });
    // the non-overlapping part of the covered piece still selects it
    expect(hitTest(p, { x: 600, y: 2000 }, { zoom: Z })).toEqual({ type: 'furniture', id: 'under' });
  });

  it('respects rotation and gives a small on-screen tolerance', () => {
    const p = scene();
    p.furniture = [piece('r', 2000, 2000, 1000, 200, 90)]; // becomes 200 wide x 1000 tall on screen
    expect(hitTest(p, { x: 2000, y: 2400 }, { zoom: Z })?.id).toBe('r');
    expect(hitTest(p, { x: 2400, y: 2000 }, { zoom: Z })?.type).toBe('room');
    // 2 px outside the edge still hits at this zoom (3 px tolerance)
    expect(hitTest(p, { x: 2000 + 100 + 2 / Z, y: 2000 }, { zoom: Z })?.id).toBe('r');
  });

  it('empty space returns null', () => {
    expect(hitTest(scene(), { x: 9000, y: 9000 }, { zoom: Z })).toBeNull();
  });
});

describe('adaptiveGridStep', () => {
  it('keeps the grid at normal zoom and refines it when zooming in', () => {
    expect(adaptiveGridStep(100, 0.12)).toBe(100);
    expect(adaptiveGridStep(100, 0.5)).toBe(50);
    expect(adaptiveGridStep(100, 1)).toBe(20);
    expect(adaptiveGridStep(100, 2)).toBe(20);
    expect(adaptiveGridStep(100, 10)).toBe(2);
    expect(adaptiveGridStep(100, 1000)).toBe(1);
  });
});

describe('object snapping', () => {
  const tol = 8 / Z; // 8 px at zoom 0.12 ~ 67 mm

  it('snaps a piece flush against a wall face when close', () => {
    const p = scene();
    const lines = collectSnapLines(p, new Set());
    // piece 1000x500 whose top edge is 40 mm from the wall's inner face (y = 100)
    const rect = rectOfBox({ x: 1500, y: 100 + 40 + 250, width: 1000, depth: 500, rotation: 0 });
    const s = snapRect(rect, lines, tol);
    expect(s.dy).toBe(-40);
    expect(s.guides.some((g) => g.axis === 'y' && g.value === 100)).toBe(true);
  });

  it('has a screen-constant reach: a gap that snaps when zoomed out is free when zoomed in', () => {
    const p = scene();
    const lines = collectSnapLines(p, new Set());
    const at = (gap: number) => rectOfBox({ x: 1500, y: 100 + gap + 250, width: 1000, depth: 500, rotation: 0 });

    expect(snapRect(at(120), lines, 8 / 0.12).dy).toBe(0); // 120 mm > 67 mm reach: no snap
    expect(snapRect(at(40), lines, 8 / 0.12).dy).toBe(-40); // zoomed out: pulled flush
    expect(snapRect(at(40), lines, 8 / 1).dy).toBe(0); // zoomed in (8 mm reach): you can leave a 40 mm gap
    expect(snapRect(at(5), lines, 8 / 1).dy).toBe(-5); // ...and still snap the last few mm
  });

  it('snaps edge-to-edge and centre-to-centre with other pieces, excluding itself', () => {
    const p = scene();
    p.furniture = [piece('a', 3000, 2000, 800, 600), piece('moving', 0, 0)];
    const lines = collectSnapLines(p, new Set(['moving']));
    expect(lines.some((l) => l.value === 0 && l.kind === 'center')).toBe(false);

    // moving piece's right edge 30 mm short of 'a' left edge (x = 2600)
    const adj = snapRect(rectOfBox({ x: 2600 - 30 - 500, y: 2000, width: 1000, depth: 400, rotation: 0 }), lines, tol);
    expect(adj.dx).toBe(30);
    // vertical centre 25 mm off 'a' centre (y = 2000) -> snaps centre to centre
    const ctr = snapRect(rectOfBox({ x: 1000, y: 2025, width: 1000, depth: 400, rotation: 0 }), lines, tol);
    expect(ctr.dy).toBe(-25);
  });

  it('ignores wall faces that are far along the wall', () => {
    const p = scene();
    const lines = collectSnapLines(p, new Set());
    const rect = rectOfBox({ x: 9000, y: 100 + 20 + 250, width: 1000, depth: 500, rotation: 0 }); // beyond the wall's end
    expect(snapRect(rect, lines, tol).dy).toBe(0);
  });
});
