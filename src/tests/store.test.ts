import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../storage')>();
  return { ...actual, saveProject: vi.fn(async () => {}) };
});

import { useEditorStore } from '../state/useEditorStore';
import { createSampleProject } from '../storage';
import { calculateDynamicDimensions } from '../geometry';
import type { FurnitureItem } from '../types';

const furniture = (id: string): FurnitureItem => ({
  id, name: id, category: 'generico', x: 0, y: 0, z: 0, width: 400, depth: 400,
  height: 400, rotation: 0, color: '#fff', material: 'x', isLocked: false, lockProportions: true,
});

beforeEach(() => {
  useEditorStore.getState().setProject(createSampleProject());
});

describe('historial deshacer / rehacer', () => {
  it('undo revierte exactamente UNA operación', () => {
    const s = () => useEditorStore.getState();
    const base = s().project.furniture.length;
    s().addFurniture(furniture('a'));
    s().addFurniture(furniture('b'));
    expect(s().project.furniture.length).toBe(base + 2);

    s().undo();
    expect(s().project.furniture.map((f) => f.id)).not.toContain('b');
    expect(s().project.furniture.map((f) => f.id)).toContain('a');
  });

  it('redo restaura el estado posterior a la operación', () => {
    const s = () => useEditorStore.getState();
    const base = s().project.furniture.length;
    s().addFurniture(furniture('a'));
    s().undo();
    expect(s().project.furniture.length).toBe(base);
    s().redo();
    expect(s().project.furniture.map((f) => f.id)).toContain('a');
  });

  it('una operación nueva tras undo descarta el redo', () => {
    const s = () => useEditorStore.getState();
    s().addFurniture(furniture('a'));
    s().undo();
    s().addFurniture(furniture('b'));
    s().redo();
    expect(s().project.furniture.map((f) => f.id)).toEqual(
      expect.not.arrayContaining(['a'])
    );
  });
});

describe('cota dinámica exacta', () => {
  it.each(['left', 'right', 'top', 'bottom'] as const)(
    'tras aplicar una distancia, la cota "%s" mide lo pedido',
    (direction) => {
      const s = () => useEditorStore.getState();
      const proj = s().project;
      const item = proj.furniture.find((f) => f.id === 'f-sofa')!;
      const before = calculateDynamicDimensions(item, proj.walls, proj.furniture, 'mm')
        .find((d) => d.direction === direction)!;
      expect(before).toBeDefined();

      const target = before.distance + 100;
      s().applyExactDimensionDistance(before, target);

      const p2 = s().project;
      const moved = p2.furniture.find((f) => f.id === 'f-sofa')!;
      const after = calculateDynamicDimensions(moved, p2.walls, p2.furniture, 'mm')
        .find((d) => d.direction === direction);
      expect(after?.distance).toBeCloseTo(target, 0);
    }
  );
});

