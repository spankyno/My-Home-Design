import { Point2D, Project } from '../types';
import { calculatePolygonArea, distance, isPointInsidePolygon, projectPointOnSegment } from '../geometry';

export type HitType = 'furniture' | 'opening' | 'wall' | 'room';
export interface Hit {
  type: HitType;
  id: string;
}

/** Click tolerances in on-screen pixels (converted to mm with the zoom), so small things stay easy to grab. */
const TOLERANCE_PX = { furniture: 3, opening: 6, wall: 6 };

/**
 * What is under `world`? Pure and layer-aware:
 *  - hidden layers are never hit (they used to be selectable while invisible);
 *  - priority is furniture > openings > walls > rooms;
 *  - inside each class the already-selected object wins (so grabbing a piece that is partly
 *    covered by another doesn't switch selection), then the topmost / closest / smallest one;
 *  - an opening is its own rectangle on the wall, not a disc that spills into the room.
 */
export function hitTest(
  project: Project,
  world: Point2D,
  opts: { zoom: number; selectedIds?: readonly string[] }
): Hit | null {
  const { zoom, selectedIds = [] } = opts;
  const isSelected = (id: string) => selectedIds.includes(id);
  /** Picks the selected candidate if any, otherwise the first (candidates are pre-sorted by preference). */
  const choose = (ids: string[]): string | null => ids.find(isSelected) ?? ids[0] ?? null;

  // --- Furniture (array order = paint order, so the last one is on top)
  if (project.layers.furniture) {
    const tol = TOLERANCE_PX.furniture / zoom;
    const hits: string[] = [];
    for (let i = project.furniture.length - 1; i >= 0; i--) {
      const f = project.furniture[i];
      const r = (-f.rotation * Math.PI) / 180;
      const dx = world.x - f.x;
      const dy = world.y - f.y;
      const lx = dx * Math.cos(r) - dy * Math.sin(r);
      const ly = dx * Math.sin(r) + dy * Math.cos(r);
      if (Math.abs(lx) <= f.width / 2 + tol && Math.abs(ly) <= f.depth / 2 + tol) hits.push(f.id);
    }
    const id = choose(hits);
    if (id) return { type: 'furniture', id };
  }

  if (project.layers.walls) {
    // --- Openings: rectangle along the wall (width x wall thickness)
    const openingTol = TOLERANCE_PX.opening / zoom;
    const openingHits: Array<{ id: string; perp: number }> = [];
    for (const op of project.openings) {
      const wall = project.walls.find((w) => w.id === op.wallId);
      if (!wall) continue;
      const len = distance(wall.start, wall.end);
      if (len < 1) continue;
      const ux = (wall.end.x - wall.start.x) / len;
      const uy = (wall.end.y - wall.start.y) / len;
      const px = world.x - wall.start.x;
      const py = world.y - wall.start.y;
      const along = px * ux + py * uy;
      const perp = Math.abs(px * uy - py * ux);
      if (Math.abs(along - op.distanceAlongWall) <= op.width / 2 + openingTol && perp <= wall.thickness / 2 + openingTol) {
        openingHits.push({ id: op.id, perp });
      }
    }
    openingHits.sort((a, b) => a.perp - b.perp);
    const openingId = choose(openingHits.map((h) => h.id));
    if (openingId) return { type: 'opening', id: openingId };

    // --- Walls: closest centre line within half the thickness (+ tolerance)
    const wallTol = TOLERANCE_PX.wall / zoom;
    const wallHits = project.walls
      .map((w) => ({ id: w.id, d: projectPointOnSegment(world, w.start, w.end).distance, reach: w.thickness / 2 + wallTol }))
      .filter((h) => h.d <= h.reach)
      .sort((a, b) => a.d - b.d);
    const wallId = choose(wallHits.map((h) => h.id));
    if (wallId) return { type: 'wall', id: wallId };
  }

  // --- Rooms: smallest outline that contains the point
  if (project.layers.rooms) {
    const roomHits = project.rooms
      .filter((r) => r.points.length >= 3 && isPointInsidePolygon(world, r.points))
      .map((r) => ({ id: r.id, area: Math.abs(calculatePolygonArea(r.points)) }))
      .sort((a, b) => a.area - b.area);
    const roomId = choose(roomHits.map((h) => h.id));
    if (roomId) return { type: 'room', id: roomId };
  }

  return null;
}
