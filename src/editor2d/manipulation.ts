import { Point2D } from '../types';
import { clampOpeningCentre } from '../geometry';

/**
 * Pure geometry for direct manipulation on the 2D canvas (resize handles).
 * No canvas / React here so it can be unit-tested.
 *
 * Handles are named by compass position of the *local* box: 'n' is the side at
 * negative local Y (top of the piece), 'e' the side at positive local X, etc.
 */
export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

type Dir = -1 | 0 | 1;
export const HANDLE_DIRS: Record<HandleId, { sx: Dir; sy: Dir }> = {
  nw: { sx: -1, sy: -1 },
  n: { sx: 0, sy: -1 },
  ne: { sx: 1, sy: -1 },
  e: { sx: 1, sy: 0 },
  se: { sx: 1, sy: 1 },
  s: { sx: 0, sy: 1 },
  sw: { sx: -1, sy: 1 },
  w: { sx: -1, sy: 0 },
};
export const HANDLE_IDS = Object.keys(HANDLE_DIRS) as HandleId[];

export const MIN_FURNITURE_SIZE = 50; // mm
export const MIN_ROOM_SIZE = 500; // mm
export const MIN_OPENING_WIDTH = 300; // mm
export const MIN_WALL_LENGTH = 100; // mm

/** Gap (mm) between a piece and its selection frame, where the handles sit. */
export const FRAME_MARGIN = 30;

