import { Point2D, Unit, BoundingBox2D, DynamicDimension, FurnitureItem, Wall, Room, Opening } from '../types';
import { newId } from '../utils/id';

/**
 * Convert millimeters to specified display unit
 */
export function convertMmTo(mm: number, unit: Unit): number {
  switch (unit) {
    case 'mm':
      return mm;
    case 'cm':
      return mm / 10;
    case 'm':
      return mm / 1000;
  }
}

/**
 * Convert value in given unit to millimeters
 */
export function convertToMm(val: number, unit: Unit): number {
  switch (unit) {
    case 'mm':
      return val;
    case 'cm':
      return val * 10;
    case 'm':
      return val * 1000;
  }
}

const DEFAULT_PRECISION: Record<Unit, number> = { mm: 0, cm: 1, m: 2 };

/**
 * Formats a millimeter dimension to display string with symbol.
 * `precision` defaults to a sensible value for each unit (mm: 0, cm: 1, m: 2).
 */
export function formatMeasurement(mm: number, unit: Unit, precision: number = DEFAULT_PRECISION[unit]): string {
  const formatted = convertMmTo(mm, unit).toLocaleString('es-ES', {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });

  return `${formatted} ${unit}`;
}

/**
 * Parses user input (can be "4000", "4,5", "4.5 m", etc.) into millimeters
 */
export function parseMeasurement(input: string | number, currentUnit: Unit): number {
  if (typeof input === 'number') {
    return isNaN(input) ? 0 : convertToMm(input, currentUnit);
  }

  const trimmed = input.trim().toLowerCase();
  let valStr = trimmed;
  let detectedUnit: Unit = currentUnit;

  if (trimmed.endsWith('mm')) {
    detectedUnit = 'mm';
    valStr = trimmed.slice(0, -2);
  } else if (trimmed.endsWith('cm')) {
    detectedUnit = 'cm';
    valStr = trimmed.slice(0, -2);
  } else if (trimmed.endsWith('m')) {
    detectedUnit = 'm';
    valStr = trimmed.slice(0, -1);
  }

  // Handle Spanish comma decimal separator
  valStr = valStr.replace(/\s+/g, '').replace(',', '.');
  const parsed = parseFloat(valStr);
  if (isNaN(parsed)) return 0;

  return convertToMm(parsed, detectedUnit);
}

/**
 * Distance between two 2D points in mm
 */
export function distance(p1: Point2D, p2: Point2D): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.hypot(dx, dy);
}

/**
 * Angle in radians from p1 to p2
 */
export function angleRad(p1: Point2D, p2: Point2D): number {
  return Math.atan2(p2.y - p1.y, p2.x - p1.x);
}

/**
 * Angle in degrees from p1 to p2 (0-360)
 */
export function angleDeg(p1: Point2D, p2: Point2D): number {
  let deg = (angleRad(p1, p2) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
}

/**
 * Snap point to grid
 */
export function snapToGrid(point: Point2D, gridSize: number): Point2D {
  if (gridSize <= 0) return { ...point };
  return {
    x: Math.round(point.x / gridSize) * gridSize,
    y: Math.round(point.y / gridSize) * gridSize,
  };
}

/**
 * Snap angle to orthogonal / 45-degree increments
 */
export function snapAngle(p1: Point2D, p2: Point2D, stepDeg: number = 45): Point2D {
  const len = distance(p1, p2);
  if (len < 1e-4) return { ...p2 };

  const currentAngle = angleDeg(p1, p2);
  const snappedAngleDeg = Math.round(currentAngle / stepDeg) * stepDeg;
  const snappedAngleRad = (snappedAngleDeg * Math.PI) / 180;

  return {
    x: p1.x + len * Math.cos(snappedAngleRad),
    y: p1.y + len * Math.sin(snappedAngleRad),
  };
}

/**
 * Snap point to a list of target points (e.g. wall vertices or corners)
 */
export function snapToTargets(
  point: Point2D,
  targets: Point2D[],
  tolerance: number
): { point: Point2D; snapped: boolean; target?: Point2D } {
  let closestDist = Infinity;
  let closestTarget: Point2D | undefined;

  for (const t of targets) {
    const d = distance(point, t);
    if (d < tolerance && d < closestDist) {
      closestDist = d;
      closestTarget = t;
    }
  }

  if (closestTarget) {
    return { point: { ...closestTarget }, snapped: true, target: closestTarget };
  }

  return { point: { ...point }, snapped: false };
}

/**
 * Area of a polygon using the Shoelace formula (in mm²)
 */
export function calculatePolygonArea(points: Point2D[]): number {
  if (points.length < 3) return 0;
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area) / 2;
}

