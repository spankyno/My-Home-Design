import { create } from 'zustand';
import {
  Project,
  Unit,
  ActiveTool,
  Point2D,
  Wall,
  Opening,
  Room,
  FurnitureItem,
  OpeningType,
  DynamicDimension,
  ManualDimension,
  LayersState,
} from '../types';
import {
  createEmptyProject,
  createSampleProject,
  saveProject,
  setLastActiveProjectId,
} from '../storage';
import { clampOpeningsToWalls, distance, getBoundingBox, getRotatedCorners } from '../geometry';
import { newId } from '../utils/id';

interface EditorState {
  // Project & Persistence
  project: Project;
  /**
   * Undo history. `history[historyIndex]` is always the last *committed* state of
   * the project; `uncommitted` tells whether `project` has diverged from it.
   */
  history: Project[];
  historyIndex: number;
  uncommitted: boolean;
  isDirty: boolean;
  isSaving: boolean;
  lastSavedAt: number | null;

  // View & Tool state
  viewMode: '2d' | '3d';
  activeTool: ActiveTool;
  pendingFurnitureCatalogId: string | null;
  pendingOpeningType: OpeningType | null;

  // Selection
  selectedIds: string[];
  hoveredId: string | null;

  // 2D Canvas Viewport
  zoom: number; // pixels per mm
  panOffset: Point2D; // pixels
  cursorWorldPos: Point2D; // mm

  // 3D Viewport
  camera3DPreset: 'perspective' | 'top' | 'front' | 'side';
  wall3DMode: 'solid' | 'transparent' | 'cutaway';
  showShadows3D: boolean;

  // Modals & Popovers
  activeModal: 'none' | 'parametric_designer' | 'projects' | 'export' | 'settings' | 'generic_creator';
  editingParametricFurnitureId: string | null;
  dimensionEditTarget: DynamicDimension | null;

  // Actions
  /** Replaces the open project immediately (resets undo history). */
  setProject: (project: Project) => void;
  /** Saves pending changes of the current project, then opens another one. */
  openProject: (project: Project) => Promise<void>;
  newProject: () => Promise<void>;
  saveCurrentProject: () => Promise<void>;
  undo: () => void;
  redo: () => void;
  /** Records the current project as one undo step (no-op if nothing changed). */
  pushHistorySnapshot: () => void;

  setViewMode: (mode: '2d' | '3d') => void;
  setActiveTool: (tool: ActiveTool) => void;
  setPendingFurnitureCatalogId: (id: string | null) => void;
  setPendingOpeningType: (type: OpeningType | null) => void;
  setUnit: (unit: Unit) => void;
  setGridSize: (gridSize: number) => void;
  setSnapEnabled: (enabled: boolean) => void;
  toggleLayer: (layer: keyof LayersState) => void;

  setSelectedIds: (ids: string[]) => void;
  selectObject: (id: string, multi?: boolean) => void;
  clearSelection: () => void;
  setHoveredId: (id: string | null) => void;

  deleteSelected: () => void;
  duplicateSelected: () => void;

  // Walls & Rooms
  addWall: (wall: Wall) => void;
  updateWall: (id: string, updates: Partial<Wall>) => void;
  deleteWall: (id: string) => void;
  addRoom: (room: Room) => void;
  addRoomWithWalls: (room: Room, walls: Wall[]) => void;
  updateRoom: (id: string, updates: Partial<Room>) => void;
  updateRoomDimensions: (id: string, newWidth: number, newLength: number) => void;
  /** Replaces a room's outline (resize / vertex drag); walls on its vertices follow. */
  setRoomPoints: (id: string, points: Point2D[]) => void;
  moveRoom: (id: string, dx: number, dy: number) => void;
  moveWall: (id: string, dx: number, dy: number) => void;
  deleteRoom: (id: string, deleteWalls?: boolean) => void;

  // Openings
  addOpening: (opening: Opening) => void;
  updateOpening: (id: string, updates: Partial<Opening>) => void;
  deleteOpening: (id: string) => void;