export interface Box {
  x: number; // centre
  y: number;
  width: number;
  depth: number;
  rotation: number; // degrees
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Local (piece) offset -> world offset. Same convention as ctx.rotate(rotation). */
function rotateBy(v: Point2D, deg: number): Point2D {
  const r = rad(deg);
  return { x: v.x * Math.cos(r) - v.y * Math.sin(r), y: v.x * Math.sin(r) + v.y * Math.cos(r) };
}

/** World point -> local coordinates relative to the box centre. */
function toLocal(box: Box, world: Point2D): Point2D {
  return rotateBy({ x: world.x - box.x, y: world.y - box.y }, -box.rotation);
}

const roundTo = (v: number, step: number) => (step > 0 ? Math.round(v / step) * step : v);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ---------------------------------------------------------------------------
// Furniture
// ---------------------------------------------------------------------------

/** World position of the 8 handles of a piece's selection frame. */
export function furnitureHandlePoints(box: Box, margin = FRAME_MARGIN): Array<{ id: HandleId; point: Point2D }> {
  return HANDLE_IDS.map((id) => {
    const { sx, sy } = HANDLE_DIRS[id];
    const off = rotateBy({ x: sx * (box.width / 2 + margin), y: sy * (box.depth / 2 + margin) }, box.rotation);
    return { id, point: { x: box.x + off.x, y: box.y + off.y } };
  });
}

export interface ResizeOptions {
  /** Distance between the piece and the handle (so the grab point doesn't make the piece jump). */
  margin?: number;
  /** Corner handles keep the width/depth ratio. */
  keepAspect?: boolean;
  /** Round sizes to this step (mm). */
  step?: number;
  minSize?: number;
  /** Keep width = depth (round pieces): edge handles then resize both axes. */
  square?: boolean;
}

/**
 * Resizes a (possibly rotated) piece by dragging one handle while the opposite
 * side/corner stays fixed in the world. Always computed from the state at the
 * start of the drag (`init`), so there is no accumulated error.
 */
export function resizeFurniture(init: Box, handle: HandleId, mouse: Point2D, opts: ResizeOptions = {}): Box {
  const { margin = FRAME_MARGIN, keepAspect = false, step = 10, minSize = MIN_FURNITURE_SIZE, square = false } = opts;
  const { sx, sy } = HANDLE_DIRS[handle];

  const m = toLocal(init, mouse);
  const mx = m.x - sx * margin;
  const my = m.y - sy * margin;

  let width = sx === 0 ? init.width : sx * mx + init.width / 2;
  let depth = sy === 0 ? init.depth : sy * my + init.depth / 2;

  if (keepAspect && sx !== 0 && sy !== 0) {
    const k = Math.max(width / init.width, depth / init.depth, minSize / init.width, minSize / init.depth);
    width = init.width * k;
    depth = init.depth * k;
  }

  width = Math.max(minSize, roundTo(width, step));
  depth = Math.max(minSize, roundTo(depth, step));

  if (square) {
    // Edge handles drive both axes; the piece grows symmetrically across the dragged axis.
    if (sy === 0) depth = width;
    else if (sx === 0) width = depth;
    else width = depth = Math.max(width, depth);
  }

  // The fixed side stays put: the centre moves by half of the size change.
  const centre = rotateBy({ x: (sx * (width - init.width)) / 2, y: (sy * (depth - init.depth)) / 2 }, init.rotation);
  return { x: Math.round(init.x + centre.x), y: Math.round(init.y + centre.y), width, depth, rotation: init.rotation };
}

/** Resize cursor that matches the handle's on-screen direction (accounts for rotation). */
export function resizeCursor(handle: HandleId, rotationDeg = 0): string {
  const { sx, sy } = HANDLE_DIRS[handle];
  const angle = (((Math.atan2(sy, sx) * 180) / Math.PI + rotationDeg) % 180 + 180) % 180;
  return ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][Math.round(angle / 45) % 4];
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

function bounds(points: Point2D[]) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

/** True for a 4-vertex room whose corners are the corners of its bounding box. */
export function isAxisAlignedRect(points: Point2D[], tolerance = 1): boolean {
  if (points.length !== 4) return false;
  const { minX, maxX, minY, maxY } = bounds(points);
  const corners = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
  return corners.every((c) => points.some((p) => Math.abs(p.x - c.x) <= tolerance && Math.abs(p.y - c.y) <= tolerance));
}

/** The 8 handles around a room's bounding box (corners + edge midpoints). */
export function roomBoxHandlePoints(points: Point2D[]): Array<{ id: HandleId; point: Point2D }> {
  const { minX, maxX, minY, maxY } = bounds(points);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return HANDLE_IDS.map((id) => {
    const { sx, sy } = HANDLE_DIRS[id];
    return { id, point: { x: sx < 0 ? minX : sx > 0 ? maxX : cx, y: sy < 0 ? minY : sy > 0 ? maxY : cy } };
  });
}

/**
 * Scales a room's outline so its bounding box follows the dragged handle while the
 * opposite side stays fixed. Exact for rectangles, proportional for other shapes.
 */
export function resizeRoomBox(
  init: Point2D[],
  handle: HandleId,
  mouse: Point2D,
  opts: { minSize?: number } = {}
): Point2D[] {
  const { minSize = MIN_ROOM_SIZE } = opts;
  const { sx, sy } = HANDLE_DIRS[handle];
  const b = bounds(init);

  let { minX, maxX, minY, maxY } = b;
  if (sx < 0) minX = Math.min(mouse.x, b.maxX - minSize);
  if (sx > 0) maxX = Math.max(mouse.x, b.minX + minSize);
  if (sy < 0) minY = Math.min(mouse.y, b.maxY - minSize);
  if (sy > 0) maxY = Math.max(mouse.y, b.minY + minSize);

  const kx = (maxX - minX) / Math.max(1, b.maxX - b.minX);
  const ky = (maxY - minY) / Math.max(1, b.maxY - b.minY);

  return init.map((p) => ({
    x: Math.round(minX + (p.x - b.minX) * kx),
    y: Math.round(minY + (p.y - b.minY) * ky),
  }));
}

/** Moves one vertex of a room outline. */
export function moveRoomVertex(init: Point2D[], index: number, to: Point2D): Point2D[] {
  return init.map((p, i) => (i === index ? { x: Math.round(to.x), y: Math.round(to.y) } : p));
}

// ---------------------------------------------------------------------------
// Openings (doors / windows): positions are distances along their wall
// ---------------------------------------------------------------------------

/** Keeps an opening of `width` fully inside a wall of `wallLen` when its centre moves to `centre`. */
export const moveOpeningAlongWall = clampOpeningCentre;

/**
 * Resizes an opening by dragging one of its ends to `s` (distance along the wall)
 * while the other end stays fixed.
 */
export function resizeOpeningEnd(
  init: { distanceAlongWall: number; width: number },
  end: 'start' | 'end',
  s: number,
  wallLen: number,
  minWidth = MIN_OPENING_WIDTH
): { distanceAlongWall: number; width: number } {
  const start0 = init.distanceAlongWall - init.width / 2;
  const end0 = init.distanceAlongWall + init.width / 2;

  if (end === 'end') {
    if (start0 + minWidth > wallLen) return { ...init };
    const newEnd = clamp(s, start0 + minWidth, wallLen);
    const width = Math.round(newEnd - start0);
    return { width, distanceAlongWall: Math.round(start0 + width / 2) };
  }

  if (end0 - minWidth < 0) return { ...init };
  const newStart = clamp(s, 0, end0 - minWidth);
  const width = Math.round(end0 - newStart);
  return { width, distanceAlongWall: Math.round(end0 - width / 2) };
}
