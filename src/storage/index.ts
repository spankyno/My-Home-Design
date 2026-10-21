import Dexie, { Table } from 'dexie';
import { Project, ProjectMetadata, Unit } from '../types';
import { newId } from '../utils/id';
import { createDefaultCabinetConfig } from '../parametric';

interface StoredProject {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  data: Project;
}

interface StoredLibraryItem {
  id: string;
  name: string;
  category: string;
  createdAt: number;
  data: unknown;
}

class MyHomeDesignDatabase extends Dexie {
  projects!: Table<StoredProject, string>;
  library!: Table<StoredLibraryItem, string>;

  constructor() {
    super('MyHomeDesignDB');
    this.version(1).stores({
      projects: 'id, name, createdAt, updatedAt',
      library: 'id, name, category, createdAt',
    });
  }
}

export const db = new MyHomeDesignDatabase();

/**
 * Creates initial high-quality sample project
 */
export function createSampleProject(): Project {
  const now = Date.now();

  // Walls layout for an apartment:
  // Salón (left/bottom): (0, 0) to (5000, 4000)
  // Dormitorio (top-left): (0, 4000) to (4000, 7000) -> 4000 x 3000 mm! Exactly 12 m²!
  // Baño (top-right): (4000, 4000) to (6400, 5800) -> 2400 x 1800 mm!

  const walls = [
    // Salón perimeter
    { id: 'w1', start: { x: 0, y: 0 }, end: { x: 5000, y: 0 }, thickness: 150, height: 2600 },
    { id: 'w2', start: { x: 5000, y: 0 }, end: { x: 5000, y: 4000 }, thickness: 150, height: 2600 },
    { id: 'w3', start: { x: 5000, y: 4000 }, end: { x: 0, y: 4000 }, thickness: 150, height: 2600 }, // Shared wall
    { id: 'w4', start: { x: 0, y: 4000 }, end: { x: 0, y: 0 }, thickness: 150, height: 2600 },

    // Dormitorio perimeter (4000 x 3000 mm)
    { id: 'w5', start: { x: 0, y: 4000 }, end: { x: 0, y: 7000 }, thickness: 150, height: 2600 },
    { id: 'w6', start: { x: 0, y: 7000 }, end: { x: 4000, y: 7000 }, thickness: 150, height: 2600 },
    { id: 'w7', start: { x: 4000, y: 7000 }, end: { x: 4000, y: 4000 }, thickness: 150, height: 2600 }, // Shared with baño/hall

    // Baño perimeter (2400 x 1800 mm)
    { id: 'w8', start: { x: 4000, y: 4000 }, end: { x: 6400, y: 4000 }, thickness: 150, height: 2600 },
    { id: 'w9', start: { x: 6400, y: 4000 }, end: { x: 6400, y: 5800 }, thickness: 150, height: 2600 },
    { id: 'w10', start: { x: 6400, y: 5800 }, end: { x: 4000, y: 5800 }, thickness: 150, height: 2600 },
  ];

  const rooms = [
    {
      id: 'room-salon',
      name: 'Salón - Comedor',
      points: [
        { x: 0, y: 0 },
        { x: 5000, y: 0 },
        { x: 5000, y: 4000 },
        { x: 0, y: 4000 },
      ],
      floorColor: '#e2d9cc',
      floorMaterial: 'parquet' as const,
      height: 2600,
    },
    {
      id: 'room-dormitorio',
      name: 'Dormitorio Principal',
      points: [
        { x: 0, y: 4000 },
        { x: 4000, y: 4000 },
        { x: 4000, y: 7000 },
        { x: 0, y: 7000 },
      ], // 4000 x 3000 mm -> exactly 12 m² and 14 m perimeter
      floorColor: '#d6c8b4',
      floorMaterial: 'parquet' as const,
      height: 2600,
    },
    {
      id: 'room-bano',
      name: 'Baño Principal',
      points: [
        { x: 4000, y: 4000 },
        { x: 6400, y: 4000 },
        { x: 6400, y: 5800 },
        { x: 4000, y: 5800 },
      ],
      floorColor: '#f1f5f9',
      floorMaterial: 'tile' as const,
      height: 2600,
    },
  ];

  const openings = [
    // Entrance / Terrace door in Salón
    {
      id: 'op-1',
      wallId: 'w1',
      type: 'french_window' as const,
      distanceAlongWall: 2000,
      width: 1600,
      height: 2100,
      elevation: 0,
      flipSide: false,
      flipDirection: false,
    },
    // Window in Salón
    {
      id: 'op-2',
      wallId: 'w4',
      type: 'window' as const,
      distanceAlongWall: 1500,
      width: 1200,
      height: 1200,
      elevation: 900,
      flipSide: false,
      flipDirection: false,
    },
    // Bedroom door
    {
      id: 'op-3',
      wallId: 'w3',
      type: 'door' as const,
      distanceAlongWall: 1800,
      width: 800,
      height: 2050,
      elevation: 0,
      flipSide: true,
      flipDirection: false,
    },
    // Bedroom window
    {
      id: 'op-4',
      wallId: 'w6',
      type: 'window' as const,
      distanceAlongWall: 1400,
      width: 1400,
      height: 1200,
      elevation: 900,
      flipSide: false,
      flipDirection: false,
    },
    // Bathroom door
    {
      id: 'op-5',
      wallId: 'w8',
      type: 'door' as const,
      distanceAlongWall: 500,
      width: 750,
      height: 2050,
      elevation: 0,
      flipSide: false,
      flipDirection: true,
    },
  ];

  const furniture = [
    // Salón: Sofá 3 Plazas (2200 x 900 mm)
    {
      id: 'f-sofa',
      catalogId: 'sofa_3p',
      name: 'Sofá 3 Plazas',
      category: 'salon' as const,
      x: 2500,
      y: 1200,
      z: 0,
      width: 2200,
      depth: 900,
      height: 850,
      rotation: 0,
      color: '#475569',
      material: 'fabric_gray',
      isLocked: false,
      lockProportions: true,
    },
    // Salón: Mesa de centro
    {
      id: 'f-coffee-table',
      catalogId: 'coffee_table',
      name: 'Mesa de Centro',
      category: 'salon' as const,
      x: 2500,
      y: 2000,
      z: 0,
      width: 1100,
      depth: 600,
      height: 450,
      rotation: 0,
      color: '#b45309',
      material: 'wood_oak',
      isLocked: false,
      lockProportions: true,
    },
    // Salón: Mueble TV
    {
      id: 'f-tv-unit',
      catalogId: 'tv_unit',
      name: 'Mueble TV',
      category: 'salon' as const,
      x: 2500,
      y: 3750,
      z: 0,
      width: 1800,
      depth: 450,
      height: 520,
      rotation: 180,
      color: '#e2e8f0',
      material: 'wood_white',
      isLocked: false,
      lockProportions: true,
    },
    // Salón: Mesa Comedor
    {
      id: 'f-dining-table',
      catalogId: 'dining_table',
      name: 'Mesa Comedor 6P',
      category: 'comedor' as const,
      x: 4200,
      y: 2000,
      z: 0,
      width: 1400,
      depth: 850,
      height: 750,
      rotation: 90,
      color: '#78350f',
      material: 'wood_oak',
      isLocked: false,
      lockProportions: true,
    },

    // Dormitorio: Cama Matrimonio 150 (1600 x 2000 mm)
    {
      id: 'f-bed',
      catalogId: 'bed_double',
      name: 'Cama Matrimonio 150',
      category: 'dormitorio' as const,
      x: 2000,
      y: 5800,
      z: 0,
      width: 1600,
      depth: 2000,
      height: 1000,
      rotation: 0,
      color: '#cbd5e1',
      material: 'linen_light',
      isLocked: false,
      lockProportions: true,
    },
    // Dormitorio: Mesita Noche Izq
    {
      id: 'f-nightstand-1',
      catalogId: 'nightstand',
      name: 'Mesita de Noche Izq',
      category: 'dormitorio' as const,
      x: 800,
      y: 6600,
      z: 0,
      width: 450,
      depth: 400,
      height: 520,
      rotation: 0,
      color: '#d97706',
      material: 'wood_oak',
      isLocked: false,
      lockProportions: true,
    },
    // Dormitorio: Mesita Noche Der
    {
      id: 'f-nightstand-2',
      catalogId: 'nightstand',
      name: 'Mesita de Noche Der',
      category: 'dormitorio' as const,
      x: 3200,
      y: 6600,
      z: 0,
      width: 450,
      depth: 400,
      height: 520,
      rotation: 0,
      color: '#d97706',
      material: 'wood_oak',
      isLocked: false,
      lockProportions: true,
    },
    // Dormitorio: Armario Ropero Paramétrico (1800 x 600 x 2200 mm)
    {
      id: 'f-wardrobe-param',
      name: 'Armario Ropero a Medida',
      category: 'dormitorio' as const,
      x: 2000,
      y: 4350,
      z: 0,
      width: 1800,
      depth: 600,
      height: 2200,
      rotation: 180,
      color: '#f8fafc',
      material: 'laminate_white',
      isLocked: false,
      lockProportions: false,
      isParametric: true,
      parametricConfig: createDefaultCabinetConfig('closet'),
    },

    // Baño: Plato Ducha
    {
      id: 'f-shower',
      catalogId: 'bath_shower',
      name: 'Plato de Ducha',
      category: 'bano' as const,
      x: 4600,
      y: 5350,
      z: 0,
      width: 1200,
      depth: 800,
      height: 60,
      rotation: 0,
      color: '#e2e8f0',
      material: 'resin_white',
      isLocked: false,
      lockProportions: true,
    },
    // Baño: Lavabo con mueble
    {
      id: 'f-vanity',
      catalogId: 'bath_vanity',
      name: 'Lavabo con Mueble',
      category: 'bano' as const,
      x: 5800,
      y: 5450,
      z: 0,
      width: 800,
      depth: 480,
      height: 850,
      rotation: 0,
      color: '#f8fafc',
      material: 'porcelain_white',
      isLocked: false,
      lockProportions: true,
    },
    // Baño: Inodoro
    {
      id: 'f-toilet',
      catalogId: 'bath_toilet',
      name: 'Inodoro con Cisterna',
      category: 'bano' as const,
      x: 5800,
      y: 4500,
      z: 0,
      width: 380,
      depth: 660,
      height: 780,
      rotation: 270,
      color: '#ffffff',
      material: 'porcelain_white',
      isLocked: false,
      lockProportions: true,
    },
  ];

  const manualDimensions = [
    {
      id: 'md-1',
      start: { x: 0, y: 7200 },
      end: { x: 4000, y: 7200 },
      offset: 200,
      label: '4,00 m',
    },
    {
      id: 'md-2',
      start: { x: -250, y: 4000 },
      end: { x: -250, y: 7000 },
      offset: 200,
      label: '3,00 m',
    },
  ];

  return {
    id: 'project-sample-1',
    name: 'Apartamento Moderno',
    createdAt: now,
    updatedAt: now,
    version: '1.0.0',
    unit: 'm',
    decimalPrecision: 2,
    gridSize: 100,
    snapTolerance: 25,
    snapEnabled: true,
    walls,
    rooms,
    openings,
    furniture,
    manualDimensions,
    layers: {
      walls: true,
      furniture: true,
      dimensions: true,
      rooms: true,
    },
  };
}

