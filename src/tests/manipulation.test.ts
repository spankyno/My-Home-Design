import { describe, it, expect } from 'vitest';
import {
  furnitureHandlePoints,
  resizeFurniture,
  resizeCursor,
  isAxisAlignedRect,
  roomBoxHandlePoints,
  resizeRoomBox,
  moveRoomVertex,
  moveOpeningAlongWall,
  resizeOpeningEnd,
  Box,
  HandleId,
} from '../editor2d/manipulation';

const rotate = (v: { x: number; y: number }, deg: number) => {
  const r = (deg * Math.PI) / 180;
  return { x: v.x * Math.cos(r) - v.y * Math.sin(r), y: v.x * Math.sin(r) + v.y * Math.cos(r) };
};
/** World position of a point on the box edge given local offsets in half-sizes. */
const edgePoint = (b: Box, lx: number, ly: number) => {
  const o = rotate({ x: lx * b.width / 2, y: ly * b.depth / 2 }, b.rotation);
  return { x: b.x + o.x, y: b.y + o.y };
};

describe('resizeFurniture', () => {
  const base: Box = { x: 1000, y: 2000, width: 800, depth: 400, rotation: 0 };

  it('dragging the east handle only changes the width and keeps the west side fixed', () => {
    const r = resizeFurniture(base, 'e', { x: 1400 + 30 + 200, y: 2000 }, { step: 10 });
    expect(r.width).toBe(1000);
    expect(r.depth).toBe(400);
    expect(r.x - r.width / 2).toBe(600); // west edge unchanged
    expect(r.y).toBe(2000);
  });

  it('dragging the north-west corner keeps the south-east corner fixed', () => {
    const r = resizeFurniture(base, 'nw', { x: 500 - 30, y: 1800 - 30 - 100 });
    const anchorBefore = { x: base.x + base.width / 2, y: base.y + base.depth / 2 };
    expect({ x: r.x + r.width / 2, y: r.y + r.depth / 2 }).toEqual(anchorBefore);
    expect(r.width).toBe(900);
    expect(r.depth).toBe(500);
  });

  it.each<HandleId>(['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw'])(
    'a rotated piece keeps the opposite side fixed in the world (%s)',
    (h) => {
      const rotated: Box = { ...base, rotation: 37 };
      const handle = furnitureHandlePoints(rotated).find((p) => p.id === h)!.point;
      // drag 150mm further out along the same direction
      const dir = { x: handle.x - rotated.x, y: handle.y - rotated.y };
      const len = Math.hypot(dir.x, dir.y);
      const mouse = { x: handle.x + (dir.x / len) * 150, y: handle.y + (dir.y / len) * 150 };

      const out = resizeFurniture(rotated, h, mouse, { step: 0 });
      const opposite: Record<HandleId, [number, number]> = {
        n: [0, 1], s: [0, -1], e: [-1, 0], w: [1, 0], ne: [-1, 1], se: [-1, -1], sw: [1, -1], nw: [1, 1],
      };
      const [ox, oy] = opposite[h];
      const before = edgePoint(rotated, ox, oy);
      const after = edgePoint(out, ox, oy);
      expect(after.x).toBeCloseTo(before.x, 0);
      expect(after.y).toBeCloseTo(before.y, 0);
      expect(out.width * out.depth).toBeGreaterThan(rotated.width * rotated.depth);
    }
  );

  it('keepAspect on a corner preserves the ratio', () => {
    const r = resizeFurniture(base, 'se', { x: 1400 + 30 + 400, y: 2200 + 30 + 10 }, { keepAspect: true, step: 0 });
    expect(r.width / r.depth).toBeCloseTo(2, 5);
    expect(r.width).toBeGreaterThan(base.width);
  });

  it('never goes below the minimum size and never flips', () => {
    const r = resizeFurniture(base, 'e', { x: -5000, y: 0 });
    expect(r.width).toBe(50);
    expect(r.x - r.width / 2).toBe(600);
  });

  it('rounds sizes to the step', () => {
    const r = resizeFurniture(base, 'e', { x: 1400 + 30 + 37, y: 2000 }, { step: 10 });
    expect(r.width % 10).toBe(0);
  });
});

describe('resizeCursor', () => {
  it('maps handles to cursors and follows rotation', () => {
    expect(resizeCursor('e')).toBe('ew-resize');
    expect(resizeCursor('n')).toBe('ns-resize');
    expect(resizeCursor('se')).toBe('nwse-resize');
    expect(resizeCursor('ne')).toBe('nesw-resize');
    expect(resizeCursor('e', 90)).toBe('ns-resize');
  });
});