/**
 * Perimeter of a polygon in mm
 */
export function calculatePolygonPerimeter(points: Point2D[]): number {
  if (points.length < 2) return 0;
  let perimeter = 0;
  for (let i = 0; i < points.length; i++) {
    const next = points[(i + 1) % points.length];
    perimeter += distance(points[i], next);
  }
  return perimeter;
}

/**
 * Area-weighted centroid of a polygon. Unlike the plain vertex average it stays
 * inside L-shaped / concave rooms. Falls back to the vertex average for
 * degenerate (zero-area) polygons.
 */
export function calculatePolygonCentroid(points: Point2D[]): Point2D {
  if (points.length === 0) return { x: 0, y: 0 };

  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const cross = a.x * b.y - b.x * a.y;
    twiceArea += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }

  if (Math.abs(twiceArea) < 1e-6) {
    const n = points.length;
    return {
      x: points.reduce((sum, p) => sum + p.x, 0) / n,
      y: points.reduce((sum, p) => sum + p.y, 0) / n,
    };
  }

  return { x: cx / (3 * twiceArea), y: cy / (3 * twiceArea) };
}

/**
 * Checks if point is inside polygon (ray-casting algorithm)
 */
export function isPointInsidePolygon(point: Point2D, vertices: Point2D[]): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].x, yi = vertices[i].y;
    const xj = vertices[j].x, yj = vertices[j].y;
    const intersect = ((yi > point.y) !== (yj > point.y)) &&
      (point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Bounding box for points
 */
export function getBoundingBox(points: Point2D[]): BoundingBox2D {
  if (points.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Get 4 corner points of a rotated rectangle in world coordinates (mm)
 */
export function getRotatedCorners(
  center: Point2D,
  width: number,
  depth: number,
  rotationDeg: number
): [Point2D, Point2D, Point2D, Point2D] {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const hw = width / 2;
  const hd = depth / 2;

  // Local corners: top-left, top-right, bottom-right, bottom-left
  const localCorners: [number, number][] = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ];

  return localCorners.map(([lx, ly]) => ({
    x: center.x + (lx * cos - ly * sin),
    y: center.y + (lx * sin + ly * cos),
  })) as [Point2D, Point2D, Point2D, Point2D];
}

/**
 * Projects a point onto a line segment [a, b]
 */
export function projectPointOnSegment(
  p: Point2D,
  a: Point2D,
  b: Point2D
): { point: Point2D; t: number; distance: number } {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (l2 < 1e-6) {
    return { point: { ...a }, t: 0, distance: distance(p, a) };
  }

  // t is parameter along segment clamped to [0, 1]
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2));
  const projection: Point2D = {
    x: a.x + t * (b.x - a.x),
    y: a.y + t * (b.y - a.y),
  };

  return { point: projection, t, distance: distance(p, projection) };
}

/**
 * Intersect two 2D segments (p1->p2) and (p3->p4)
 */
export function intersectSegments(
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
  p4: Point2D
): Point2D | null {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-8) return null;

  const u = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const v = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;

  if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
    return {
      x: p1.x + u * (p2.x - p1.x),
      y: p1.y + u * (p2.y - p1.y),
    };
  }

  return null;
}

/**
 * Ray from start in direction (dx, dy) intersecting segment (a, b)
 */
export function rayIntersectSegment(
  origin: Point2D,
  dir: Point2D, // unit direction
  a: Point2D,
  b: Point2D
): { hit: Point2D; distance: number } | null {
  const v1 = { x: origin.x - a.x, y: origin.y - a.y };
  const v2 = { x: b.x - a.x, y: b.y - a.y };
  const v3 = { x: -dir.y, y: dir.x };

  const dot = v2.x * v3.x + v2.y * v3.y;
  if (Math.abs(dot) < 1e-8) return null;

  const t1 = (v2.x * v1.y - v2.y * v1.x) / dot;
  const t2 = (v1.x * v3.x + v1.y * v3.y) / dot;

  if (t1 >= 0 && t2 >= 0 && t2 <= 1) {
    return {
      hit: { x: origin.x + dir.x * t1, y: origin.y + dir.y * t1 },
      distance: t1,
    };
  }

  return null;
}

/**
 * Calculates dynamic orthogonal dimensions from a moving/selected furniture to surrounding walls and furniture
 */