const LAST_ACTIVE_KEY = 'mhd_last_active_id';
const LOCAL_PREFIX = 'mhd_proj_';
const UNITS: readonly Unit[] = ['mm', 'cm', 'm'];

// ---------------------------------------------------------------------------
// Validation / normalisation
// ---------------------------------------------------------------------------

/** Empty project with all defaults. Single source of truth for "new project". */
export function createEmptyProject(name = 'Nuevo Proyecto'): Project {
  const now = Date.now();
  return {
    id: newId('project'),
    name,
    createdAt: now,
    updatedAt: now,
    version: '1.0.0',
    unit: 'm',
    decimalPrecision: 2,
    gridSize: 100,
    snapTolerance: 20,
    snapEnabled: true,
    walls: [],
    openings: [],
    rooms: [],
    furniture: [],
    manualDimensions: [],
    layers: { walls: true, furniture: true, dimensions: true, rooms: true },
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isPoint = (v: unknown): boolean => isRecord(v) && isNum(v.x) && isNum(v.y);
const asArray = <T>(v: unknown, keep: (item: unknown) => boolean): T[] =>
  Array.isArray(v) ? (v.filter(keep) as T[]) : [];

/**
 * Validates untrusted data (IndexedDB, localStorage, imported JSON) and returns
 * a complete `Project`: missing optional collections get defaults and malformed
 * entries are dropped, so the editor can never crash while rendering a damaged
 * or older file. Throws if the data is not a project at all.
 */
export function normalizeProject(raw: unknown): Project {
  if (!isRecord(raw) || !Array.isArray(raw.walls) || !Array.isArray(raw.furniture)) {
    throw new Error('El archivo no contiene un proyecto válido de My Home Design.');
  }

  const base = createEmptyProject();
  const layers = isRecord(raw.layers) ? raw.layers : {};

  return {
    ...base,
    ...(raw as Partial<Project>),
    id: typeof raw.id === 'string' && raw.id ? raw.id : base.id,
    name: typeof raw.name === 'string' && raw.name ? raw.name : base.name,
    createdAt: isNum(raw.createdAt) ? raw.createdAt : base.createdAt,
    updatedAt: isNum(raw.updatedAt) ? raw.updatedAt : base.updatedAt,
    unit: UNITS.includes(raw.unit as Unit) ? (raw.unit as Unit) : base.unit,
    gridSize: isNum(raw.gridSize) ? raw.gridSize : base.gridSize,
    snapTolerance: isNum(raw.snapTolerance) ? raw.snapTolerance : base.snapTolerance,
    snapEnabled: typeof raw.snapEnabled === 'boolean' ? raw.snapEnabled : base.snapEnabled,
    walls: asArray(raw.walls, (w) => isRecord(w) && isPoint(w.start) && isPoint(w.end)),
    rooms: asArray(raw.rooms, (r) => isRecord(r) && Array.isArray(r.points) && r.points.every(isPoint)),
    openings: asArray(raw.openings, (o) => isRecord(o) && typeof o.wallId === 'string'),
    furniture: asArray(raw.furniture, (f) => isRecord(f) && isNum(f.x) && isNum(f.y) && isNum(f.width) && isNum(f.depth)),
    manualDimensions: asArray(raw.manualDimensions, (d) => isRecord(d) && isPoint(d.start) && isPoint(d.end)),
    layers: {
      walls: layers.walls !== false,
      furniture: layers.furniture !== false,
      dimensions: layers.dimensions !== false,
      rooms: layers.rooms !== false,
    },
  };
}

// ---------------------------------------------------------------------------
// localStorage helpers (fallback only, never the primary store)
// ---------------------------------------------------------------------------

function readLocalCopy(id: string): Project | null {
  try {
    const text = localStorage.getItem(LOCAL_PREFIX + id);
    return text ? normalizeProject(JSON.parse(text)) : null;
  } catch (e) {
    console.warn('localStorage read failed', e);
    return null;
  }
}

export function getLastActiveProjectId(): string | null {
  try {
    return localStorage.getItem(LAST_ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function setLastActiveProjectId(id: string): void {
  try {
    localStorage.setItem(LAST_ACTIVE_KEY, id);
  } catch {
    // Not critical: we will fall back to the most recently updated project.
  }
}

// ---------------------------------------------------------------------------
// Projects CRUD
// ---------------------------------------------------------------------------

/**
 * Persists a project and returns the saved copy (with the new `updatedAt`).
 * IndexedDB is the primary store; localStorage is only used if IndexedDB fails.
 * Throws when *neither* works, so callers never report a false "saved".
 *
 * Note: saving does NOT mark the project as the last active one — duplicating or
 * importing from the project list must not change which project reopens on reload.
 */
export async function saveProject(project: Project): Promise<Project> {
  const saved: Project = { ...project, updatedAt: Date.now() };

  try {
    await db.projects.put({
      id: saved.id,
      name: saved.name,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
      data: saved,
    });
    return saved;
  } catch (err) {
    console.warn('IndexedDB save failed, using localStorage fallback', err);
  }

  localStorage.setItem(LOCAL_PREFIX + saved.id, JSON.stringify(saved));
  return saved;
}

/** Load project by ID (IndexedDB first, localStorage fallback). */
export async function loadProject(id: string): Promise<Project | null> {
  try {
    const item = await db.projects.get(id);
    if (item?.data) return normalizeProject(item.data);
  } catch (err) {
    console.warn('IndexedDB read failed, checking localStorage', err);
  }
  return readLocalCopy(id);
}

/** Last session project, else the most recently updated one, else a fresh sample. */
export async function loadLastSessionProject(): Promise<Project> {
  const lastId = getLastActiveProjectId();
  if (lastId) {
    const project = await loadProject(lastId);
    if (project) return project;
  }

  const [mostRecent] = await listProjects();
  if (mostRecent) {
    const project = await loadProject(mostRecent.id);
    if (project) return project;
  }

  const sample = createSampleProject();
  try {
    return await saveProject(sample);
  } catch (e) {
    console.warn('Could not persist the sample project', e);
    return sample;
  }
}

/** List all saved projects, newest first. */
export async function listProjects(): Promise<ProjectMetadata[]> {
  try {
    const list = await db.projects.orderBy('updatedAt').reverse().toArray();
    if (list.length > 0) {
      return list.map(({ id, name, createdAt, updatedAt, data }) => ({
        id,
        name,
        createdAt,
        updatedAt,
        version: data.version,
      }));
    }
  } catch (err) {
    console.warn('IndexedDB list failed, falling back to localStorage scan', err);
  }

  const meta: ProjectMetadata[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(LOCAL_PREFIX)) continue;
      const p = readLocalCopy(key.slice(LOCAL_PREFIX.length));
      if (p) meta.push({ id: p.id, name: p.name, createdAt: p.createdAt, updatedAt: p.updatedAt, version: p.version });
    }
  } catch (e) {
    console.warn('localStorage scan failed', e);
  }
  return meta.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Delete project everywhere, including the "last active" pointer. */
export async function deleteProject(id: string): Promise<void> {
  try {
    await db.projects.delete(id);
  } catch (e) {
    console.warn('IndexedDB delete failed', e);
  }
  try {
    localStorage.removeItem(LOCAL_PREFIX + id);
    if (getLastActiveProjectId() === id) localStorage.removeItem(LAST_ACTIVE_KEY);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Import / export
// ---------------------------------------------------------------------------

/** Export project to clean, formatted JSON string. */
export function exportProjectToJSON(project: Project): string {
  return JSON.stringify(
    {
      app: 'My Home Design',
      schemaVersion: '1.0.0',
      exportedAt: new Date().toISOString(),
      project,
    },
    null,
    2
  );
}

const IMPORTED_SUFFIX = ' (Importado)';

/** Import project from a JSON string, validating it and giving it a fresh identity. */
export function importProjectFromJSON(jsonStr: string): Project {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error('El archivo no es un JSON válido.');
  }

  const data = normalizeProject(isRecord(parsed) && isRecord(parsed.project) ? parsed.project : parsed);
  const name = data.name.endsWith(IMPORTED_SUFFIX) ? data.name : `${data.name}${IMPORTED_SUFFIX}`;

  return { ...data, id: newId('project'), name, updatedAt: Date.now() };
}

// ---------------------------------------------------------------------------
// Library (personal user objects & templates)
// ---------------------------------------------------------------------------

export async function saveLibraryItem(item: { name: string; category: string; data: unknown }): Promise<void> {
  await db.library.put({
    id: newId('lib'),
    name: item.name,
    category: item.category,
    createdAt: Date.now(),
    data: item.data,
  });
}

export async function listLibraryItems(): Promise<Array<{ id: string; name: string; category: string; data: unknown }>> {
  try {
    return await db.library.toArray();
  } catch {
    return [];
  }
}

export async function deleteLibraryItem(id: string): Promise<void> {
  try {
    await db.library.delete(id);
  } catch {
    // ignore
  }
}