describe('historial: casos adicionales', () => {
  const s = () => useEditorStore.getState();

  it('un arrastre (varias ediciones + un commit) es un único paso de deshacer', () => {
    const before = s().project.furniture.find((f) => f.id === 'f-sofa')!.x;
    for (let i = 1; i <= 10; i++) s().updateFurniture('f-sofa', { x: before + i * 10 });
    s().pushHistorySnapshot();
    s().undo();
    expect(s().project.furniture.find((f) => f.id === 'f-sofa')!.x).toBe(before);
    expect(s().historyIndex).toBe(0);
  });

  it('un clic sin cambios no crea pasos de historial', () => {
    s().pushHistorySnapshot();
    expect(s().history).toHaveLength(1);
  });

  it('deshacer descarta primero las ediciones sin confirmar (inspector)', () => {
    s().addFurniture(furniture('a'));
    const w = s().project.furniture.find((f) => f.id === 'a')!.width;
    s().updateFurniture('a', { width: w + 500 }); // sin commit
    expect(s().uncommitted).toBe(true);
    s().undo();
    expect(s().project.furniture.find((f) => f.id === 'a')!.width).toBe(w); // 'a' sigue existiendo
  });

  it('cambiar la unidad no se revierte al deshacer otra operación', () => {
    s().addFurniture(furniture('a'));
    s().setUnit('cm');
    s().undo();
    expect(s().project.unit).toBe('cm');
    expect(s().project.furniture.map((f) => f.id)).not.toContain('a');
  });

  it('eliminar una habitación borra sus paredes exclusivas y se deshace de una vez', () => {
    const p0 = s().project;
    const room = p0.rooms[0];
    s().deleteRoom(room.id);
    expect(s().project.rooms.find((r) => r.id === room.id)).toBeUndefined();
    expect(s().project.walls.length).toBeLessThan(p0.walls.length);
    s().undo();
    expect(s().project.walls.length).toBe(p0.walls.length);
    expect(s().project.rooms.length).toBe(p0.rooms.length);
  });

  it('duplicar genera ids únicos incluso en el mismo milisegundo', () => {
    s().setSelectedIds(['f-sofa']);
    s().duplicateSelected();
    s().duplicateSelected();
    const ids = s().project.furniture.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('edición directa: store', () => {
  const s = () => useEditorStore.getState();

  it('setRoomPoints redimensiona la habitación y los muros siguen a sus vértices', () => {
    const room = s().project.rooms[0];
    const pts = room.points;
    const maxX = Math.max(...pts.map((p) => p.x));
    const grown = pts.map((p) => (p.x === maxX ? { ...p, x: p.x + 1000 } : p));
    const wallsOnEdge = s().project.walls.filter(
      (w) => w.start.x === maxX && w.end.x === maxX
    );
    expect(wallsOnEdge.length).toBeGreaterThan(0);

    s().setRoomPoints(room.id, grown);
    const moved = s().project.walls.filter((w) => wallsOnEdge.some((o) => o.id === w.id));
    moved.forEach((w) => {
      expect(w.start.x).toBe(maxX + 1000);
      expect(w.end.x).toBe(maxX + 1000);
    });
    s().pushHistorySnapshot();
    s().undo();
    expect(s().project.rooms[0].points).toEqual(pts);
  });

  it('cambiar el tamaño de un mueble paramétrico sincroniza su config', () => {
    const cfg = {
      type: 'closet', exteriorWidth: 1800, exteriorHeight: 2200, exteriorDepth: 600, boardThickness: 19,
      plinthHeight: 70, hasBack: true, backThickness: 4, finishColor: '#fff', finishMaterial: 'x',
      shelves: [], drawers: [], dividers: [], doors: [],
    } as unknown as FurnitureItem['parametricConfig'];
    s().addFurniture({ ...furniture('closet'), width: 1800, depth: 600, height: 2200, isParametric: true, parametricConfig: cfg });
    s().updateFurniture('closet', { width: 2400, depth: 650 });
    const f = s().project.furniture.find((x) => x.id === 'closet')!;
    expect(f.parametricConfig!.exteriorWidth).toBe(2400);
    expect(f.parametricConfig!.exteriorDepth).toBe(650);
    expect(f.parametricConfig!.exteriorHeight).toBe(2200);
  });
});

describe('edición directa: aberturas', () => {
  const s = () => useEditorStore.getState();

  it('acortar un muro recoloca sus puertas dentro de él', () => {
    const op = s().project.openings[0];
    const wall = s().project.walls.find((w) => w.id === op.wallId)!;
    const newEnd = { x: wall.start.x + (wall.end.x - wall.start.x) * 0.5, y: wall.start.y + (wall.end.y - wall.start.y) * 0.5 };
    s().updateWall(wall.id, { end: newEnd });
    const len = Math.hypot(newEnd.x - wall.start.x, newEnd.y - wall.start.y);
    const moved = s().project.openings.find((o) => o.id === op.id)!;
    expect(moved.distanceAlongWall + moved.width / 2).toBeLessThanOrEqual(len + 1);
  });
});
