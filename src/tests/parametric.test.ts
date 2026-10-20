import { describe, it, expect } from 'vitest';
import {
  createDefaultCabinetConfig,
  validateCabinetConfig,
  distributeShelvesUniformly,
  distributeDrawersUniformly,
  calculateCutList,
} from '../parametric';

describe('Parametric Furniture Engine', () => {
  it('creates valid default configs for closet and dresser', () => {
    const closet = createDefaultCabinetConfig('closet');
    expect(closet.exteriorWidth).toBe(1800);
    expect(closet.exteriorHeight).toBe(2200);
    const issues = validateCabinetConfig(closet);
    const errors = issues.filter(i => i.type === 'error');
    expect(errors.length).toBe(0);
  });

  it('detects out-of-bounds shelves and drawers', () => {
    const closet = createDefaultCabinetConfig('closet');
    // Add shelf higher than interior
    closet.shelves.push({
      id: 'sh-invalid',
      heightFromBase: 3500, // exceeds cabinet height
      thickness: 19,
      fullDepth: true,
    });
    const issues = validateCabinetConfig(closet);
    expect(issues.some(i => i.message.includes('fuera del vano'))).toBe(true);
  });

  it('distributes shelves uniformly with exact heights', () => {
    const shelfUnit = createDefaultCabinetConfig('shelf');
    // Height: 2000, plinth: 60, board: 19*2 = 38 -> interior = 2000 - 60 - 38 = 1902 mm
    const shelves = distributeShelvesUniformly(shelfUnit, 3);
    expect(shelves.length).toBe(3);
    expect(shelves[0].heightFromBase).toBeGreaterThan(400);
    expect(shelves[1].heightFromBase).toBeGreaterThan(shelves[0].heightFromBase);
    expect(shelves[2].heightFromBase).toBeGreaterThan(shelves[1].heightFromBase);
  });

  it('calculates complete cut list with all structural boards', () => {
    const closet = createDefaultCabinetConfig('closet');
    const cutList = calculateCutList(closet);
    expect(cutList.length).toBeGreaterThan(4);
    const sides = cutList.find(c => c.name.includes('Laterales'));
    expect(sides).toBeDefined();
    expect(sides?.count).toBe(2);
    expect(sides?.height).toBe(closet.exteriorHeight - closet.plinthHeight);
  });
});

describe('Parametric: drawers & cut list', () => {
  it('distributes drawers inside the interior, without overlap and with unique ids', () => {
    const dresser = createDefaultCabinetConfig('dresser');
    const drawers = distributeDrawersUniformly(dresser, 4);
    expect(drawers).toHaveLength(4);
    expect(new Set(drawers.map((d) => d.id)).size).toBe(4);

    const sorted = [...drawers].sort((a, b) => a.positionFromBase - b.positionFromBase);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].positionFromBase).toBeGreaterThanOrEqual(sorted[i - 1].positionFromBase + sorted[i - 1].frontHeight);
    }
    dresser.drawers = drawers;
    expect(validateCabinetConfig(dresser).filter((i) => i.type === 'error')).toHaveLength(0);
  });

  it('cut list groups drawer fronts by their real height', () => {
    const dresser = createDefaultCabinetConfig('dresser');
    dresser.drawers = [
      { id: 'a', positionFromBase: 0, frontHeight: 150 },
      { id: 'b', positionFromBase: 160, frontHeight: 150 },
      { id: 'c', positionFromBase: 320, frontHeight: 250 },
    ] as typeof dresser.drawers;

    const fronts = calculateCutList(dresser).filter((c) => c.name === 'Frentes de cajón');
    expect(fronts.map((f) => [f.height, f.count]).sort()).toEqual([[150, 2], [250, 1]]);
  });

  it('warns about drawer fronts below the advised minimum', () => {
    const dresser = createDefaultCabinetConfig('dresser');
    dresser.drawers = [{ id: 'a', positionFromBase: 0, frontHeight: 60 }] as typeof dresser.drawers;
    expect(validateCabinetConfig(dresser).some((i) => i.type === 'warning')).toBe(true);
  });
});