  // Furniture
  addFurniture: (item: FurnitureItem) => void;
  updateFurniture: (id: string, updates: Partial<FurnitureItem>) => void;
  deleteFurniture: (id: string) => void;

  // Dynamic Dimension Exact Adjustment
  applyExactDimensionDistance: (dim: DynamicDimension, targetMm: number) => void;

  // Manual Dimensions
  addManualDimension: (dim: ManualDimension) => void;
  deleteManualDimension: (id: string) => void;

  // Viewport transforms
  setZoom: (zoom: number | ((prev: number) => number)) => void;
  setPanOffset: (offset: Point2D | ((prev: Point2D) => Point2D)) => void;
  setCursorWorldPos: (pos: Point2D) => void;
  fitToScreen: (containerWidth: number, containerHeight: number) => void;

  // 3D Controls
  setCamera3DPreset: (preset: 'perspective' | 'top' | 'front' | 'side') => void;
  setWall3DMode: (mode: 'solid' | 'transparent' | 'cutaway') => void;
  setShowShadows3D: (show: boolean) => void;

  // Modals
  openModal: (modal: EditorState['activeModal'], parametricFurnitureId?: string) => void;
  closeModal: () => void;
  setDimensionEditTarget: (target: DynamicDimension | null) => void;
}

// ---------------------------------------------------------------------------
// Constants & pure helpers
// ---------------------------------------------------------------------------

const MAX_HISTORY = 30;
/** A wall belongs to a room when both its endpoints are this close (mm) to room vertices. */
const ROOM_WALL_TOLERANCE = 60;
/** Walls follow a room's vertices when moved/resized if they start/end within this distance (mm). */
const WALL_REMAP_TOLERANCE = 80;
const DUPLICATE_OFFSET = 300;

const clone = <T>(value: T): T => structuredClone(value);

/** Display preferences travel with the project but must not be rolled back by undo/redo. */
function restoreSnapshot(snapshot: Project, current: Project): Project {
  const { unit, gridSize, snapEnabled, snapTolerance, decimalPrecision, layers } = current;
  return { ...clone(snapshot), unit, gridSize, snapEnabled, snapTolerance, decimalPrecision, layers: { ...layers } };
}

const touchesBothEnds = (wall: Wall, points: Point2D[]): boolean =>
  points.some((p) => distance(wall.start, p) < ROOM_WALL_TOLERANCE) &&
  points.some((p) => distance(wall.end, p) < ROOM_WALL_TOLERANCE);

/** Ids of walls that only belong to the removed rooms (not shared with a remaining room). */
function wallsExclusiveToRooms(walls: Wall[], removed: Room[], remaining: Room[]): Set<string> {
  const ids = new Set<string>();
  for (const wall of walls) {
    const belongsToRemoved = removed.some((r) => r.points.length >= 3 && touchesBothEnds(wall, r.points));
    if (belongsToRemoved && !remaining.some((r) => touchesBothEnds(wall, r.points))) {
      ids.add(wall.id);
    }
  }
  return ids;
}

/** Moves wall endpoints that sat on `oldPoints[i]` to `newPoints[i]`. */
function remapWallEndpoints(walls: Wall[], oldPoints: Point2D[], newPoints: Point2D[]): Wall[] {
  const remap = (p: Point2D): Point2D | null => {
    const i = oldPoints.findIndex((q) => distance(p, q) < WALL_REMAP_TOLERANCE);
    return i >= 0 ? newPoints[i] : null;
  };
  return walls.map((wall) => {
    const start = remap(wall.start);
    const end = remap(wall.end);
    return start || end ? { ...wall, start: start ?? wall.start, end: end ?? wall.end } : wall;
  });
}

const initialSample = createSampleProject();

