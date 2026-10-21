import { describe, it, expect, beforeEach } from 'vitest';
import {
  createEmptyProject,
  createSampleProject,
  deleteProject,
  exportProjectToJSON,
  getLastActiveProjectId,
  importProjectFromJSON,
  loadProject,
  normalizeProject,
  saveProject,
  setLastActiveProjectId,
} from '../storage';

// IndexedDB does not exist in Node, so every call exercises the localStorage fallback.
const mem = new Map<string, string>();
beforeEach(() => {
  mem.clear();
  (globalThis as any).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() { return mem.size; },
  };
});

describe('normalizeProject', () => {
  it('fills missing collections of old/hand-made files so the editor cannot crash', () => {
    const p = normalizeProject({ walls: [], furniture: [] });
    expect(p.openings).toEqual([]);
    expect(p.rooms).toEqual([]);
    expect(p.manualDimensions).toEqual([]);
    expect(p.layers).toEqual({ walls: true, furniture: true, dimensions: true, rooms: true });
    expect(['mm', 'cm', 'm']).toContain(p.unit);
  });

  it('drops malformed entries and rejects non-projects', () => {
    const p = normalizeProject({ walls: [{ start: { x: 0, y: 0 } }, { id: 'ok', start: { x: 0, y: 0 }, end: { x: 1, y: 1 } }], furniture: [null, 5] });
    expect(p.walls.map((w) => w.id)).toEqual(['ok']);
    expect(p.furniture).toEqual([]);
    expect(() => normalizeProject({ foo: 1 })).toThrow();
    expect(() => normalizeProject(null)).toThrow();
  });
});

describe('persistence', () => {
  it('saveProject does not change which project is "last active"', async () => {
    setLastActiveProjectId('current');
    await saveProject(createEmptyProject('Copia'));
    expect(getLastActiveProjectId()).toBe('current');
  });

  it('deleteProject also clears the last-active pointer (no resurrection)', async () => {
    const saved = await saveProject(createSampleProject());
    setLastActiveProjectId(saved.id);
    await deleteProject(saved.id);
    expect(await loadProject(saved.id)).toBeNull();
    expect(getLastActiveProjectId()).toBeNull();
  });

  it('saveProject returns the copy with a refreshed updatedAt and round-trips', async () => {
    const p = createEmptyProject('X');
    p.updatedAt = 1;
    const saved = await saveProject(p);
    expect(saved.updatedAt).toBeGreaterThan(1);
    expect((await loadProject(p.id))?.name).toBe('X');
  });
});

describe('import / export', () => {
  it('round-trips with a fresh id and a single "(Importado)" suffix', () => {
    const original = createSampleProject();
    const once = importProjectFromJSON(exportProjectToJSON(original));
    const twice = importProjectFromJSON(exportProjectToJSON(once));
    expect(once.id).not.toBe(original.id);
    expect(once.name).toBe(`${original.name} (Importado)`);
    expect(twice.name).toBe(once.name);
    expect(once.walls).toEqual(original.walls);
  });

  it('gives readable errors for broken files', () => {
    expect(() => importProjectFromJSON('{not json')).toThrow(/JSON válido/);
    expect(() => importProjectFromJSON('{"a":1}')).toThrow(/proyecto válido/);
  });
});
