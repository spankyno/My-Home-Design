import { describe, it, expect } from 'vitest';
import {
  convertMmTo,
  convertToMm,
  formatMeasurement,
  parseMeasurement,
  calculatePolygonArea,
  calculatePolygonPerimeter,
  snapToGrid,
  intersectSegments,
  projectPointOnSegment,
  getRotatedCorners,
} from '../geometry';

describe('Geometric Engine & Unit Conversions', () => {
  it('converts units correctly between mm, cm, and m', () => {
    expect(convertMmTo(4000, 'm')).toBe(4);
    expect(convertMmTo(3000, 'cm')).toBe(300);
    expect(convertMmTo(2200, 'mm')).toBe(2200);

    expect(convertToMm(4, 'm')).toBe(4000);
    expect(convertToMm(220, 'cm')).toBe(2200);
    expect(convertToMm(150, 'mm')).toBe(150);
  });

  it('formats measurements according to locale and unit', () => {
    expect(formatMeasurement(4000, 'm')).toBe('4,00 m');
    expect(formatMeasurement(2200, 'cm')).toBe('220,0 cm');
    expect(formatMeasurement(150, 'mm')).toBe('150 mm');
  });

  it('parses user input strings including units and Spanish comma separators', () => {
    expect(parseMeasurement('4000', 'mm')).toBe(4000);
    expect(parseMeasurement('4 m', 'mm')).toBe(4000);
    expect(parseMeasurement('4,5 m', 'mm')).toBe(4500);
    expect(parseMeasurement('220 cm', 'm')).toBe(2200);
    expect(parseMeasurement(3000, 'mm')).toBe(3000);
  });

  it('calculates exact area and perimeter for a 4000 x 3000 mm room', () => {
    // 4000mm x 3000mm rectangle
    const roomPoints = [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 3000 },
      { x: 0, y: 3000 },
    ];

    const areaMm2 = calculatePolygonArea(roomPoints);
    const areaM2 = areaMm2 / 1_000_000;
    expect(areaM2).toBe(12); // Exactly 12 m²!

    const perimeterMm = calculatePolygonPerimeter(roomPoints);
    const perimeterM = perimeterMm / 1_000;
    expect(perimeterM).toBe(14); // Exactly 14 m!
  });

  it('snaps coordinates to grid accurately', () => {
    expect(snapToGrid({ x: 104, y: 198 }, 100)).toEqual({ x: 100, y: 200 });
    expect(snapToGrid({ x: 47, y: 53 }, 50)).toEqual({ x: 50, y: 50 });
  });

  it('calculates point-to-segment projection and distances', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 1000, y: 0 };
    const p = { x: 500, y: 250 };

    const proj = projectPointOnSegment(p, a, b);
    expect(proj.point.x).toBe(500);
    expect(proj.point.y).toBe(0);
    expect(proj.distance).toBe(250);
  });

  it('finds segment intersections', () => {
    const p1 = { x: 0, y: 100 };
    const p2 = { x: 200, y: 100 };
    const p3 = { x: 100, y: 0 };
    const p4 = { x: 100, y: 200 };

    const hit = intersectSegments(p1, p2, p3, p4);
    expect(hit).not.toBeNull();
    expect(hit?.x).toBe(100);
    expect(hit?.y).toBe(100);
  });

  it('calculates rotated corners of an oriented bounding box', () => {
    const center = { x: 1000, y: 1000 };
    const width = 2000;
    const depth = 1000;

    // 0 degrees rotation
    const corners0 = getRotatedCorners(center, width, depth, 0);
    expect(corners0[0]).toEqual({ x: 0, y: 500 });
    expect(corners0[1]).toEqual({ x: 2000, y: 500 });
    expect(corners0[2]).toEqual({ x: 2000, y: 1500 });
    expect(corners0[3]).toEqual({ x: 0, y: 1500 });

    // 90 degrees rotation: width becomes along Y axis
    const corners90 = getRotatedCorners(center, width, depth, 90);
    expect(Math.round(corners90[0].x)).toBe(1500);
    expect(Math.round(corners90[0].y)).toBe(0);
  });
});

import { calculatePolygonCentroid, buildRectRoom } from '../geometry';

describe('geometry fixes', () => {
  it('centroid of an L-shaped room is area-weighted (and inside the shape)', () => {
    // L: 4000x1000 bar + 1000x3000 leg
    const l = [
      { x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 1000 },
      { x: 1000, y: 1000 }, { x: 1000, y: 4000 }, { x: 0, y: 4000 },
    ];
    const c = calculatePolygonCentroid(l);
    expect(c.x).toBeCloseTo(1357.14, 1);
    expect(c.y).toBeCloseTo(1357.14, 1);
  });

  it('centroid of a rectangle is its centre; degenerate polygons fall back to the mean', () => {
    expect(calculatePolygonCentroid([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 0, y: 2 }])).toEqual({ x: 2, y: 1 });
    expect(calculatePolygonCentroid([{ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 4, y: 4 }])).toEqual({ x: 2, y: 2 });
  });

  it('formatMeasurement honours an explicit precision and has per-unit defaults', () => {
    expect(formatMeasurement(12345, 'mm')).toBe('12.345 mm');
    expect(formatMeasurement(1234, 'm')).toBe('1,23 m');
    expect(formatMeasurement(1234, 'm', 3)).toBe('1,234 m');
  });

  it('buildRectRoom creates a closed loop of 4 walls with unique ids', () => {
    const { room, walls } = buildRectRoom(0, 0, 4000, 3000, 'Sala');
    expect(room.points).toHaveLength(4);
    expect(new Set(walls.map((w) => w.id)).size).toBe(4);
    walls.forEach((w, i) => expect(w.end).toEqual(walls[(i + 1) % 4].start));
  });
});

import { clampOpeningCentre, clampOpeningsToWalls } from '../geometry';

describe('opening clamping', () => {
  it('keeps openings inside their wall, and returns the same array when nothing moves', () => {
    expect(clampOpeningCentre(5000, 900, 4900)).toBe(4550);
    const walls = [{ id: 'w', start: { x: 0, y: 0 }, end: { x: 3000, y: 0 }, thickness: 150, height: 2600 }];
    const ok = [{ id: 'o', wallId: 'w', type: 'door', distanceAlongWall: 1500, width: 900, height: 2100, elevation: 0, flipSide: false, flipDirection: false }] as any;
    expect(clampOpeningsToWalls(walls, ok)).toBe(ok);
    const shortWall = [{ ...walls[0], end: { x: 2000, y: 0 } }];
    ok[0].distanceAlongWall = 2800;
    expect(clampOpeningsToWalls(shortWall, ok)[0].distanceAlongWall).toBe(1550);
  });
});