describe('room resizing', () => {
  const rect = [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, { x: 0, y: 3000 }];

  it('detects axis-aligned rectangles only', () => {
    expect(isAxisAlignedRect(rect)).toBe(true);
    expect(isAxisAlignedRect([...rect.slice(0, 3)])).toBe(false);
    expect(isAxisAlignedRect([{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, { x: 500, y: 3000 }])).toBe(false);
  });

  it('exposes 8 handles on the bounding box', () => {
    const h = roomBoxHandlePoints(rect);
    expect(h).toHaveLength(8);
    expect(h.find((x) => x.id === 'se')!.point).toEqual({ x: 4000, y: 3000 });
    expect(h.find((x) => x.id === 'n')!.point).toEqual({ x: 2000, y: 0 });
  });

  it('SE corner grows the room keeping the NW corner fixed', () => {
    expect(resizeRoomBox(rect, 'se', { x: 5000, y: 3500 })).toEqual([
      { x: 0, y: 0 }, { x: 5000, y: 0 }, { x: 5000, y: 3500 }, { x: 0, y: 3500 },
    ]);
  });

  it('NW corner keeps the SE corner fixed; edge handles change a single axis', () => {
    expect(resizeRoomBox(rect, 'nw', { x: -1000, y: -500 })[0]).toEqual({ x: -1000, y: -500 });
    const east = resizeRoomBox(rect, 'e', { x: 6000, y: 9999 });
    expect(east.map((p) => p.y)).toEqual([0, 0, 3000, 3000]);
    expect(east[1].x).toBe(6000);
  });

  it('enforces a minimum size and does not invert', () => {
    const r = resizeRoomBox(rect, 'e', { x: -3000, y: 0 });
    expect(r[1].x - r[0].x).toBe(500);
  });

  it('scales non-rectangular shapes proportionally and moves single vertices', () => {
    const l = [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 1000 }, { x: 1000, y: 1000 }, { x: 1000, y: 4000 }, { x: 0, y: 4000 }];
    const scaled = resizeRoomBox(l, 'e', { x: 8000, y: 0 });
    expect(scaled[2]).toEqual({ x: 8000, y: 1000 });
    expect(scaled[3]).toEqual({ x: 2000, y: 1000 });
    expect(moveRoomVertex(rect, 2, { x: 4100.4, y: 3200 })[2]).toEqual({ x: 4100, y: 3200 });
    expect(moveRoomVertex(rect, 2, { x: 0, y: 0 })[0]).toEqual(rect[0]);
  });
});

describe('opening manipulation', () => {
  it('keeps a moved opening inside the wall', () => {
    expect(moveOpeningAlongWall(5000, 900, -50)).toBe(450);
    expect(moveOpeningAlongWall(5000, 900, 9999)).toBe(4550);
    expect(moveOpeningAlongWall(5000, 900, 2500)).toBe(2500);
    expect(moveOpeningAlongWall(800, 900, 100)).toBe(400);
  });

  it('resizes from either end with the other end fixed', () => {
    const op = { distanceAlongWall: 2000, width: 1000 }; // 1500 .. 2500
    expect(resizeOpeningEnd(op, 'end', 3100, 5000)).toEqual({ width: 1600, distanceAlongWall: 2300 });
    expect(resizeOpeningEnd(op, 'start', 1000, 5000)).toEqual({ width: 1500, distanceAlongWall: 1750 });
  });

  it('respects min width and wall limits', () => {
    const op = { distanceAlongWall: 2000, width: 1000 };
    expect(resizeOpeningEnd(op, 'end', 0, 5000).width).toBe(300);
    expect(resizeOpeningEnd(op, 'end', 99999, 5000)).toEqual({ width: 3500, distanceAlongWall: 3250 });
    expect(resizeOpeningEnd(op, 'start', -500, 5000)).toEqual({ width: 2500, distanceAlongWall: 1250 });
  });
});

describe('round pieces', () => {
  const circle: Box = { x: 1000, y: 1000, width: 600, depth: 600, rotation: 0 };

  it('edge handles keep a circle round and the opposite side fixed', () => {
    const r = resizeFurniture(circle, 'e', { x: 1000 + 300 + 30 + 200, y: 1000 }, { square: true, step: 10 });
    expect(r.width).toBe(800);
    expect(r.depth).toBe(800);
    expect(r.x - r.width / 2).toBe(700); // west side unchanged
    expect(r.y).toBe(1000);
  });

  it('corner handles keep it round too', () => {
    const r = resizeFurniture(circle, 'se', { x: 1000 + 300 + 30 + 100, y: 1000 + 300 + 30 + 60 }, { square: true, keepAspect: true, step: 10 });
    expect(r.width).toBe(r.depth);
    expect(r.width).toBeGreaterThan(600);
  });
});
