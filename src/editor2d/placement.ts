import { Opening, OpeningType, Point2D, Wall } from '../types';
import { clampOpeningCentre, distance, projectPointOnSegment } from '../geometry';
import { OPENING_CATALOG } from '../catalog';

/** Walls farther than this (mm) from the cursor are ignored when placing an opening. */
const MAX_WALL_REACH = 3000;
/** Keep openings this far (mm) from the wall corners. */
const CORNER_MARGIN = 50;

export interface OpeningPlacement {
  wall: Wall;
  /** Opening ready to add (without id). */
  opening: Omit<Opening, 'id'>;
  /** Cursor projected onto the wall. */
  anchor: Point2D;
}

/** Where would an opening of `type` go if placed with the cursor at `at`? Uses the catalog's real size. */
export function planOpeningPlacement(walls: Wall[], type: OpeningType, at: Point2D): OpeningPlacement | null {
  const def = OPENING_CATALOG.find((o) => o.type === type);
  if (!def) return null;

  let best: { wall: Wall; t: number; point: Point2D; distance: number } | null = null;
  for (const wall of walls) {
    const proj = projectPointOnSegment(at, wall.start, wall.end);
    if (proj.distance < (best?.distance ?? MAX_WALL_REACH)) best = { wall, t: proj.t, point: proj.point, distance: proj.distance };
  }
  if (!best) return null;

  const len = distance(best.wall.start, best.wall.end);
  const centre =
    clampOpeningCentre(len - 2 * CORNER_MARGIN, def.width, best.t * len - CORNER_MARGIN) + CORNER_MARGIN;

  return {
    wall: best.wall,
    anchor: best.point,
    opening: {
      wallId: best.wall.id,
      type,
      distanceAlongWall: Math.round(centre),
      width: def.width,
      height: def.height,
      elevation: def.elevation,
      flipSide: false,
      flipDirection: false,
    },
  };
}
