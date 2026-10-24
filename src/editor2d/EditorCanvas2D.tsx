import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore } from '../state/useEditorStore';
import {
  Point2D,
  Wall,
  FurnitureItem,
  Opening,
  Room,
  DynamicDimension,
} from '../types';
import {
  distance,
  angleDeg,
  snapToGrid,
  snapToTargets,
  formatMeasurement,
  calculatePolygonArea,
  calculatePolygonPerimeter,
  calculatePolygonCentroid,
  calculateDynamicDimensions,
  projectPointOnSegment,
  getBoundingBox,
} from '../geometry';
import {
  Box,
  HandleId,
  HANDLE_IDS,
  HANDLE_DIRS,
  FRAME_MARGIN,
  MIN_WALL_LENGTH,
  furnitureHandlePoints,
  resizeFurniture,
  resizeCursor,
  isAxisAlignedRect,
  roomBoxHandlePoints,
  resizeRoomBox,
  moveRoomVertex,
  moveOpeningAlongWall,
  resizeOpeningEnd,
} from './manipulation';
import { FURNITURE_CATALOG, OPENING_CATALOG, furnitureFromCatalog } from '../catalog';
import { newId } from '../utils/id';
import { hitTest } from './hitTest';
import { planOpeningPlacement } from './placement';
import {
  OBJECT_SNAP_PX,
  SnapGuide,
  adaptiveGridStep,
  collectSnapLines,
  rectOfBox,
  snapRect,
} from './snapping';

/** What the user is dragging when they grab a handle (or an opening) of the selected object. */
type HandleDrag =
  | { kind: 'furniture'; id: string; handle: HandleId; init: Box }
  | { kind: 'room_box'; id: string; handle: HandleId; init: Point2D[] }
  | { kind: 'room_vertex'; id: string; index: number; init: Point2D[] }
  | { kind: 'wall_end'; id: string; end: 'start' | 'end' }
  | { kind: 'opening_end'; id: string; end: 'start' | 'end'; init: { distanceAlongWall: number; width: number } }
  | { kind: 'opening_move'; id: string; grab: number };

/** Handles are hit-tested and drawn at a constant on-screen size, whatever the zoom. */
const HANDLE_HIT_PX = 10;
const HANDLE_DRAW_PX = 5;
/** Half-size (px) of a dimension badge's click area. */
const BADGE_HALF_W_PX = 24;
const BADGE_HALF_H_PX = 11;
/** A press only becomes a drag after the pointer travels this far (px): clicks never nudge objects. */
const DRAG_THRESHOLD_PX = 4;

/**
 * Local position of the rotation knob: diagonally outside the NE corner, at a constant
 * on-screen distance. (Centred above the piece it collided with the top dimension badge.)
 */
const rotateKnobLocal = (halfW: number, halfD: number, zoom: number): Point2D => {
  const offset = 26 / zoom;
  return { x: halfW + FRAME_MARGIN + offset, y: -halfD - FRAME_MARGIN - offset };
};

function cursorForDrag(drag: HandleDrag): string {
  switch (drag.kind) {
    case 'furniture':
      return resizeCursor(drag.handle, drag.init.rotation);
    case 'room_box':
      return resizeCursor(drag.handle);
    default:
      return 'move';
  }
}

