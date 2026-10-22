import { Point2D, Project } from '../types';
import { getRotatedCorners } from '../geometry';

/** On-screen distance (px) at which a dragged object is pulled to another object / wall face. */
export const OBJECT_SNAP_PX = 8;

/**
 * Grid step for cursor snapping that refines as you zoom in: the base grid at normal zoom,
 * finer steps (1/2, 1/5, 1/10 ...) once a cell would look larger than `maxPx` on screen.
 * That way you can place things very close together by zooming in, instead of being
 * stuck with coarse jumps.
 */
export function adaptiveGridStep(gridSize: number, zoom: number, maxPx = 40): number {
  for (const divisor of [1, 2, 5, 10, 20, 50, 100]) {
    const step = gridSize / divisor;
    if (step < 1) break;
    if (step * zoom <= maxPx) return Math.round(step * 100) / 100;
  }
  return 1;
}

export interface Rect {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Axis-aligned bounds of a (possibly rotated) piece. */
export function rectOfBox(box: { x: number; y: number; width: number; depth: number; rotation: number }): Rect {
  const c = getRotatedCorners({ x: box.x, y: box.y }, box.width, box.depth, box.rotation);
  const xs = c.map((p: Point2D) => p.x);
  const ys = c.map((p: Point2D) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

/** A line objects can snap to. `from`/`to` is its extent along the other axis. */
export interface SnapLine {
  axis: 'x' | 'y'; // 'x' = vertical line at x = value
  value: number;
  kind: 'edge' | 'center' | 'face';
  from: number;
  to: number;
  /** The dragged piece must come within this distance of [from, to] for the line to apply. */
  margin: number;
}

export interface SnapGuide {
  axis: 'x' | 'y';
  value: number;
  from: number;
  to: number;
}

const FURNITURE_ALIGN_MARGIN = 1500; // mm: align with pieces up to this far along the other axis
const AXIS_EPSILON = 1;

/** Lines of every other piece (edges + centres) and of axis-aligned wall faces. */
export function collectSnapLines(project: Project, exclude: ReadonlySet<string>): SnapLine[] {
  const lines: SnapLine[] = [];

  if (project.layers.furniture) {
    for (const f of project.furniture) {
      if (exclude.has(f.id)) continue;
      const r = rectOfBox(f);
      const cx = (r.minX + r.maxX) / 2;
      const cy = (r.minY + r.maxY) / 2;
      const m = FURNITURE_ALIGN_MARGIN;
      lines.push(
        { axis: 'x', value: r.minX, kind: 'edge', from: r.minY, to: r.maxY, margin: m },
        { axis: 'x', value: r.maxX, kind: 'edge', from: r.minY, to: r.maxY, margin: m },
        { axis: 'x', value: cx, kind: 'center', from: r.minY, to: r.maxY, margin: m },
        { axis: 'y', value: r.minY, kind: 'edge', from: r.minX, to: r.maxX, margin: m },
        { axis: 'y', value: r.maxY, kind: 'edge', from: r.minX, to: r.maxX, margin: m },
        { axis: 'y', value: cy, kind: 'center', from: r.minX, to: r.maxX, margin: m }
      );
    }
  }

  if (project.layers.walls) {
    for (const w of project.walls) {
      const half = w.thickness / 2;
      if (Math.abs(w.start.x - w.end.x) < AXIS_EPSILON) {
        const from = Math.min(w.start.y, w.end.y);
        const to = Math.max(w.start.y, w.end.y);
        lines.push(
          { axis: 'x', value: w.start.x - half, kind: 'face', from, to, margin: 0 },
          { axis: 'x', value: w.start.x + half, kind: 'face', from, to, margin: 0 }
        );
      } else if (Math.abs(w.start.y - w.end.y) < AXIS_EPSILON) {
        const from = Math.min(w.start.x, w.end.x);
        const to = Math.max(w.start.x, w.end.x);
        lines.push(
          { axis: 'y', value: w.start.y - half, kind: 'face', from, to, margin: 0 },
          { axis: 'y', value: w.start.y + half, kind: 'face', from, to, margin: 0 }
        );
      }
    }
  }
  return lines;
}

interface AxisMatch {
  delta: number;
  line: SnapLine;
}

function bestMatch(
  axis: 'x' | 'y',
  lo: number,
  hi: number,
  otherLo: number,
  otherHi: number,
  lines: SnapLine[],
  tolerance: number
): AxisMatch | null {
  const mid = (lo + hi) / 2;
  let best: AxisMatch | null = null;
  for (const line of lines) {
    if (line.axis !== axis) continue;
    // The dragged piece has to be next to the line's extent, not on the other side of the plan.
    const reach = line.margin + tolerance;
    if (otherHi < line.from - reach || otherLo > line.to + reach) continue;

    const probes = line.kind === 'center' ? [mid] : [lo, hi];
    for (const p of probes) {
      const delta = line.value - p;
      if (Math.abs(delta) <= tolerance && (!best || Math.abs(delta) < Math.abs(best.delta))) {
        best = { delta, line };
      }
    }
  }
  return best;
}

/**
 * Magnetism for a dragged rectangle: returns the shift (mm) that makes its edges (or centre)
 * flush with the closest line within `tolerance`, plus the guides to draw. Each axis snaps independently.
 */
export function snapRect(
  rect: Rect,
  lines: SnapLine[],
  tolerance: number
): { dx: number; dy: number; guides: SnapGuide[] } {
  const mx = bestMatch('x', rect.minX, rect.maxX, rect.minY, rect.maxY, lines, tolerance);
  const my = bestMatch('y', rect.minY, rect.maxY, rect.minX, rect.maxX, lines, tolerance);
  const dx = mx?.delta ?? 0;
  const dy = my?.delta ?? 0;

  const guides: SnapGuide[] = [];
  if (mx) {
    guides.push({
      axis: 'x',
      value: mx.line.value,
      from: Math.min(mx.line.from, rect.minY + dy),
      to: Math.max(mx.line.to, rect.maxY + dy),
    });
  }
  if (my) {
    guides.push({
      axis: 'y',
      value: my.line.value,
      from: Math.min(my.line.from, rect.minX + dx),
      to: Math.max(my.line.to, rect.maxX + dx),
    });
  }
  return { dx, dy, guides };
}