export function calculateDynamicDimensions(
  item: FurnitureItem,
  walls: Wall[],
  otherFurniture: FurnitureItem[],
  unit: Unit
): DynamicDimension[] {
  const dims: DynamicDimension[] = [];
  const corners = getRotatedCorners({ x: item.x, y: item.y }, item.width, item.depth, item.rotation);
  const bbox = getBoundingBox(corners);

  // 4 Cardinal directions: Left (-X), Right (+X), Top (-Y), Bottom (+Y)
  const directions: Array<{
    axis: 'x' | 'y';
    dirName: 'left' | 'right' | 'top' | 'bottom';
    origin: Point2D;
    rayDir: Point2D;
  }> = [
    {
      axis: 'x',
      dirName: 'left',
      origin: { x: bbox.minX, y: item.y },
      rayDir: { x: -1, y: 0 },
    },
    {
      axis: 'x',
      dirName: 'right',
      origin: { x: bbox.maxX, y: item.y },
      rayDir: { x: 1, y: 0 },
    },
    {
      axis: 'y',
      dirName: 'top',
      origin: { x: item.x, y: bbox.minY },
      rayDir: { x: 0, y: -1 },
    },
    {
      axis: 'y',
      dirName: 'bottom',
      origin: { x: item.x, y: bbox.maxY },
      rayDir: { x: 0, y: 1 },
    },
  ];

  for (const d of directions) {
    let closestDist = Infinity;
    let closestHit: Point2D | null = null;
    let targetWallId: string | undefined;

    // Check against walls
    for (const wall of walls) {
      const hit = rayIntersectSegment(d.origin, d.rayDir, wall.start, wall.end);
      if (hit && hit.distance > 1 && hit.distance < closestDist && hit.distance < 10000) {
        closestDist = hit.distance;
        closestHit = hit.hit;
        targetWallId = wall.id;
      }
    }

    // Check against other furniture items
    for (const other of otherFurniture) {
      if (other.id === item.id) continue;
      const otherCorners = getRotatedCorners({ x: other.x, y: other.y }, other.width, other.depth, other.rotation);
      for (let i = 0; i < 4; i++) {
        const segA = otherCorners[i];
        const segB = otherCorners[(i + 1) % 4];
        const hit = rayIntersectSegment(d.origin, d.rayDir, segA, segB);
        if (hit && hit.distance > 1 && hit.distance < closestDist && hit.distance < 10000) {
          closestDist = hit.distance;
          closestHit = hit.hit;
          targetWallId = undefined; // hit furniture instead
        }
      }
    }

    if (closestHit && closestDist > 5) {
      dims.push({
        id: `dim-${item.id}-${d.dirName}`,
        start: d.origin,
        end: closestHit,
        distance: closestDist,
        type: targetWallId ? 'wall_to_furniture' : 'furniture_to_furniture',
        label: formatMeasurement(closestDist, unit),
        orientation: d.axis === 'x' ? 'horizontal' : 'vertical',
        targetFurnitureId: item.id,
        targetWallId,
        axis: d.axis,
        direction: d.dirName,
      });
    }
  }

  return dims;
}

/** A rectangular room (default finish) with its four enclosing walls. */
export function buildRectRoom(minX: number, minY: number, maxX: number, maxY: number, name: string) {
  const corners: Point2D[] = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
  const walls: Wall[] = corners.map((start, i) => ({
    id: newId('wall'),
    start,
    end: corners[(i + 1) % 4],
    thickness: 150,
    height: 2600,
  }));
  const room: Room = {
    id: newId('room'),
    name,
    points: corners,
    floorColor: '#d4a373',
    floorMaterial: 'parquet_herringbone',
    height: 2600,
  };
  return { room, walls };
}

/** Keeps an opening of `width` fully inside a wall of `wallLen` when its centre is `centre` mm along it. */
export function clampOpeningCentre(wallLen: number, width: number, centre: number): number {
  if (wallLen <= width) return Math.round(wallLen / 2);
  return Math.round(Math.min(wallLen - width / 2, Math.max(width / 2, centre)));
}

/** Pulls every opening back inside its wall (e.g. after the wall was shortened). Returns the same array if nothing moved. */
export function clampOpeningsToWalls(walls: Wall[], openings: Opening[]): Opening[] {
  const lengths = new Map(walls.map((w) => [w.id, distance(w.start, w.end)]));
  let changed = false;
  const next = openings.map((o) => {
    const len = lengths.get(o.wallId);
    if (len === undefined) return o;
    const centre = clampOpeningCentre(len, o.width, o.distanceAlongWall);
    if (centre === Math.round(o.distanceAlongWall)) return o;
    changed = true;
    return { ...o, distanceAlongWall: centre };
  });
  return changed ? next : openings;
}