export const EditorCanvas2D: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const {
    project,
    activeTool,
    pendingFurnitureCatalogId,
    pendingOpeningType,
    selectedIds,
    zoom,
    panOffset,
    setPanOffset,
    setCursorWorldPos,
    selectObject,
    clearSelection,
    addOpening,
    addFurniture,
    updateFurniture,
    setRoomPoints,
    updateOpening,
    updateWall,
    moveRoom,
    moveWall,
    setActiveTool,
    setPendingFurnitureCatalogId,
    setPendingOpeningType,
    pushHistorySnapshot,
    setDimensionEditTarget
  } = useEditorStore(
    useShallow((s) => ({
      project: s.project,
      activeTool: s.activeTool,
      pendingFurnitureCatalogId: s.pendingFurnitureCatalogId,
      pendingOpeningType: s.pendingOpeningType,
      selectedIds: s.selectedIds,
      zoom: s.zoom,
      panOffset: s.panOffset,
      setPanOffset: s.setPanOffset,
      setCursorWorldPos: s.setCursorWorldPos,
      selectObject: s.selectObject,
      clearSelection: s.clearSelection,
      addOpening: s.addOpening,
      addFurniture: s.addFurniture,
      updateFurniture: s.updateFurniture,
      setRoomPoints: s.setRoomPoints,
      updateOpening: s.updateOpening,
      updateWall: s.updateWall,
      moveRoom: s.moveRoom,
      moveWall: s.moveWall,
      setActiveTool: s.setActiveTool,
      setPendingFurnitureCatalogId: s.setPendingFurnitureCatalogId,
      setPendingOpeningType: s.setPendingOpeningType,
      pushHistorySnapshot: s.pushHistorySnapshot,
      setDimensionEditTarget: s.setDimensionEditTarget,
    }))
  );

  // Local drawing & drag interaction state
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<Point2D>({ x: 0, y: 0 });

  // Furniture / room / wall dragging
  const [dragMode, setDragMode] = useState<'none' | 'move' | 'rotate' | 'resize'>('none');
  const [dragStartWorld, setDragStartWorld] = useState<Point2D>({ x: 0, y: 0 });
  const [lastDragWorld, setLastDragWorld] = useState<Point2D>({ x: 0, y: 0 });
  const [initialItemTransforms, setInitialItemTransforms] = useState<
    Map<string, { x: number; y: number; rotation: number; width: number; depth: number }>
  >(new Map());
  const [initialRoomPoints, setInitialRoomPoints] = useState<Map<string, Point2D[]>>(new Map());
  const [initialWallEndpoints, setInitialWallEndpoints] = useState<Map<string, { start: Point2D; end: Point2D }>>(new Map());

  // Handle-based editing (resize / vertex / wall end / opening)
  const [handleDrag, setHandleDrag] = useState<HandleDrag | null>(null);
  const [hoverCursor, setHoverCursor] = useState<string | null>(null);
  const handleGrab = useRef<Point2D>({ x: 0, y: 0 }); // pointer offset from the handle centre at press time
  const pressOrigin = useRef<{ x: number; y: number } | null>(null);
  const dragStarted = useRef(false);
  // Furniture pressed while part of a multi-selection: collapse to it on release if it was a click, not a drag.
  const collapseTo = useRef<string | null>(null);
  // Alignment guides shown while an object is magnetised to others, and whether Alt (no snapping) is held.
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const [altHeld, setAltHeld] = useState(false);
  // Snap targets frozen when a handle is grabbed, minus the geometry being edited. Otherwise the
  // dragged corner (and the walls following it) would snap to its own previous position.
  const dragSnapTargets = useRef<Point2D[] | null>(null);

  // Interactive drawing states
  const [currentMouseWorld, setCurrentMouseWorld] = useState<Point2D>({ x: 0, y: 0 });
  const [measureStart, setMeasureStart] = useState<Point2D | null>(null);
  const [measureEnd, setMeasureEnd] = useState<Point2D | null>(null);

  // Coordinate transformations
  const screenToWorld = useCallback(
    (screenX: number, screenY: number): Point2D => {
      return {
        x: (screenX - panOffset.x) / zoom,
        y: (screenY - panOffset.y) / zoom,
      };
    },
    [panOffset, zoom]
  );

  // Collect all vertex snap targets (wall ends, room corners)
  const getSnapTargets = useCallback((): Point2D[] => {
    const targets: Point2D[] = [];
    for (const w of project.walls) {
      targets.push(w.start, w.end);
    }
    for (const r of project.rooms) {
      targets.push(...r.points);
    }
    return targets;
  }, [project.walls, project.rooms]);

  /** Applies grid / vertex magnetism to a world point (when snapping is enabled). */
  const snapWorld = useCallback(
    (raw: Point2D, targets?: Point2D[]): Point2D => {
      if (!project.snapEnabled) return raw;
      const target = snapToTargets(raw, targets ?? getSnapTargets(), project.snapTolerance);
      // The grid refines as you zoom in, so close placement is possible without fighting coarse steps.
      return target.snapped ? target.point : snapToGrid(raw, adaptiveGridStep(project.gridSize, zoom));
    },
    [project.snapEnabled, project.gridSize, project.snapTolerance, getSnapTargets, zoom]
  );

  // Dynamic dimensions of the selected piece (derived data: no state/effect needed)
  const activeDynamicDims = useMemo<DynamicDimension[]>(() => {
    if (selectedIds.length !== 1 || !project.layers.dimensions) return [];
    const item = project.furniture.find((f) => f.id === selectedIds[0]);
    return item ? calculateDynamicDimensions(item, project.walls, project.furniture, project.unit) : [];
  }, [selectedIds, project.furniture, project.walls, project.unit, project.layers.dimensions]);

  // Resize canvas to fill its container (also when side panels appear/disappear,
  // which a window 'resize' listener would miss). Resizing clears the canvas, so redraw.
  const drawRef = useRef<() => void>(() => {});
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateCanvasSize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      drawRef.current();
    };

    updateCanvasSize();
    const observer = new ResizeObserver(updateCanvasSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Main Draw Routine
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.scale(dpr, dpr);

    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    // Background color
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, width, height);

    // Apply viewport transform (pan & zoom)
    ctx.save();
    ctx.translate(panOffset.x, panOffset.y);
    ctx.scale(zoom, zoom);

    // Visible world bounds
    const topLeft = screenToWorld(0, 0);
    const bottomRight = screenToWorld(width, height);

    // 1. Draw Grid
    drawGrid(ctx, topLeft, bottomRight, project.gridSize, zoom);

    // 2. Draw Rooms (Floor fills and labels)
    if (project.layers.rooms) {
      for (const room of project.rooms) {
        const isSelected = selectedIds.includes(room.id);
        drawRoom(ctx, room, isSelected);
      }
    }

    // 3. Draw Walls
    if (project.layers.walls) {
      for (const wall of project.walls) {
        const isSelected = selectedIds.includes(wall.id);
        drawWall(ctx, wall, isSelected, project.unit);
      }
    }

    // 4. Draw Openings (doors and windows)
    if (project.layers.walls) {
      for (const opening of project.openings) {
        const wall = project.walls.find((w) => w.id === opening.wallId);
        if (wall) {
          const isSelected = selectedIds.includes(opening.id);
          drawOpening(ctx, opening, wall, isSelected);
        }
      }
    }

    // 5. Draw Furniture
    if (project.layers.furniture) {
      for (const item of project.furniture) {
        const isSelected = selectedIds.includes(item.id);
        drawFurniture(ctx, item, isSelected);
      }
    }

    // 6. Draw Manual Dimensions
    if (project.layers.dimensions) {
      for (const dim of project.manualDimensions) {
        const isSelected = selectedIds.includes(dim.id);
        drawDimensionLine(ctx, dim.start, dim.end, dim.label || '', '#64748b', isSelected);
      }
    }

    // 7. Draw Active Dynamic Dimensions
    if (project.layers.dimensions && activeDynamicDims.length > 0) {
      for (const dim of activeDynamicDims) {
        drawDynamicDimension(ctx, dim);
      }
    }

    // 8. Draw In-Progress Drawing Previews
    drawEditHandles(ctx);
    drawSnapGuides(ctx, snapGuides);
    drawInteractivePreviews(ctx);
    drawResizeReadout(ctx);

    ctx.restore();
    ctx.restore();
  }, [
    panOffset,
    zoom,
    project,
    selectedIds,
    activeDynamicDims,
    snapGuides,
    altHeld,
    dragMode,
    handleDrag,
    currentMouseWorld,
    measureStart,
    measureEnd,
    pendingFurnitureCatalogId,
    pendingOpeningType,
    screenToWorld,
  ]);

  // Request Animation Frame trigger
  drawRef.current = draw;

  useEffect(() => {
    let animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [draw]);

  /** One handle, with a constant on-screen size. Draws at the current ctx coordinates. */
  function drawHandleMark(ctx: CanvasRenderingContext2D, x: number, y: number, shape: 'square' | 'circle' = 'square') {
    const r = HANDLE_DRAW_PX / zoom;
    ctx.save();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 1.5 / zoom;
    ctx.beginPath();
    if (shape === 'circle') ctx.arc(x, y, r, 0, Math.PI * 2);
    else ctx.rect(x - r, y - r, r * 2, r * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Helper: Draw Grid
  function drawGrid(
    ctx: CanvasRenderingContext2D,
    tl: Point2D,
    br: Point2D,
    gridSize: number,
    currentZoom: number
  ) {
    const minorStep = gridSize <= 0 ? 100 : gridSize;
    const majorStep = minorStep * 10;

    const startX = Math.floor(tl.x / minorStep) * minorStep;
    const endX = Math.ceil(br.x / minorStep) * minorStep;
    const startY = Math.floor(tl.y / minorStep) * minorStep;
    const endY = Math.ceil(br.y / minorStep) * minorStep;

    // Minor lines
    ctx.lineWidth = 1 / currentZoom;
    ctx.strokeStyle = '#e2e8f0';
    ctx.beginPath();
    for (let x = startX; x <= endX; x += minorStep) {
      if (x % majorStep !== 0) {
        ctx.moveTo(x, startY);
        ctx.lineTo(x, endY);
      }
    }
    for (let y = startY; y <= endY; y += minorStep) {
      if (y % majorStep !== 0) {
        ctx.moveTo(startX, y);
        ctx.lineTo(endX, y);
      }
    }
    ctx.stroke();

    // Major lines
    ctx.lineWidth = 1.5 / currentZoom;
    ctx.strokeStyle = '#cbd5e1';
    ctx.beginPath();
    for (let x = Math.floor(tl.x / majorStep) * majorStep; x <= endX; x += majorStep) {
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
    }
    for (let y = Math.floor(tl.y / majorStep) * majorStep; y <= endY; y += majorStep) {
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
    }
    ctx.stroke();

    // Origin crosshair (0,0)
    ctx.lineWidth = 2 / currentZoom;
    ctx.strokeStyle = '#94a3b8';
    ctx.beginPath();
    ctx.moveTo(-150, 0);
    ctx.lineTo(150, 0);
    ctx.moveTo(0, -150);
    ctx.lineTo(0, 150);
    ctx.stroke();
  }

  // Helper: Draw Room
  function drawRoom(ctx: CanvasRenderingContext2D, room: Room, isSelected: boolean = false) {
    if (room.points.length < 3) return;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(room.points[0].x, room.points[0].y);
    for (let i = 1; i < room.points.length; i++) {
      ctx.lineTo(room.points[i].x, room.points[i].y);
    }
    ctx.closePath();

    // Floor fill color with subtle tone
    ctx.fillStyle = room.floorColor || '#f1f5f9';
    ctx.globalAlpha = 0.55;
    ctx.fill();

    // Material hatching / architectural pattern in 2D
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    const bounds = calculatePolygonCentroid(room.points);

    if (room.floorMaterial === 'parquet_herringbone') {
      // True 45-degree herringbone zigzag pattern
      for (let y = bounds.y - 3000; y <= bounds.y + 3000; y += 120) {
        ctx.beginPath();
        for (let x = bounds.x - 3000; x <= bounds.x + 3000; x += 180) {
          ctx.moveTo(x, y);
          ctx.lineTo(x + 90, y + 60);
          ctx.lineTo(x + 180, y);
        }
        ctx.stroke();
      }
    } else if (
      room.floorMaterial === 'parquet_plank' ||
      room.floorMaterial === 'parquet' ||
      room.floorMaterial === 'laminate' ||
      room.floorMaterial === 'wood_walnut'
    ) {
      // Staggered architectural wood plank lines
      for (let offset = -3000; offset <= 3000; offset += 180) {
        ctx.beginPath();
        ctx.moveTo(bounds.x + offset - 2000, bounds.y - 2000);
        ctx.lineTo(bounds.x + offset + 2000, bounds.y + 2000);
        ctx.stroke();
      }
    } else if (room.floorMaterial === 'hydraulic_tile') {
      // Hydraulic tile 2D checkerboard and motif
      for (let offset = -3000; offset <= 3000; offset += 200) {
        ctx.beginPath();
        ctx.moveTo(bounds.x + offset, bounds.y - 3000);
        ctx.lineTo(bounds.x + offset, bounds.y + 3000);
        ctx.moveTo(bounds.x - 3000, bounds.y + offset);
        ctx.lineTo(bounds.x + 3000, bounds.y + offset);
        ctx.stroke();
      }
    } else if (room.floorMaterial === 'marble_carrara' || room.floorMaterial === 'marble_nero' || room.floorMaterial === 'marble') {
      // Organic marble vein curves in 2D
      ctx.beginPath();
      ctx.moveTo(bounds.x - 1000, bounds.y - 800);
      ctx.bezierCurveTo(bounds.x - 400, bounds.y - 200, bounds.x + 300, bounds.y + 400, bounds.x + 1200, bounds.y + 800);
      ctx.moveTo(bounds.x - 600, bounds.y + 800);
      ctx.bezierCurveTo(bounds.x - 100, bounds.y + 200, bounds.x + 500, bounds.y - 400, bounds.x + 900, bounds.y - 700);
      ctx.stroke();
    } else if (room.floorMaterial === 'terrazzo') {
      // Terrazzo stipple in 2D
      ctx.fillStyle = '#0f172a';
      for (let i = 0; i < 40; i++) {
        ctx.beginPath();
        const sx = bounds.x + ((i * 137) % 1600) - 800;
        const sy = bounds.y + ((i * 241) % 1600) - 800;
        ctx.arc(sx, sy, 8, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (room.floorMaterial === 'carpet_beige' || room.floorMaterial === 'carpet') {
      // Fine textile crosshatch
      for (let offset = -3000; offset <= 3000; offset += 90) {
        ctx.beginPath();
        ctx.moveTo(bounds.x + offset - 1000, bounds.y - 1000);
        ctx.lineTo(bounds.x + offset + 1000, bounds.y + 1000);
        ctx.stroke();
      }
    } else {
      // Tile grid
      for (let offset = -3000; offset <= 3000; offset += 300) {
        ctx.beginPath();
        ctx.moveTo(bounds.x + offset, bounds.y - 3000);
        ctx.lineTo(bounds.x + offset, bounds.y + 3000);
        ctx.moveTo(bounds.x - 3000, bounds.y + offset);
        ctx.lineTo(bounds.x + 3000, bounds.y + offset);
        ctx.stroke();
      }
    }

    ctx.globalAlpha = 1.0;

    // Room Label & Area Badge
    const centroid = calculatePolygonCentroid(room.points);
    const areaM2 = calculatePolygonArea(room.points) / 1_000_000;
    const perimM = calculatePolygonPerimeter(room.points) / 1_000;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Badge background
    const nameText = room.name || 'Habitación';
    const areaText = `${areaM2.toFixed(2).replace('.', ',')} m²  ·  P: ${perimM.toFixed(1).replace('.', ',')} m`;

    ctx.font = 'bold 150px Inter, sans-serif';
    const nameWidth = ctx.measureText(nameText).width;
    ctx.font = '110px Inter, sans-serif';
    const areaWidth = ctx.measureText(areaText).width;
    const badgeW = Math.max(nameWidth, areaWidth) + 200;
    const badgeH = 340;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
    ctx.strokeStyle = 'rgba(203, 213, 225, 0.8)';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.roundRect(centroid.x - badgeW / 2, centroid.y - badgeH / 2, badgeW, badgeH, 30);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 130px Inter, sans-serif';
    ctx.fillText(nameText, centroid.x, centroid.y - 45);

    ctx.fillStyle = '#64748b';
    ctx.font = '500 100px Inter, sans-serif';
    ctx.fillText(areaText, centroid.x, centroid.y + 65);

    // Selected room visual indicator
    if (isSelected) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(room.points[0].x, room.points[0].y);
      for (let i = 1; i < room.points.length; i++) {
        ctx.lineTo(room.points[i].x, room.points[i].y);
      }
      ctx.closePath();
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 20;
      ctx.setLineDash([40, 20]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.restore();
    }

    ctx.restore();
  }

  // Helper: Draw Wall
  function drawWall(
    ctx: CanvasRenderingContext2D,
    wall: Wall,
    isSelected: boolean,
    unit: any
  ) {
    const len = distance(wall.start, wall.end);
    if (len < 1) return;

    const angle = Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x);
    const normalX = -Math.sin(angle) * (wall.thickness / 2);
    const normalY = Math.cos(angle) * (wall.thickness / 2);

    ctx.save();

    // Wall body polygon
    ctx.beginPath();
    ctx.moveTo(wall.start.x + normalX, wall.start.y + normalY);
    ctx.lineTo(wall.end.x + normalX, wall.end.y + normalY);
    ctx.lineTo(wall.end.x - normalX, wall.end.y - normalY);
    ctx.lineTo(wall.start.x - normalX, wall.start.y - normalY);
    ctx.closePath();

    ctx.fillStyle = isSelected ? '#bae6fd' : '#1e293b';
    ctx.fill();
    ctx.strokeStyle = isSelected ? '#0284c7' : '#0f172a';
    ctx.lineWidth = isSelected ? 24 : 14;
    ctx.stroke();

    // Wall Center line (subtle CAD line)
    ctx.strokeStyle = isSelected ? '#0369a1' : '#475569';
    ctx.lineWidth = 4;
    ctx.setLineDash([40, 20]);
    ctx.beginPath();
    ctx.moveTo(wall.start.x, wall.start.y);
    ctx.lineTo(wall.end.x, wall.end.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Wall endpoints nodes
    ctx.fillStyle = isSelected ? '#0284c7' : '#64748b';
    ctx.beginPath();
    ctx.arc(wall.start.x, wall.start.y, wall.thickness / 2.5, 0, Math.PI * 2);
    ctx.arc(wall.end.x, wall.end.y, wall.thickness / 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Length label along wall
    const midX = (wall.start.x + wall.end.x) / 2;
    const midY = (wall.start.y + wall.end.y) / 2;
    const labelDist = normalX * 2.2;
    const labelDistY = normalY * 2.2;

    const lenStr = formatMeasurement(len, unit);

    ctx.save();
    ctx.translate(midX + labelDist, midY + labelDistY);
    let rot = angle;
    if (rot > Math.PI / 2 || rot < -Math.PI / 2) {
      rot += Math.PI;
    }
    ctx.rotate(rot);

    ctx.font = '600 100px Inter, sans-serif';
    const textW = ctx.measureText(lenStr).width;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillRect(-textW / 2 - 20, -60, textW + 40, 110);
    ctx.fillStyle = '#334155';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(lenStr, 0, 0);

    ctx.restore();
    ctx.restore();
  }

  // Helper: Draw Openings (Doors & Windows)
  function drawOpening(
    ctx: CanvasRenderingContext2D,
    opening: Opening,
    wall: Wall,
    isSelected: boolean
  ) {
    const wallLen = distance(wall.start, wall.end);
    if (wallLen < 1) return;

    const dirX = (wall.end.x - wall.start.x) / wallLen;
    const dirY = (wall.end.y - wall.start.y) / wallLen;
    const normalX = -dirY;
    const normalY = dirX;

    const centerX = wall.start.x + dirX * opening.distanceAlongWall;
    const centerY = wall.start.y + dirY * opening.distanceAlongWall;

    const halfW = opening.width / 2;
    const startX = centerX - dirX * halfW;
    const startY = centerY - dirY * halfW;
    const endX = centerX + dirX * halfW;
    const endY = centerY + dirY * halfW;

    ctx.save();

    // Cutout opening on wall (white rectangle with borders)
    ctx.beginPath();
    ctx.moveTo(startX + normalX * (wall.thickness / 2 + 5), startY + normalY * (wall.thickness / 2 + 5));
    ctx.lineTo(endX + normalX * (wall.thickness / 2 + 5), endY + normalY * (wall.thickness / 2 + 5));
    ctx.lineTo(endX - normalX * (wall.thickness / 2 + 5), endY - normalY * (wall.thickness / 2 + 5));
    ctx.lineTo(startX - normalX * (wall.thickness / 2 + 5), startY - normalY * (wall.thickness / 2 + 5));
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Frame ends
    ctx.strokeStyle = isSelected ? '#0284c7' : '#0f172a';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(startX + normalX * (wall.thickness / 2), startY + normalY * (wall.thickness / 2));
    ctx.lineTo(startX - normalX * (wall.thickness / 2), startY - normalY * (wall.thickness / 2));
    ctx.moveTo(endX + normalX * (wall.thickness / 2), endY + normalY * (wall.thickness / 2));
    ctx.lineTo(endX - normalX * (wall.thickness / 2), endY - normalY * (wall.thickness / 2));
    ctx.stroke();

    const sideMultiplier = opening.flipSide ? -1 : 1;
    const effectiveNormalX = normalX * sideMultiplier;
    const effectiveNormalY = normalY * sideMultiplier;

    if (opening.type === 'door' || opening.type === 'french_window') {
      // Respect flipDirection (hinge on startX vs endX) and flipSide (direction of swing)
      const isFlippedDir = opening.flipDirection;
      const hingeX = isFlippedDir ? endX : startX;
      const hingeY = isFlippedDir ? endY : startY;
      const leafX = hingeX + effectiveNormalX * opening.width;
      const leafY = hingeY + effectiveNormalY * opening.width;

      // Door leaf line
      ctx.strokeStyle = isSelected ? '#0284c7' : '#0284c7';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(hingeX, hingeY);
      ctx.lineTo(leafX, leafY);
      ctx.stroke();

      // Swing arc (quarter circle)
      ctx.setLineDash([25, 20]);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 8;
      ctx.beginPath();
      const angleAlongWall = isFlippedDir
        ? Math.atan2(startY - endY, startX - endX)
        : Math.atan2(endY - startY, endX - startX);
      const angleNormal = Math.atan2(effectiveNormalY, effectiveNormalX);

      const diff = (angleNormal - angleAlongWall + Math.PI * 4) % (Math.PI * 2);
      const anticlockwise = diff > Math.PI;
      ctx.arc(hingeX, hingeY, opening.width, angleAlongWall, angleNormal, anticlockwise);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (opening.type === 'double_door') {
      const halfW = opening.width / 2;
      // Leaf 1 from startX
      ctx.strokeStyle = isSelected ? '#0284c7' : '#0284c7';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(startX + effectiveNormalX * halfW, startY + effectiveNormalY * halfW);
      ctx.moveTo(endX, endY);
      ctx.lineTo(endX + effectiveNormalX * halfW, endY + effectiveNormalY * halfW);
      ctx.stroke();

      // Two quarter circle arcs
      ctx.setLineDash([20, 15]);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(startX, startY, halfW, Math.atan2(dirY, dirX), Math.atan2(effectiveNormalY, effectiveNormalX), opening.flipSide);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(endX, endY, halfW, Math.atan2(-dirY, -dirX), Math.atan2(effectiveNormalY, effectiveNormalX), !opening.flipSide);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (opening.type === 'sliding_door') {
      // Sliding door: two offset panels
      ctx.strokeStyle = isSelected ? '#0284c7' : '#475569';
      ctx.lineWidth = 8;
      const thirdW = opening.width * 0.55;
      ctx.beginPath();
      ctx.moveTo(startX, startY + effectiveNormalY * 15);
      ctx.lineTo(startX + dirX * thirdW, startY + dirY * thirdW + effectiveNormalY * 15);
      ctx.moveTo(endX, endY - effectiveNormalY * 15);
      ctx.lineTo(endX - dirX * thirdW, endY - dirY * thirdW - effectiveNormalY * 15);
      ctx.stroke();
    } else if (opening.type === 'passage') {
      // Passage: open space with dashed floor line
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 4;
      ctx.setLineDash([20, 20]);
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (opening.type === 'window') {
      // Window: 3 parallel glass lines
      ctx.strokeStyle = isSelected ? '#0284c7' : '#0284c7';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.moveTo(startX + normalX * 25, startY + normalY * 25);
      ctx.lineTo(endX + normalX * 25, endY + normalY * 25);
      ctx.moveTo(startX - normalX * 25, startY - normalY * 25);
      ctx.lineTo(endX - normalX * 25, endY - normalY * 25);
      ctx.stroke();
    }

    if (isSelected && selectedIds.length === 1 && selectedIds[0] === opening.id) {
      drawHandleMark(ctx, startX, startY);
      drawHandleMark(ctx, endX, endY);
    }

    ctx.restore();
  }

  // Helper: Draw Furniture
  function drawFurniture(ctx: CanvasRenderingContext2D, item: FurnitureItem, isSelected: boolean) {
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.rotate((item.rotation * Math.PI) / 180);

    const hw = item.width / 2;
    const hd = item.depth / 2;

    // Body: rounded rectangle, or a circle for round pieces (puff, lamps)
    ctx.beginPath();
    if (item.shape === 'circle') ctx.ellipse(0, 0, hw, hd, 0, 0, Math.PI * 2);
    else ctx.roundRect(-hw, -hd, item.width, item.depth, Math.min(40, item.depth * 0.1));
    ctx.fillStyle = item.color || '#94a3b8';
    ctx.fill();
    ctx.strokeStyle = isSelected ? '#0284c7' : '#334155';
    ctx.lineWidth = isSelected ? 24 : 12;
    ctx.stroke();

    // Architectural 2D interior graphics
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.lineWidth = 10;

    if (item.category === 'salon' && item.catalogId?.includes('sofa')) {
      // Sofa cushions and backrest
      const backrestDepth = item.depth * 0.28;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
      ctx.fillRect(-hw, -hd, item.width, backrestDepth);
      ctx.strokeRect(-hw, -hd, item.width, backrestDepth);
      // Armrests
      const armW = Math.min(180, item.width * 0.12);
      ctx.strokeRect(-hw, -hd + backrestDepth, armW, item.depth - backrestDepth);
      ctx.strokeRect(hw - armW, -hd + backrestDepth, armW, item.depth - backrestDepth);
      // Cushion dividers
      const innerW = item.width - 2 * armW;
      const cCount = item.width > 2000 ? 3 : 2;
      for (let i = 1; i < cCount; i++) {
        const cx = -hw + armW + (innerW / cCount) * i;
        ctx.beginPath();
        ctx.moveTo(cx, -hd + backrestDepth);
        ctx.lineTo(cx, hd);
        ctx.stroke();
      }
    } else if (item.category === 'dormitorio' && item.catalogId?.includes('bed')) {
      // Bed headboard and pillows
      const hbDepth = 120;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
      ctx.fillRect(-hw, -hd, item.width, hbDepth);
      ctx.strokeRect(-hw, -hd, item.width, hbDepth);
      // Pillows
      const pillowW = item.width > 1200 ? (item.width - 200) / 2 : item.width - 150;
      const pillowD = 380;
      ctx.fillStyle = '#ffffff';
      if (item.width > 1200) {
        ctx.fillRect(-hw + 60, -hd + hbDepth + 40, pillowW, pillowD);
        ctx.strokeRect(-hw + 60, -hd + hbDepth + 40, pillowW, pillowD);
        ctx.fillRect(hw - pillowW - 60, -hd + hbDepth + 40, pillowW, pillowD);
        ctx.strokeRect(hw - pillowW - 60, -hd + hbDepth + 40, pillowW, pillowD);
      } else {
        ctx.fillRect(-pillowW / 2, -hd + hbDepth + 40, pillowW, pillowD);
        ctx.strokeRect(-pillowW / 2, -hd + hbDepth + 40, pillowW, pillowD);
      }
      // Duvet fold line
      ctx.beginPath();
      ctx.moveTo(-hw, hd * 0.2);
      ctx.lineTo(hw, hd * 0.2);
      ctx.stroke();
    } else if (item.category === 'comedor' && item.catalogId?.includes('table')) {
      // Dining table with corner legs indication
      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
      const legS = Math.min(80, item.depth * 0.15);
      ctx.fillRect(-hw + 20, -hd + 20, legS, legS);
      ctx.fillRect(hw - legS - 20, -hd + 20, legS, legS);
      ctx.fillRect(hw - legS - 20, hd - legS - 20, legS, legS);
      ctx.fillRect(-hw + 20, hd - legS - 20, legS, legS);
    } else if (item.category === 'bano' && item.catalogId?.includes('sink')) {
      // Bathroom basin oval inside
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(0, 0, hw * 0.7, hd * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Faucet dot
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.arc(0, -hd * 0.7, 30, 0, Math.PI * 2);
      ctx.fill();
    } else if (item.category === 'bano' && item.catalogId?.includes('toilet')) {
      // Toilet bowl + tank
      ctx.fillStyle = '#ffffff';
      // Cistern tank
      ctx.fillRect(-hw + 20, -hd + 20, item.width - 40, item.depth * 0.35);
      ctx.strokeRect(-hw + 20, -hd + 20, item.width - 40, item.depth * 0.35);
      // Bowl oval
      ctx.beginPath();
      ctx.ellipse(0, hd * 0.35, hw * 0.75, hd * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (item.catalogId === 'puff') {
      // Quilted top: inner ring + centre button
      ctx.beginPath();
      ctx.ellipse(0, 0, hw * 0.62, hd * 0.62, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.5)';
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(24, hw * 0.08), 0, Math.PI * 2);
      ctx.fill();
    } else if (item.catalogId === 'bedroom_lamp' || item.catalogId === 'floor_lamp') {
      // Lamp shade ring + pole
      ctx.beginPath();
      ctx.ellipse(0, 0, hw * 0.55, hd * 0.55, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(22, hw * 0.1), 0, Math.PI * 2);
      ctx.fill();
    } else if (item.catalogId?.endsWith('_chair')) {
      // Chair: seat outline + back rail along the rear edge
      ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
      ctx.fillRect(-hw, -hd, item.width, item.depth * 0.2);
      ctx.strokeRect(-hw, -hd, item.width, item.depth * 0.2);
      ctx.strokeRect(-hw * 0.78, -hd * 0.45, item.width * 0.78, item.depth * 0.78);
    } else if (item.catalogId === 'valet_stand') {
      // Valet stand: hanger bar + seat tray
      ctx.beginPath();
      ctx.moveTo(-hw, -hd * 0.5);
      ctx.lineTo(hw, -hd * 0.5);
      ctx.stroke();
      ctx.strokeRect(-hw * 0.7, -hd * 0.1, item.width * 0.7, item.depth * 0.6);
    } else if (item.catalogId?.endsWith('_table')) {
      // Tables: leg positions at the corners
      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
      const legS = Math.min(70, item.depth * 0.14);
      for (const [lx, ly] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        ctx.fillRect(lx * (hw - 20 - legS / 2) - legS / 2, ly * (hd - 20 - legS / 2) - legS / 2, legS, legS);
      }
    } else if (item.isParametric) {
      // Parametric cabinet layout line indication
      ctx.setLineDash([30, 20]);
      ctx.beginPath();
      ctx.moveTo(-hw, -hd);
      ctx.lineTo(hw, hd);
      ctx.moveTo(-hw, hd);
      ctx.lineTo(hw, -hd);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Name label
    ctx.fillStyle = '#0f172a';
    ctx.font = '600 110px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.name, 0, 0);

    // Dimension subtext (e.g. 2200 x 900)
    ctx.fillStyle = '#475569';
    ctx.font = '500 85px Inter, sans-serif';
    ctx.fillText(`${item.width} × ${item.depth} mm`, 0, 110);

    // Selection Handles (Bounding Box Gizmo)
    if (isSelected) {
      // Bounding box dashed frame
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 16;
      ctx.setLineDash([40, 30]);
      ctx.strokeRect(-hw - FRAME_MARGIN, -hd - FRAME_MARGIN, item.width + 2 * FRAME_MARGIN, item.depth + 2 * FRAME_MARGIN);
      ctx.setLineDash([]);

      // Resize handles + rotation knob (single selection only)
      if (selectedIds.length === 1 && selectedIds[0] === item.id) {
        for (const id of HANDLE_IDS) {
          const { sx, sy } = HANDLE_DIRS[id];
          drawHandleMark(ctx, sx * (hw + FRAME_MARGIN), sy * (hd + FRAME_MARGIN));
        }

        const knob = rotateKnobLocal(hw, hd, zoom);
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 1.5 / zoom;
        ctx.beginPath();
        ctx.moveTo(hw + FRAME_MARGIN, -hd - FRAME_MARGIN);
        ctx.lineTo(knob.x, knob.y);
        ctx.stroke();

        ctx.fillStyle = '#0284c7';
        ctx.beginPath();
        ctx.arc(knob.x, knob.y, (HANDLE_DRAW_PX + 2) / zoom, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  // Helper: Draw Dynamic Orthogonal Dimension Ray
  function drawDynamicDimension(ctx: CanvasRenderingContext2D, dim: DynamicDimension) {
    ctx.save();

    // Witness and dimension line
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 10;
    ctx.setLineDash([30, 20]);
    ctx.beginPath();
    ctx.moveTo(dim.start.x, dim.start.y);
    ctx.lineTo(dim.end.x, dim.end.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Ticks at ends
    const tickLen = 40;
    if (dim.orientation === 'horizontal') {
      ctx.beginPath();
      ctx.moveTo(dim.start.x, dim.start.y - tickLen);
      ctx.lineTo(dim.start.x, dim.start.y + tickLen);
      ctx.moveTo(dim.end.x, dim.end.y - tickLen);
      ctx.lineTo(dim.end.x, dim.end.y + tickLen);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(dim.start.x - tickLen, dim.start.y);
      ctx.lineTo(dim.start.x + tickLen, dim.start.y);
      ctx.moveTo(dim.end.x - tickLen, dim.end.y);
      ctx.lineTo(dim.end.x + tickLen, dim.end.y);
      ctx.stroke();
    }

    // Interactive clickable measurement pill badge at midpoint
    const midX = (dim.start.x + dim.end.x) / 2;
    const midY = (dim.start.y + dim.end.y) / 2;

    ctx.font = 'bold 95px Inter, sans-serif';
    const textW = ctx.measureText(dim.label).width;
    const badgeW = textW + 120;
    const badgeH = 140;

    ctx.fillStyle = '#0284c7';
    ctx.beginPath();
    ctx.roundRect(midX - badgeW / 2, midY - badgeH / 2, badgeW, badgeH, 30);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(dim.label, midX, midY);

    ctx.restore();
  }

  // Helper: Draw Manual Dimension line
  function drawDimensionLine(
    ctx: CanvasRenderingContext2D,
    start: Point2D,
    end: Point2D,
    label: string,
    color: string = '#64748b',
    isSelected: boolean = false
  ) {
    ctx.save();
    ctx.strokeStyle = isSelected ? '#0284c7' : color;
    ctx.lineWidth = isSelected ? 16 : 10;

    // Line
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    // Arrows or 45-deg ticks at terminals
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const tickLen = 50;

    ctx.beginPath();
    ctx.moveTo(start.x - Math.cos(angle + Math.PI / 4) * tickLen, start.y - Math.sin(angle + Math.PI / 4) * tickLen);
    ctx.lineTo(start.x + Math.cos(angle + Math.PI / 4) * tickLen, start.y + Math.sin(angle + Math.PI / 4) * tickLen);
    ctx.moveTo(end.x - Math.cos(angle + Math.PI / 4) * tickLen, end.y - Math.sin(angle + Math.PI / 4) * tickLen);
    ctx.lineTo(end.x + Math.cos(angle + Math.PI / 4) * tickLen, end.y + Math.sin(angle + Math.PI / 4) * tickLen);
    ctx.stroke();

    // Text Badge
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    ctx.font = '600 100px Inter, sans-serif';
    const textW = ctx.measureText(label).width;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(midX - textW / 2 - 30, midY - 60, textW + 60, 120);
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.strokeRect(midX - textW / 2 - 30, midY - 60, textW + 60, 120);

    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, midX, midY);

    ctx.restore();
  }

  /** Ruler between two points: distance label plus the horizontal / vertical legs. Constant on-screen size. */
  function drawMeasurement(ctx: CanvasRenderingContext2D, a: Point2D, b: Point2D) {
    const px = 1 / zoom;
    const dist = distance(a, b);

    ctx.save();
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 2 * px;

    // Legs (dx, dy) as a light dashed right triangle
    ctx.setLineDash([6 * px, 5 * px]);
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);

    // Main line
    ctx.lineWidth = 2.5 * px;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    // End points
    ctx.fillStyle = '#ffffff';
    for (const pt of [a, b]) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4.5 * px, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Distance label
    if (dist > 1) {
      const label = formatMeasurement(dist, project.unit);
      ctx.font = `700 ${13 * px}px Inter, sans-serif`;
      const w = ctx.measureText(label).width;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      ctx.fillStyle = '#b45309';
      ctx.beginPath();
      ctx.roundRect(mx - w / 2 - 8 * px, my - 22 * px, w + 16 * px, 22 * px, 5 * px);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, mx, my - 11 * px);
    }
    ctx.restore();
  }

  /** Alignment guides (magenta) shown while a piece is magnetised to another piece or a wall face. */
  function drawSnapGuides(ctx: CanvasRenderingContext2D, guides: SnapGuide[]) {
    if (guides.length === 0) return;
    const px = 1 / zoom;
    ctx.save();
    ctx.strokeStyle = '#d946ef';
    ctx.lineWidth = 1.5 * px;
    ctx.setLineDash([6 * px, 4 * px]);
    for (const g of guides) {
      ctx.beginPath();
      if (g.axis === 'x') {
        ctx.moveTo(g.value, g.from);
        ctx.lineTo(g.value, g.to);
      } else {
        ctx.moveTo(g.from, g.value);
        ctx.lineTo(g.to, g.value);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Room / wall handles go on a top layer: walls are painted after rooms and would hide them. */
  function drawEditHandles(ctx: CanvasRenderingContext2D) {
    if (selectedIds.length !== 1) return;
    const id = selectedIds[0];

    const room = project.rooms.find((r) => r.id === id);
    if (room && project.layers.rooms) {
      if (isAxisAlignedRect(room.points)) {
        for (const h of roomBoxHandlePoints(room.points)) drawHandleMark(ctx, h.point.x, h.point.y);
      } else {
        for (const pt of room.points) drawHandleMark(ctx, pt.x, pt.y, 'circle');
      }
    }

    const wall = project.walls.find((w) => w.id === id);
    if (wall && project.layers.walls) {
      drawHandleMark(ctx, wall.start.x, wall.start.y, 'circle');
      drawHandleMark(ctx, wall.end.x, wall.end.y, 'circle');
    }
  }

  /** Live size read-out next to the cursor while resizing a room or an opening. */
  function drawResizeReadout(ctx: CanvasRenderingContext2D) {
    if (dragMode !== 'resize' || !handleDrag) return;

    let text: string | null = null;
    if (handleDrag.kind === 'room_box' || handleDrag.kind === 'room_vertex') {
      const room = project.rooms.find((r) => r.id === handleDrag.id);
      if (room) {
        const b = getBoundingBox(room.points);
        text = `${formatMeasurement(b.maxX - b.minX, project.unit)} × ${formatMeasurement(b.maxY - b.minY, project.unit)}`;
      }
    } else if (handleDrag.kind === 'opening_end') {
      const op = project.openings.find((o) => o.id === handleDrag.id);
      if (op) text = formatMeasurement(op.width, project.unit);
    }
    if (!text) return;

    ctx.save();
    ctx.translate(currentMouseWorld.x, currentMouseWorld.y - 26 / zoom);
    ctx.font = `600 ${13 / zoom}px Inter, sans-serif`;
    const w = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.beginPath();
    ctx.roundRect(-w / 2 - 8 / zoom, -11 / zoom, w + 16 / zoom, 22 / zoom, 5 / zoom);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  // Helper: In-Progress Tool Previews
  function drawInteractivePreviews(ctx: CanvasRenderingContext2D) {
    // 1. Measurement (live while picking the second point, fixed once picked)
    if (activeTool === 'measure_distance' && measureStart) {
      drawMeasurement(ctx, measureStart, measureEnd ?? currentMouseWorld);
    }

    // 2. Ghost furniture placement preview (magnetised to pieces / walls, like a drag)
    if (activeTool === 'place_furniture' && pendingFurnitureCatalogId) {
      const cat = FURNITURE_CATALOG.find((c) => c.id === pendingFurnitureCatalogId);
      if (cat) {
        const ghost = snapGhost(cat.defaultWidth, cat.defaultDepth, currentMouseWorld, altHeld);
        ctx.save();
        ctx.translate(ghost.pos.x, ghost.pos.y);
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = cat.defaultColor;
        ctx.fillRect(-cat.defaultWidth / 2, -cat.defaultDepth / 2, cat.defaultWidth, cat.defaultDepth);
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 16;
        ctx.strokeRect(-cat.defaultWidth / 2, -cat.defaultDepth / 2, cat.defaultWidth, cat.defaultDepth);
        ctx.restore();
        drawSnapGuides(ctx, ghost.guides);
      }
    }

    // 3. Ghost opening (door/window) preview snapped to the nearest wall, with its real size
    if (activeTool === 'place_opening' && pendingOpeningType) {
      const plan = planOpeningPlacement(project.walls, pendingOpeningType, currentMouseWorld);
      const def = OPENING_CATALOG.find((o) => o.type === pendingOpeningType);
      if (plan && def) {
        drawOpening(ctx, { id: 'ghost-opening', ...plan.opening }, plan.wall, true);

        const px = 1 / zoom;
        ctx.save();
        // Dashed guide from the cursor to its position on the wall
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 1.5 * px;
        ctx.setLineDash([6 * px, 4 * px]);
        ctx.beginPath();
        ctx.moveTo(currentMouseWorld.x, currentMouseWorld.y);
        ctx.lineTo(plan.anchor.x, plan.anchor.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Badge
        const badge = `Clic para colocar: ${def.name} (${plan.opening.distanceAlongWall} mm)`;
        ctx.font = `700 ${12 * px}px Inter, sans-serif`;
        const tw = ctx.measureText(badge).width;
        ctx.fillStyle = '#0284c7';
        ctx.beginPath();
        ctx.roundRect(plan.anchor.x - tw / 2 - 8 * px, plan.anchor.y - 40 * px, tw + 16 * px, 22 * px, 5 * px);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(badge, plan.anchor.x, plan.anchor.y - 29 * px);
        ctx.restore();
      }
    }
  }

  // ================= MOUSE & INTERACTION EVENT HANDLERS =================

  /** Magnetises a piece of the given size, centred at `at`, to other pieces / wall faces. */
  const snapGhost = (width: number, depth: number, at: Point2D, disabled: boolean): { pos: Point2D; guides: SnapGuide[] } => {
    if (!project.snapEnabled || disabled) return { pos: at, guides: [] };
    const rect = rectOfBox({ x: at.x, y: at.y, width, depth, rotation: 0 });
    const r = snapRect(rect, collectSnapLines(project, new Set()), OBJECT_SNAP_PX / zoom);
    return { pos: { x: at.x + r.dx, y: at.y + r.dy }, guides: r.guides };
  };

  /**
   * Handle of the selected object under `world`, if any (closest within the on-screen
   * tolerance). Only a single selection exposes handles.
   */
  const findHandleAt = (world: Point2D): { drag: HandleDrag; point: Point2D } | null => {
    if (selectedIds.length !== 1) return null;
    const id = selectedIds[0];
    const candidates: Array<{ drag: HandleDrag; point: Point2D }> = [];

    const item = project.furniture.find((f) => f.id === id);
    if (item && project.layers.furniture) {
      const init: Box = { x: item.x, y: item.y, width: item.width, depth: item.depth, rotation: item.rotation };
      for (const h of furnitureHandlePoints(init)) {
        candidates.push({ point: h.point, drag: { kind: 'furniture', id, handle: h.id, init } });
      }
    }

    const room = project.rooms.find((r) => r.id === id);
    if (room && project.layers.rooms) {
      const init = room.points.map((pt) => ({ ...pt }));
      if (isAxisAlignedRect(room.points)) {
        for (const h of roomBoxHandlePoints(room.points)) {
          candidates.push({ point: h.point, drag: { kind: 'room_box', id, handle: h.id, init } });
        }
      } else {
        room.points.forEach((pt, index) => candidates.push({ point: pt, drag: { kind: 'room_vertex', id, index, init } }));
      }
    }

    const wall = project.walls.find((w) => w.id === id);
    if (wall && project.layers.walls) {
      candidates.push({ point: wall.start, drag: { kind: 'wall_end', id, end: 'start' } });
      candidates.push({ point: wall.end, drag: { kind: 'wall_end', id, end: 'end' } });
    }

    const opening = project.openings.find((o) => o.id === id);
    const openingWall = opening && project.walls.find((w) => w.id === opening.wallId);
    if (opening && openingWall && project.layers.walls) {
      const len = distance(openingWall.start, openingWall.end);
      if (len > 1) {
        const at = (d: number): Point2D => ({
          x: openingWall.start.x + ((openingWall.end.x - openingWall.start.x) * d) / len,
          y: openingWall.start.y + ((openingWall.end.y - openingWall.start.y) * d) / len,
        });
        const init = { distanceAlongWall: opening.distanceAlongWall, width: opening.width };
        candidates.push({ point: at(opening.distanceAlongWall - opening.width / 2), drag: { kind: 'opening_end', id, end: 'start', init } });
        candidates.push({ point: at(opening.distanceAlongWall + opening.width / 2), drag: { kind: 'opening_end', id, end: 'end', init } });
      }
    }

    const tolerance = HANDLE_HIT_PX / zoom;
    let best: { drag: HandleDrag; point: Point2D } | null = null;
    let bestDist = tolerance;
    for (const c of candidates) {
      const d = distance(world, c.point);
      if (d <= bestDist) {
        best = c;
        bestDist = d;
      }
    }
    return best;
  };

  /** Applies a handle drag. `pointer` is the grab-compensated cursor, `snapped` its snapped version. */
  const applyHandleDrag = (drag: HandleDrag, pointer: Point2D, snapped: Point2D, invertAspect: boolean) => {
    switch (drag.kind) {
      case 'furniture': {
        const item = project.furniture.find((f) => f.id === drag.id);
        if (!item) return;
        // Corner handles follow the piece's "lock proportions" setting; Shift inverts it.
        const round = item.shape === 'circle';
        const r = resizeFurniture(drag.init, drag.handle, pointer, {
          keepAspect: round || item.lockProportions !== invertAspect,
          square: round,
        });
        updateFurniture(drag.id, { x: r.x, y: r.y, width: r.width, depth: r.depth });
        return;
      }
      case 'room_box':
        setRoomPoints(drag.id, resizeRoomBox(drag.init, drag.handle, snapped));
        return;
      case 'room_vertex':
        setRoomPoints(drag.id, moveRoomVertex(drag.init, drag.index, snapped));
        return;
      case 'wall_end': {
        const wall = project.walls.find((w) => w.id === drag.id);
        if (!wall) return;
        const other = drag.end === 'start' ? wall.end : wall.start;
        if (distance(other, snapped) < MIN_WALL_LENGTH) return;
        updateWall(drag.id, { [drag.end]: { x: Math.round(snapped.x), y: Math.round(snapped.y) } });
        return;
      }
      case 'opening_end':
      case 'opening_move': {
        const op = project.openings.find((o) => o.id === drag.id);
        const wall = op && project.walls.find((w) => w.id === op.wallId);
        if (!op || !wall) return;
        const len = distance(wall.start, wall.end);
        const s = projectPointOnSegment(pointer, wall.start, wall.end).t * len;
        if (drag.kind === 'opening_end') updateOpening(drag.id, resizeOpeningEnd(drag.init, drag.end, s, len));
        else updateOpening(drag.id, { distanceAlongWall: moveOpeningAlongWall(len, op.width, s - drag.grab) });
        return;
      }
    }
  };

  /** True once the pointer has moved far enough from the press point to count as a drag. */
  const pastDragThreshold = (e: React.MouseEvent) => {
    if (dragStarted.current) return true;
    const o = pressOrigin.current;
    if (o && Math.hypot(e.clientX - o.x, e.clientY - o.y) < DRAG_THRESHOLD_PX) return false;
    dragStarted.current = true;
    return true;
  };

  /**
   * Forget what a previous move gesture grabbed. These snapshots drive the move branch of mousemove, so a
   * stale one (e.g. a room that was only *clicked*) would drag along with the next gesture.
   */
  const clearMoveSnapshots = () => {
    setInitialItemTransforms(new Map());
    setInitialRoomPoints(new Map());
    setInitialWallEndpoints(new Map());
  };

  /** Ends any move / rotate / handle drag, committing it as ONE undo step. */
  const endDrag = () => {
    if (dragMode !== 'none') {
      pushHistorySnapshot();
      setDragMode('none');
      clearMoveSnapshots();
      setHandleDrag(null);
    }
    setSnapGuides([]);
    pressOrigin.current = null;
    dragStarted.current = false;
    dragSnapTargets.current = null;
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Close any pending keyboard / inspector edit as its own undo step before starting a gesture.
    pushHistorySnapshot();

    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const rawWorld = screenToWorld(screenX, screenY);

    // Magnetic snap application
    const world = snapWorld(rawWorld);

    // Middle click or Pan tool active
    if (e.button === 1 || activeTool === 'pan') {
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
      return;
    }

    // Tool: Measure distance. 1st click = start, 2nd click = end (stays on screen), 3rd click = new measurement.
    if (activeTool === 'measure_distance') {
      if (!measureStart || measureEnd) {
        setMeasureStart(world);
        setMeasureEnd(null);
      } else if (distance(measureStart, world) > 1) {
        setMeasureEnd(world);
      }
      return;
    }

    // Tool: Place Furniture from catalog
    if (activeTool === 'place_furniture' && pendingFurnitureCatalogId) {
      const cat = FURNITURE_CATALOG.find((c) => c.id === pendingFurnitureCatalogId);
      if (cat) {
        const placed = snapGhost(cat.defaultWidth, cat.defaultDepth, world, e.altKey).pos;
        addFurniture(furnitureFromCatalog(cat, placed));
      }
      setPendingFurnitureCatalogId(null);
      setActiveTool('select');
      return;
    }

    // Tool: Place Opening on Wall (uses the catalog's real size for the chosen type)
    if (activeTool === 'place_opening' && pendingOpeningType) {
      const plan = planOpeningPlacement(project.walls, pendingOpeningType, world);
      if (plan) {
        const newOp: Opening = { id: newId('op'), ...plan.opening };
        addOpening(newOp);
        selectObject(newOp.id);
        setPendingOpeningType(null);
        setActiveTool('select');
      }
      return;
    }

    // Tool: Select mode (Click objects, check dynamic dimension pills, handles)
    if (activeTool === 'select') {
      pressOrigin.current = { x: e.clientX, y: e.clientY };
      dragStarted.current = false;

      // Check if clicked on rotation handle of selected item
      if (selectedIds.length === 1) {
        const item = project.furniture.find((f) => f.id === selectedIds[0]);
        if (item) {
          const rad = (item.rotation * Math.PI) / 180;
          const knob = rotateKnobLocal(item.width / 2, item.depth / 2, zoom);
          const rotKnobWorld = {
            x: item.x + knob.x * Math.cos(rad) - knob.y * Math.sin(rad),
            y: item.y + knob.x * Math.sin(rad) + knob.y * Math.cos(rad),
          };

          if (distance(rawWorld, rotKnobWorld) < HANDLE_HIT_PX / zoom) {
            setDragMode('rotate');
            setDragStartWorld(rawWorld);
            const initialMap = new Map();
            initialMap.set(item.id, {
              x: item.x,
              y: item.y,
              rotation: item.rotation,
              width: item.width,
              depth: item.depth,
            });
            setInitialItemTransforms(initialMap);
            return;
          }
        }
      }

      // Handles of the selected object win over any body underneath
      const grabbed = findHandleAt(rawWorld);
      if (grabbed) {
        handleGrab.current = { x: rawWorld.x - grabbed.point.x, y: rawWorld.y - grabbed.point.y };

        const drag = grabbed.drag;
        const wall = drag.kind === 'wall_end' ? project.walls.find((w) => w.id === drag.id) : undefined;
        const own = drag.kind === 'room_box' || drag.kind === 'room_vertex' ? drag.init : wall ? [wall.start, wall.end] : [];
        dragSnapTargets.current = getSnapTargets().filter((t) => !own.some((o) => distance(o, t) < 80));

        setHandleDrag(drag);
        setDragMode('resize');
        return;
      }

      // Dynamic dimension badges (click to type an exact separation). They come AFTER the handles so a badge
      // sitting next to a handle can't swallow the click, and their hit area is the label itself (screen px).
      for (const dim of activeDynamicDims) {
        const midX = (dim.start.x + dim.end.x) / 2;
        const midY = (dim.start.y + dim.end.y) / 2;
        if (Math.abs(rawWorld.x - midX) * zoom <= BADGE_HALF_W_PX && Math.abs(rawWorld.y - midY) * zoom <= BADGE_HALF_H_PX) {
          setDimensionEditTarget(dim);
          return;
        }
      }

      // What is under the cursor? (layer-aware, see hitTest.ts)
      const hit = hitTest(project, rawWorld, { zoom, selectedIds });
      if (hit) {
        const isMulti = e.shiftKey || e.ctrlKey || e.metaKey;
        const alreadySelected = selectedIds.includes(hit.id);

        if (hit.type === 'furniture') {
          // Shift/Ctrl-click toggles; if that deselects the piece there is nothing to drag.
          if (isMulti && alreadySelected) {
            selectObject(hit.id, true);
            return;
          }

          // Pressing a piece that belongs to a multi-selection keeps the group (so it can be dragged
          // together); the selection collapses to this piece only if the press ends without a drag.
          const keepGroup = !isMulti && alreadySelected && selectedIds.length > 1;
          if (keepGroup) collapseTo.current = hit.id;
          else selectObject(hit.id, isMulti);

          const movingIds = keepGroup ? selectedIds : isMulti ? [...selectedIds, hit.id] : [hit.id];
          const initialMap = new Map();
          for (const item of project.furniture) {
            if (movingIds.includes(item.id)) {
              initialMap.set(item.id, { x: item.x, y: item.y, rotation: item.rotation, width: item.width, depth: item.depth });
            }
          }
          setDragMode('move');
          setDragStartWorld(world);
          setLastDragWorld(world);
          clearMoveSnapshots();
          setInitialItemTransforms(initialMap);
          return;
        }

        if (hit.type === 'opening') {
          selectObject(hit.id, isMulti);
          const op = project.openings.find((o) => o.id === hit.id);
          const wall = op && project.walls.find((w) => w.id === op.wallId);
          if (op && wall && !isMulti) {
            // Dragging an opening slides it along its wall
            const s = projectPointOnSegment(rawWorld, wall.start, wall.end).t * distance(wall.start, wall.end);
            handleGrab.current = { x: 0, y: 0 };
            setHandleDrag({ kind: 'opening_move', id: op.id, grab: s - op.distanceAlongWall });
            setDragMode('resize');
          }
          return;
        }

        if (hit.type === 'wall') {
          const wall = project.walls.find((w) => w.id === hit.id)!;
          selectObject(hit.id, isMulti);
          setDragMode('move');
          setDragStartWorld(world);
          setLastDragWorld(world);
          setInitialItemTransforms(new Map());
          setInitialRoomPoints(new Map());
          setInitialWallEndpoints(new Map([[wall.id, { start: { ...wall.start }, end: { ...wall.end } }]]));
          return;
        }

        // room
        const room = project.rooms.find((r) => r.id === hit.id)!;
        selectObject(hit.id, isMulti);
        setDragMode('move');
        setDragStartWorld(world);
        setLastDragWorld(world);
        setInitialItemTransforms(new Map());
        setInitialWallEndpoints(new Map());
        setInitialRoomPoints(new Map([[room.id, [...room.points]]]));
        return;
      }

      // Empty space clicked -> clear selection
      clearSelection();
      setDimensionEditTarget(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const rawWorld = screenToWorld(screenX, screenY);

    // Snap cursor position for status bar
    const world = snapWorld(rawWorld);

    setCursorWorldPos(world);
    setCurrentMouseWorld(world);
    setAltHeld(e.altKey);

    // Pan canvas
    if (isPanning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      setPanOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      setPanStart({ x: e.clientX, y: e.clientY });
      return;
    }

    // Hover feedback: resize cursor over the selected object's handles
    if (dragMode === 'none' && activeTool === 'select') {
      const hover = findHandleAt(rawWorld);
      setHoverCursor(hover ? cursorForDrag(hover.drag) : null);
    }

    // Handle drags: resize / vertex / wall end / opening
    if (dragMode === 'resize' && handleDrag) {
      if (!pastDragThreshold(e)) return;
      const pointer = { x: rawWorld.x - handleGrab.current.x, y: rawWorld.y - handleGrab.current.y };
      applyHandleDrag(handleDrag, pointer, snapWorld(pointer, dragSnapTargets.current ?? undefined), e.shiftKey);
      return;
    }

    // Drag move furniture, rooms, walls
    if (dragMode === 'move') {
      if (!pastDragThreshold(e)) return;
      const dx = world.x - lastDragWorld.x;
      const dy = world.y - lastDragWorld.y;
      setLastDragWorld(world);

      if (dx !== 0 || dy !== 0) {
        // Absolute from the position at drag start: no stale `project` and no
        // rounding drift accumulating on every mouse event.
        if (initialItemTransforms.size > 0) {
          const proposed = [...initialItemTransforms].map(([id, init]) => ({
            id,
            init,
            x: init.x + (world.x - dragStartWorld.x),
            y: init.y + (world.y - dragStartWorld.y),
          }));

          // Magnetism: the group's bounding box is pulled flush to nearby pieces / wall faces.
          let shift = { x: 0, y: 0 };
          let guides: SnapGuide[] = [];
          if (project.snapEnabled && !e.altKey) {
            const rects = proposed.map((p) =>
              rectOfBox({ x: p.x, y: p.y, width: p.init.width, depth: p.init.depth, rotation: p.init.rotation })
            );
            const group = {
              minX: Math.min(...rects.map((r) => r.minX)),
              maxX: Math.max(...rects.map((r) => r.maxX)),
              minY: Math.min(...rects.map((r) => r.minY)),
              maxY: Math.max(...rects.map((r) => r.maxY)),
            };
            const snap = snapRect(group, collectSnapLines(project, new Set(initialItemTransforms.keys())), OBJECT_SNAP_PX / zoom);
            shift = { x: snap.dx, y: snap.dy };
            guides = snap.guides;
          }
          setSnapGuides(guides);

          for (const p of proposed) {
            updateFurniture(p.id, { x: Math.round(p.x + shift.x), y: Math.round(p.y + shift.y) });
          }
        }

        initialRoomPoints.forEach((_, id) => {
          moveRoom(id, dx, dy);
        });

        initialWallEndpoints.forEach((_, id) => {
          moveWall(id, dx, dy);
        });
      }
      return;
    }

    // Drag rotate furniture
    if (dragMode === 'rotate' && selectedIds.length === 1) {
      const id = selectedIds[0];
      const init = initialItemTransforms.get(id);
      if (init) {
        const curAngle = angleDeg({ x: init.x, y: init.y }, world);
        // Keep the knob under the cursor: subtract the knob's own angle in the piece's local frame
        const knob = rotateKnobLocal(init.width / 2, init.depth / 2, zoom);
        const knobAngle = (Math.atan2(knob.y, knob.x) * 180) / Math.PI;
        let newRot = Math.round((curAngle - knobAngle) % 360);
        if (newRot < 0) newRot += 360;

        // Snap rotation to 15 degrees if shift key is pressed or snap is enabled
        if (project.snapEnabled || e.shiftKey) {
          newRot = Math.round(newRot / 15) * 15;
        }

        updateFurniture(id, { rotation: newRot });
      }
    }
  };

  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
    }
    if (collapseTo.current && !dragStarted.current) selectObject(collapseTo.current);
    collapseTo.current = null;
    endDrag();

  };

  // Releasing the button outside the canvas would otherwise leave a drag stuck.
  const handleMouseLeave = () => {
    collapseTo.current = null;
    setHoverCursor(null);
    setIsPanning(false);
    endDrag();
  };

  // Wheel zoom centred on the cursor. Registered natively as non-passive: React's
  // onWheel is passive, so preventDefault() there is ignored (and logs an error).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const { zoom: prevZoom, panOffset: prevPan, setZoom: applyZoom, setPanOffset: applyPan } =
        useEditorStore.getState();
      const newZoom = Math.max(0.02, Math.min(2.0, prevZoom * (e.deltaY < 0 ? 1.15 : 0.85)));

      // Keep the point under the cursor fixed in world space
      applyZoom(newZoom);
      applyPan({
        x: mouseX - (mouseX - prevPan.x) * (newZoom / prevZoom),
        y: mouseY - (mouseY - prevPan.y) * (newZoom / prevZoom),
      });
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, []);

  // Leaving the measure tool (by any means, incl. Esc handled in App) discards the measurement.
  useEffect(() => {
    if (activeTool !== 'measure_distance') {
      setMeasureStart(null);
      setMeasureEnd(null);
    }
  }, [activeTool]);

  // Text of the banner while measuring: instructions, then the picked distance
  const measureText = (() => {
    if (!measureStart) return 'Medir: haz clic en el primer punto';
    if (!measureEnd) return 'Haz clic en el segundo punto';
    const d = distance(measureStart, measureEnd);
    const u = project.unit;
    return `Distancia: ${formatMeasurement(d, u)}  ·  ΔX ${formatMeasurement(Math.abs(measureEnd.x - measureStart.x), u)}  ·  ΔY ${formatMeasurement(Math.abs(measureEnd.y - measureStart.y), u)}  ·  clic para medir de nuevo`;
  })();

  const cursor =
    dragMode === 'resize' && handleDrag
      ? cursorForDrag(handleDrag)
      : dragMode === 'move'
        ? 'move'
        : dragMode === 'rotate'
          ? 'grabbing'
          : (hoverCursor ?? undefined);

  // Contextual hint for the selected object: what can be done with the mouse
  const selectionHint = useMemo(() => {
    if (activeTool !== 'select' || selectedIds.length !== 1) return null;
    const id = selectedIds[0];
    if (project.furniture.some((f) => f.id === id))
      return 'Arrastra para mover (Alt: sin imán) · flechas para ajustar · asas para el tamaño (Shift: proporciones) · ● para girar';
    const room = project.rooms.find((r) => r.id === id);
    if (room)
      return isAxisAlignedRect(room.points)
        ? 'Arrastra para mover · flechas para ajustar · asas para cambiar las dimensiones'
        : 'Arrastra para mover · arrastra un vértice para deformar';
    if (project.walls.some((w) => w.id === id)) return 'Arrastra para mover · arrastra un extremo para cambiar la longitud';
    if (project.openings.some((o) => o.id === id)) return 'Arrastra para desplazar por el muro · asas laterales para cambiar el ancho';
    return null;
  }, [activeTool, selectedIds, project.furniture, project.rooms, project.walls, project.openings]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-slate-50 select-none cursor-crosshair"
      style={{ cursor }}
    >
      {/* Active Tool Guidance Banner */}
      {activeTool !== 'select' && activeTool !== 'pan' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-slate-900/90 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-lg backdrop-blur-xs flex items-center gap-2 border border-slate-700 pointer-events-none whitespace-nowrap">
          <span className="w-2 h-2 rounded-full bg-sky-400"></span>
          <span>
            {activeTool === 'place_opening' && `Acerca el cursor a cualquier pared para insertar ${pendingOpeningType?.replace('_', ' ')}`}
            {activeTool === 'place_furniture' && 'Haz clic en el plano para colocar el mueble'}
            {activeTool === 'measure_distance' && measureText}
          </span>
          <span className="text-slate-400 font-normal ml-1">· Esc para salir</span>
        </div>
      )}

      {selectionHint && dragMode === 'none' && (
        <div className="absolute bottom-3 left-3 z-20 bg-white/90 text-slate-600 px-3 py-1.5 rounded-lg text-[11px] font-medium shadow-sm border border-slate-200 pointer-events-none backdrop-blur-xs">
          {selectionHint}
        </div>
      )}

      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        className="block w-full h-full"
      />
    </div>
  );
};