export const useEditorStore = create<EditorState>((set, get) => {
  /**
   * Changes the project WITHOUT recording an undo step. Used for continuous edits
   * (dragging, typing in the inspector); the caller commits with pushHistorySnapshot().
   * The first edit after an undo discards the redo stack.
   */
  const edit = (recipe: (project: Project) => Project, extra: Partial<EditorState> = {}) =>
    set((s) => ({
      project: recipe(s.project),
      isDirty: true,
      uncommitted: true,
      history:
        !s.uncommitted && s.historyIndex < s.history.length - 1
          ? s.history.slice(0, s.historyIndex + 1)
          : s.history,
      ...extra,
    }));

  /** Changes the project and records it as exactly one undo step. */
  const commit = (recipe: (project: Project) => Project, extra: Partial<EditorState> = {}) => {
    edit(recipe, extra);
    get().pushHistorySnapshot();
  };

  return {
    project: initialSample,
    history: [clone(initialSample)],
    historyIndex: 0,
    uncommitted: false,
    isDirty: false,
    isSaving: false,
    lastSavedAt: null,

    viewMode: '2d',
    activeTool: 'select',
    pendingFurnitureCatalogId: null,
    pendingOpeningType: null,

    selectedIds: [],
    hoveredId: null,

    zoom: 0.12, // 1000mm = 120px
    panOffset: { x: 300, y: 350 },
    cursorWorldPos: { x: 0, y: 0 },

    camera3DPreset: 'perspective',
    wall3DMode: 'cutaway',
    showShadows3D: true,

    activeModal: 'none',
    editingParametricFurnitureId: null,
    dimensionEditTarget: null,

    // ----- Project lifecycle -------------------------------------------------

    setProject: (project) => {
      setLastActiveProjectId(project.id);
      set({
        project,
        history: [clone(project)],
        historyIndex: 0,
        uncommitted: false,
        selectedIds: [],
        dimensionEditTarget: null,
        isDirty: false,
      });
    },

    openProject: async (project) => {
      // Never drop edits still waiting for the debounced autosave.
      if (get().isDirty) await get().saveCurrentProject();
      get().setProject(project);
    },

    newProject: async () => {
      const project = createEmptyProject();
      await get().openProject(project);
      try {
        await saveProject(project);
      } catch (err) {
        console.warn('Could not persist the new project', err);
      }
    },

    saveCurrentProject: async () => {
      const snapshot = get().project;
      set({ isSaving: true });
      try {
        const saved = await saveProject(snapshot);
        setLastActiveProjectId(saved.id);
        // Edits made while saving stay pending (isDirty) for the next autosave.
        set((s) => ({ isSaving: false, lastSavedAt: saved.updatedAt, isDirty: s.project !== snapshot }));
      } catch (err) {
        console.error('Could not save the project', err);
        set({ isSaving: false });
      }
    },

    // ----- History -----------------------------------------------------------

    pushHistorySnapshot: () => {
      const { project, history, historyIndex, uncommitted } = get();
      if (!uncommitted) return;
      const next = [...history.slice(0, historyIndex + 1), clone(project)].slice(-MAX_HISTORY);
      set({ history: next, historyIndex: next.length - 1, uncommitted: false });
    },

    undo: () => {
      const { history, historyIndex, uncommitted, project } = get();
      // With uncommitted edits, the first undo just discards them.
      const target = uncommitted ? historyIndex : historyIndex - 1;
      if (target < 0) return;
      set({
        project: restoreSnapshot(history[target], project),
        historyIndex: target,
        uncommitted: false,
        selectedIds: [],
        isDirty: true,
      });
    },

    redo: () => {
      const { history, historyIndex, uncommitted, project } = get();
      if (uncommitted || historyIndex >= history.length - 1) return;
      const target = historyIndex + 1;
      set({
        project: restoreSnapshot(history[target], project),
        historyIndex: target,
        selectedIds: [],
        isDirty: true,
      });
    },

    // ----- View / tool state -------------------------------------------------

    setViewMode: (mode) => set({ viewMode: mode }),
    setActiveTool: (tool) => set({ activeTool: tool }),
    setPendingFurnitureCatalogId: (id) =>
      set({ pendingFurnitureCatalogId: id, activeTool: id ? 'place_furniture' : 'select' }),
    setPendingOpeningType: (type) =>
      set({ pendingOpeningType: type, activeTool: type ? 'place_opening' : 'select' }),

    // Display preferences: persisted with the project but not undoable.
    setUnit: (unit) => set((s) => ({ project: { ...s.project, unit }, isDirty: true })),
    setGridSize: (gridSize) => set((s) => ({ project: { ...s.project, gridSize }, isDirty: true })),
    setSnapEnabled: (snapEnabled) => set((s) => ({ project: { ...s.project, snapEnabled }, isDirty: true })),
    toggleLayer: (layer) =>
      set((s) => ({
        project: { ...s.project, layers: { ...s.project.layers, [layer]: !s.project.layers[layer] } },
        isDirty: true,
      })),

    // ----- Selection ---------------------------------------------------------

    setSelectedIds: (ids) => set({ selectedIds: ids }),

    selectObject: (id, multi = false) =>
      set((s) => {
        if (!multi) return { selectedIds: [id] };
        return {
          selectedIds: s.selectedIds.includes(id) ? s.selectedIds.filter((x) => x !== id) : [...s.selectedIds, id],
        };
      }),

    clearSelection: () => set({ selectedIds: [] }),
    setHoveredId: (id) => set({ hoveredId: id }),

    deleteSelected: () => {
      const { selectedIds, project } = get();
      if (selectedIds.length === 0) return;

      const selected = new Set(selectedIds);
      const removedRooms = project.rooms.filter((r) => selected.has(r.id));
      const remainingRooms = project.rooms.filter((r) => !selected.has(r.id));
      const orphanWalls = wallsExclusiveToRooms(project.walls, removedRooms, remainingRooms);
      const wallGone = (id: string) => selected.has(id) || orphanWalls.has(id);

      commit(
        (p) => ({
          ...p,
          walls: p.walls.filter((w) => !wallGone(w.id)),
          openings: p.openings.filter((o) => !selected.has(o.id) && !wallGone(o.wallId)),
          rooms: remainingRooms.map((r) =>
            r.wallIds ? { ...r, wallIds: r.wallIds.filter((id) => !wallGone(id)) } : r
          ),
          furniture: p.furniture.filter((f) => !selected.has(f.id)),
          manualDimensions: p.manualDimensions.filter((d) => !selected.has(d.id)),
        }),
        { selectedIds: [] }
      );
    },

    duplicateSelected: () => {
      const { selectedIds, project } = get();
      const copies = project.furniture
        .filter((f) => selectedIds.includes(f.id))
        .map((item): FurnitureItem => ({
          ...clone(item),
          id: newId('f'),
          x: item.x + DUPLICATE_OFFSET,
          y: item.y + DUPLICATE_OFFSET,
          name: item.name.endsWith(' (Copia)') ? item.name : `${item.name} (Copia)`,
        }));
      if (copies.length === 0) return;

      commit((p) => ({ ...p, furniture: [...p.furniture, ...copies] }), {
        selectedIds: copies.map((c) => c.id),
      });
    },

    // ----- Walls & rooms -----------------------------------------------------

    addWall: (wall) => commit((p) => ({ ...p, walls: [...p.walls, wall] }), { selectedIds: [wall.id] }),

    updateWall: (id, updates) =>
      edit((p) => {
        const walls = p.walls.map((w) => (w.id === id ? { ...w, ...updates } : w));
        // A shorter wall must not leave its doors/windows hanging in the air.
        const moved = 'start' in updates || 'end' in updates;
        return { ...p, walls, openings: moved ? clampOpeningsToWalls(walls, p.openings) : p.openings };
      }),

    moveWall: (id, dx, dy) =>
      edit((p) => ({
        ...p,
        walls: p.walls.map((w) =>
          w.id === id
            ? {
                ...w,
                start: { x: Math.round(w.start.x + dx), y: Math.round(w.start.y + dy) },
                end: { x: Math.round(w.end.x + dx), y: Math.round(w.end.y + dy) },
              }
            : w
        ),
      })),

    deleteWall: (id) => {
      commit(
        (p) => ({
          ...p,
          walls: p.walls.filter((w) => w.id !== id),
          openings: p.openings.filter((o) => o.wallId !== id),
        }),
        { selectedIds: get().selectedIds.filter((sid) => sid !== id) }
      );
    },

    addRoom: (room) => commit((p) => ({ ...p, rooms: [...p.rooms, room] }), { selectedIds: [room.id] }),

    addRoomWithWalls: (room, walls) =>
      commit(
        (p) => ({
          ...p,
          walls: [...p.walls, ...walls],
          rooms: [...p.rooms, { ...room, wallIds: walls.map((w) => w.id) }],
        }),
        { selectedIds: [room.id] }
      ),

    updateRoom: (id, updates) =>
      edit((p) => ({ ...p, rooms: p.rooms.map((r) => (r.id === id ? { ...r, ...updates } : r)) })),

    updateRoomDimensions: (id, newWidth, newLength) => {
      const room = get().project.rooms.find((r) => r.id === id);
      if (!room || room.points.length < 3) return;

      const box = getBoundingBox(room.points);
      const currW = Math.max(10, box.maxX - box.minX);
      const currH = Math.max(10, box.maxY - box.minY);
      const scaleX = Math.max(200, Math.round(newWidth)) / currW;
      const scaleY = Math.max(200, Math.round(newLength)) / currH;

      get().setRoomPoints(
        id,
        room.points.map((p) => ({
          x: Math.round(box.minX + (p.x - box.minX) * scaleX),
          y: Math.round(box.minY + (p.y - box.minY) * scaleY),
        }))
      );
    },

    setRoomPoints: (id, points) => {
      const room = get().project.rooms.find((r) => r.id === id);
      if (!room || points.length < 3) return;

      edit((p) => {
        const walls = remapWallEndpoints(p.walls, room.points, points);
        return {
          ...p,
          rooms: p.rooms.map((r) => (r.id === id ? { ...r, points } : r)),
          walls,
          openings: clampOpeningsToWalls(walls, p.openings),
        };
      });
    },

    moveRoom: (id, dx, dy) => {
      const room = get().project.rooms.find((r) => r.id === id);
      if (!room) return;
      get().setRoomPoints(
        id,
        room.points.map((p) => ({ x: Math.round(p.x + dx), y: Math.round(p.y + dy) }))
      );
    },

    deleteRoom: (id, deleteWalls = true) => {
      const { project, selectedIds } = get();
      const room = project.rooms.find((r) => r.id === id);
      if (!room) return;

      const remaining = project.rooms.filter((r) => r.id !== id);
      const orphanWalls = deleteWalls ? wallsExclusiveToRooms(project.walls, [room], remaining) : new Set<string>();

      commit(
        (p) => ({
          ...p,
          rooms: remaining,
          walls: p.walls.filter((w) => !orphanWalls.has(w.id)),
          openings: p.openings.filter((o) => !orphanWalls.has(o.wallId)),
        }),
        { selectedIds: selectedIds.filter((sid) => sid !== id && !orphanWalls.has(sid)) }
      );
    },

    // ----- Openings ----------------------------------------------------------

    addOpening: (opening) => commit((p) => ({ ...p, openings: [...p.openings, opening] })),

    updateOpening: (id, updates) =>
      edit((p) => ({ ...p, openings: p.openings.map((o) => (o.id === id ? { ...o, ...updates } : o)) })),

    deleteOpening: (id) =>
      commit((p) => ({ ...p, openings: p.openings.filter((o) => o.id !== id) }), {
        selectedIds: get().selectedIds.filter((sid) => sid !== id),
      }),

    // ----- Furniture ---------------------------------------------------------

    addFurniture: (item) =>
      commit((p) => ({ ...p, furniture: [...p.furniture, item] }), { selectedIds: [item.id] }),

    updateFurniture: (id, updates) =>
      edit((p) => ({
        ...p,
        furniture: p.furniture.map((f) => {
          if (f.id !== id) return f;
          const next = { ...f, ...updates };
          // A parametric cabinet is built from its config: keep it in sync with the outer size.
          if (next.parametricConfig && (updates.width ?? updates.depth ?? updates.height) !== undefined) {
            next.parametricConfig = {
              ...next.parametricConfig,
              exteriorWidth: next.width,
              exteriorDepth: next.depth,
              exteriorHeight: next.height,
            };
          }
          return next;
        }),
      })),

    deleteFurniture: (id) =>
      commit((p) => ({ ...p, furniture: p.furniture.filter((f) => f.id !== id) }), {
        selectedIds: get().selectedIds.filter((sid) => sid !== id),
      }),

    applyExactDimensionDistance: (dim, targetMm) => {
      if (!dim.targetFurnitureId || !dim.direction) return;
      const item = get().project.furniture.find((f) => f.id === dim.targetFurnitureId);
      if (!item) return;

      // The gap on the left/top grows when the item moves towards +x/+y;
      // the gap on the right/bottom grows when it moves towards -x/-y.
      const growsWithPositiveShift = dim.direction === 'left' || dim.direction === 'top';
      const shift = Math.round((growsWithPositiveShift ? 1 : -1) * (targetMm - dim.distance));
      const horizontal = dim.direction === 'left' || dim.direction === 'right';

      commit((p) => ({
        ...p,
        furniture: p.furniture.map((f) =>
          f.id === item.id ? { ...f, x: horizontal ? f.x + shift : f.x, y: horizontal ? f.y : f.y + shift } : f
        ),
      }));
    },

    // ----- Manual dimensions -------------------------------------------------

    addManualDimension: (dim) => commit((p) => ({ ...p, manualDimensions: [...p.manualDimensions, dim] })),

    deleteManualDimension: (id) =>
      commit((p) => ({ ...p, manualDimensions: p.manualDimensions.filter((d) => d.id !== id) })),

    // ----- Viewport ----------------------------------------------------------

    setZoom: (zoom) =>
      set((s) => ({
        zoom: Math.max(0.02, Math.min(2.0, typeof zoom === 'function' ? zoom(s.zoom) : zoom)),
      })),

    setPanOffset: (panOffset) =>
      set((s) => ({ panOffset: typeof panOffset === 'function' ? panOffset(s.panOffset) : panOffset })),

    setCursorWorldPos: (pos) => set({ cursorWorldPos: pos }),

    fitToScreen: (containerWidth, containerHeight) => {
      const { project } = get();
      const points: Point2D[] = [
        ...project.walls.flatMap((w) => [w.start, w.end]),
        ...project.rooms.flatMap((r) => r.points),
        ...project.furniture.flatMap((f) => getRotatedCorners({ x: f.x, y: f.y }, f.width, f.depth, f.rotation)),
      ];

      if (points.length === 0) {
        set({ zoom: 0.1, panOffset: { x: containerWidth / 2, y: containerHeight / 2 } });
        return;
      }

      const { minX, minY, maxX, maxY } = getBoundingBox(points);
      const spanX = Math.max(1000, maxX - minX + 1000);
      const spanY = Math.max(1000, maxY - minY + 1000);
      const zoom = Math.max(0.04, Math.min(0.5, Math.min((containerWidth * 0.8) / spanX, (containerHeight * 0.8) / spanY)));

      set({
        zoom,
        panOffset: {
          x: containerWidth / 2 - ((minX + maxX) / 2) * zoom,
          y: containerHeight / 2 - ((minY + maxY) / 2) * zoom,
        },
      });
    },

    // ----- 3D & modals -------------------------------------------------------

    setCamera3DPreset: (preset) => set({ camera3DPreset: preset }),
    setWall3DMode: (mode) => set({ wall3DMode: mode }),
    setShowShadows3D: (show) => set({ showShadows3D: show }),

    openModal: (modal, parametricFurnitureId) =>
      set({ activeModal: modal, editingParametricFurnitureId: parametricFurnitureId || null }),
    closeModal: () => set({ activeModal: 'none', editingParametricFurnitureId: null }),
    setDimensionEditTarget: (target) => set({ dimensionEditTarget: target }),
  };
});
