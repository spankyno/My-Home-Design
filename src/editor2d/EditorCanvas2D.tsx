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
  isPointInsidePolygon,
  calculateDynamicDimensions,
  projectPointOnSegment,
  buildRectRoom,
} from '../geometry';
import { FURNITURE_CATALOG } from '../catalog';
import { newId } from '../utils/id';

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
    addWall,
    addRoomWithWalls,
    addOpening,
    addFurniture,
    updateFurniture,
    moveRoom,
    moveWall,
    addManualDimension,
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
      addWall: s.addWall,
      addRoomWithWalls: s.addRoomWithWalls,
      addOpening: s.addOpening,
      addFurniture: s.addFurniture,
      updateFurniture: s.updateFurniture,
      moveRoom: s.moveRoom,
      moveWall: s.moveWall,
      addManualDimension: s.addManualDimension,
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

  // Interactive drawing states
  const [wallStartPoint, setWallStartPoint] = useState<Point2D | null>(null);
  const [currentMouseWorld, setCurrentMouseWorld] = useState<Point2D>({ x: 0, y: 0 });
  const [rectRoomStart, setRectRoomStart] = useState<Point2D | null>(null);
  const [polyRoomPoints, setPolyRoomPoints] = useState<Point2D[]>([]);
  const [measureStart, setMeasureStart] = useState<Point2D | null>(null);

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
    drawInteractivePreviews(ctx);

    ctx.restore();
    ctx.restore();
  }, [
    panOffset,
    zoom,
    project,
    selectedIds,
    activeDynamicDims,
    wallStartPoint,
    currentMouseWorld,
    rectRoomStart,
    polyRoomPoints,
    measureStart,
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

      // Corner handles
      for (const p of room.points) {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 50, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
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

    ctx.restore();
  }

  // Helper: Draw Furniture
  function drawFurniture(ctx: CanvasRenderingContext2D, item: FurnitureItem, isSelected: boolean) {
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.rotate((item.rotation * Math.PI) / 180);

    const hw = item.width / 2;
    const hd = item.depth / 2;

    // Body rectangle
    ctx.beginPath();
    ctx.roundRect(-hw, -hd, item.width, item.depth, Math.min(40, item.depth * 0.1));
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
      ctx.strokeRect(-hw - 30, -hd - 30, item.width + 60, item.depth + 60);
      ctx.setLineDash([]);

      // 4 Corner resize knobs
      const corners = [
        [-hw - 30, -hd - 30],
        [hw + 30, -hd - 30],
        [hw + 30, hd + 30],
        [-hw - 30, hd + 30],
      ];
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 14;
      for (const [cx, cy] of corners) {
        ctx.beginPath();
        ctx.arc(cx, cy, 35, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Rotation Handle Knob (stick and circle above top center)
      const rotY = -hd - 200;
      ctx.beginPath();
      ctx.moveTo(0, -hd - 30);
      ctx.lineTo(0, rotY);
      ctx.stroke();

      ctx.fillStyle = '#0284c7';
      ctx.beginPath();
      ctx.arc(0, rotY, 45, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
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

  // Helper: In-Progress Tool Previews
  function drawInteractivePreviews(ctx: CanvasRenderingContext2D) {
    // 1. Drawing wall
    if (activeTool === 'draw_wall' && wallStartPoint) {
      const len = distance(wallStartPoint, currentMouseWorld);
      const angle = angleDeg(wallStartPoint, currentMouseWorld);

      ctx.save();
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 140; // Default thickness preview
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(wallStartPoint.x, wallStartPoint.y);
      ctx.lineTo(currentMouseWorld.x, currentMouseWorld.y);
      ctx.stroke();
      ctx.globalAlpha = 1.0;

      // Draw dimension and angle badge
      const midX = (wallStartPoint.x + currentMouseWorld.x) / 2;
      const midY = (wallStartPoint.y + currentMouseWorld.y) / 2;
      const label = `${formatMeasurement(len, project.unit)}  (${Math.round(angle)}°)`;

      ctx.font = 'bold 130px Inter, sans-serif';
      const textW = ctx.measureText(label).width;
      ctx.fillStyle = '#0284c7';
      ctx.beginPath();
      ctx.roundRect(midX - textW / 2 - 40, midY - 80, textW + 80, 160, 30);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, midX, midY);

      ctx.restore();
    }

    // 2. Drawing Rectangular Room
    if (activeTool === 'draw_room_rect' && rectRoomStart) {
      const minX = Math.min(rectRoomStart.x, currentMouseWorld.x);
      const maxX = Math.max(rectRoomStart.x, currentMouseWorld.x);
      const minY = Math.min(rectRoomStart.y, currentMouseWorld.y);
      const maxY = Math.max(rectRoomStart.y, currentMouseWorld.y);
      const w = maxX - minX;
      const h = maxY - minY;
      const areaM2 = (w * h) / 1_000_000;

      ctx.save();
      ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
      ctx.fillRect(minX, minY, w, h);
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 150; // Wall thickness preview
      ctx.strokeRect(minX, minY, w, h);

      // Dimension labels
      const label = `${formatMeasurement(w, project.unit)} × ${formatMeasurement(h, project.unit)} (${areaM2.toFixed(2)} m²)`;
      ctx.font = 'bold 140px Inter, sans-serif';
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = '#0284c7';
      ctx.roundRect(minX + w / 2 - tw / 2 - 40, minY + h / 2 - 90, tw + 80, 180, 30);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, minX + w / 2, minY + h / 2);

      ctx.restore();
    }

    // 3. Measuring distance preview
    if (activeTool === 'measure_distance' && measureStart) {
      const len = distance(measureStart, currentMouseWorld);
      drawDimensionLine(ctx, measureStart, currentMouseWorld, formatMeasurement(len, project.unit), '#0284c7', true);
    }

    // 4. Ghost furniture placement preview
    if (activeTool === 'place_furniture' && pendingFurnitureCatalogId) {
      const cat = FURNITURE_CATALOG.find((c) => c.id === pendingFurnitureCatalogId);
      if (cat) {
        ctx.save();
        ctx.translate(currentMouseWorld.x, currentMouseWorld.y);
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = cat.defaultColor;
        ctx.fillRect(-cat.defaultWidth / 2, -cat.defaultDepth / 2, cat.defaultWidth, cat.defaultDepth);
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 16;
        ctx.strokeRect(-cat.defaultWidth / 2, -cat.defaultDepth / 2, cat.defaultWidth, cat.defaultDepth);
        ctx.restore();
      }
    }

    // 5. Ghost opening (door/window) preview snapped to nearest wall
    if (activeTool === 'place_opening' && pendingOpeningType) {
      let nearestWall: Wall | null = null;
      let minDistance = 3000;
      let snapProj = { point: currentMouseWorld, t: 0, distance: Infinity };

      for (const wall of project.walls) {
        const proj = projectPointOnSegment(currentMouseWorld, wall.start, wall.end);
        if (proj.distance < minDistance) {
          minDistance = proj.distance;
          nearestWall = wall;
          snapProj = proj;
        }
      }

      if (nearestWall) {
        const wallLen = distance(nearestWall.start, nearestWall.end);
        const isDoor = pendingOpeningType.includes('door') || pendingOpeningType === 'passage';
        const opW = isDoor ? 800 : 1200;
        const halfW = opW / 2;
        const clampedDist = Math.max(halfW + 50, Math.min(wallLen - halfW - 50, snapProj.t * wallLen));

        const ghostOpening: Opening = {
          id: 'ghost-opening',
          wallId: nearestWall.id,
          type: pendingOpeningType,
          distanceAlongWall: clampedDist,
          width: opW,
          height: isDoor ? 2050 : 1200,
          elevation: isDoor ? 0 : 900,
          flipSide: false,
          flipDirection: false,
        };

        drawOpening(ctx, ghostOpening, nearestWall, true);

        // Dashed guide line from cursor to snapped position
        ctx.save();
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 10;
        ctx.setLineDash([30, 20]);
        ctx.beginPath();
        ctx.moveTo(currentMouseWorld.x, currentMouseWorld.y);
        ctx.lineTo(snapProj.point.x, snapProj.point.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Interactive Snapped Guide Badge
        const badgeText = `Haz clic para insertar ${isDoor ? 'puerta' : 'ventana'} (${Math.round(clampedDist)} mm)`;
        ctx.font = 'bold 100px Inter, sans-serif';
        const tw = ctx.measureText(badgeText).width;
        ctx.fillStyle = '#0284c7';
        ctx.beginPath();
        ctx.roundRect(snapProj.point.x - tw / 2 - 30, snapProj.point.y - 180, tw + 60, 140, 25);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(badgeText, snapProj.point.x, snapProj.point.y - 110);
        ctx.restore();
      }
    }
  }

  // ================= MOUSE & INTERACTION EVENT HANDLERS =================

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const rawWorld = screenToWorld(screenX, screenY);

    // Magnetic snap application
    let world = rawWorld;
    if (project.snapEnabled) {
      const snappedGrid = snapToGrid(rawWorld, project.gridSize);
      const snapTargetResult = snapToTargets(rawWorld, getSnapTargets(), project.snapTolerance);
      world = snapTargetResult.snapped ? snapTargetResult.point : snappedGrid;
    }

    // Middle click or Pan tool active
    if (e.button === 1 || activeTool === 'pan') {
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
      return;
    }

    // Tool: Measure Distance
    if (activeTool === 'measure_distance') {
      if (!measureStart) {
        setMeasureStart(world);
      } else {
        const len = distance(measureStart, world);
        if (len > 50) {
          addManualDimension({
            id: newId('dim'),
            start: measureStart,
            end: world,
            offset: 200,
            label: formatMeasurement(len, project.unit),
          });
        }
        setMeasureStart(null);
        setActiveTool('select');
      }
      return;
    }

    // Tool: Draw Wall
    if (activeTool === 'draw_wall') {
      if (!wallStartPoint) {
        setWallStartPoint(world);
      } else {
        const len = distance(wallStartPoint, world);
        if (len > 100) {
          addWall({
            id: newId('wall'),
            start: wallStartPoint,
            end: world,
            thickness: 150,
            height: 2600,
          });
          // Continue chain
          setWallStartPoint(world);
        }
      }
      return;
    }

    // Tool: Draw Rect Room (e.g. 4000 x 3000 mm)
    if (activeTool === 'draw_room_rect') {
      if (!rectRoomStart) {
        setRectRoomStart(world);
      } else {
        const minX = Math.min(rectRoomStart.x, world.x);
        const maxX = Math.max(rectRoomStart.x, world.x);
        const minY = Math.min(rectRoomStart.y, world.y);
        const maxY = Math.max(rectRoomStart.y, world.y);

        const w = maxX - minX;
        const h = maxY - minY;

        if (w > 200 && h > 200) {
          const { room, walls } = buildRectRoom(minX, minY, maxX, maxY, `Habitación ${project.rooms.length + 1}`);
          addRoomWithWalls(room, walls);
        }

        setRectRoomStart(null);
        setActiveTool('select');
      }
      return;
    }

    // Tool: Place Furniture from catalog
    if (activeTool === 'place_furniture' && pendingFurnitureCatalogId) {
      const cat = FURNITURE_CATALOG.find((c) => c.id === pendingFurnitureCatalogId);
      if (cat) {
        addFurniture({
          id: newId('f'),
          catalogId: cat.id,
          name: cat.name,
          category: cat.category,
          x: world.x,
          y: world.y,
          z: 0,
          width: cat.defaultWidth,
          depth: cat.defaultDepth,
          height: cat.defaultHeight,
          rotation: 0,
          color: cat.defaultColor,
          material: cat.defaultMaterial,
          isLocked: false,
          lockProportions: true,
        });
      }
      setPendingFurnitureCatalogId(null);
      setActiveTool('select');
      return;
    }

    // Tool: Place Opening on Wall
    if (activeTool === 'place_opening' && pendingOpeningType) {
      // Find nearest wall within 3000 mm
      let nearestWall: Wall | null = null;
      let minDistance = 3000;
      let snapProj = { point: world, t: 0, distance: Infinity };

      for (const wall of project.walls) {
        const proj = projectPointOnSegment(world, wall.start, wall.end);
        if (proj.distance < minDistance) {
          minDistance = proj.distance;
          nearestWall = wall;
          snapProj = proj;
        }
      }

      if (nearestWall) {
        const wallLen = distance(nearestWall.start, nearestWall.end);
        const isDoor = pendingOpeningType.includes('door') || pendingOpeningType === 'passage';
        const opW = isDoor ? 800 : 1200;
        const halfW = opW / 2;
        const clampedDist = Math.max(halfW + 50, Math.min(wallLen - halfW - 50, snapProj.t * wallLen));

        const newOp: Opening = {
          id: newId('op'),
          wallId: nearestWall.id,
          type: pendingOpeningType,
          distanceAlongWall: Math.round(clampedDist),
          width: opW,
          height: isDoor ? 2050 : 1200,
          elevation: isDoor ? 0 : 900,
          flipSide: false,
          flipDirection: false,
        };

        addOpening(newOp);
        selectObject(newOp.id);
        setPendingOpeningType(null);
        setActiveTool('select');
      }
      return;
    }

    // Tool: Select mode (Click objects, check dynamic dimension pills, handles)
    if (activeTool === 'select') {
      // Check if user clicked on any Dynamic Dimension badge to edit separation
      for (const dim of activeDynamicDims) {
        const midX = (dim.start.x + dim.end.x) / 2;
        const midY = (dim.start.y + dim.end.y) / 2;
        if (distance(rawWorld, { x: midX, y: midY }) < 180) {
          setDimensionEditTarget(dim);
          return;
        }
      }

      // Check if clicked on rotation handle of selected item
      if (selectedIds.length === 1) {
        const item = project.furniture.find((f) => f.id === selectedIds[0]);
        if (item) {
          const rad = (item.rotation * Math.PI) / 180;
          const rotYLocal = -item.depth / 2 - 200;
          const rotKnobWorld = {
            x: item.x - rotYLocal * Math.sin(rad),
            y: item.y + rotYLocal * Math.cos(rad),
          };

          if (distance(rawWorld, rotKnobWorld) < 120) {
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

      // Hit-test Furniture (in reverse order for topmost)
      for (let i = project.furniture.length - 1; i >= 0; i--) {
        const f = project.furniture[i];
        const hw = f.width / 2;
        const hd = f.depth / 2;
        // Transform click to local item space
        const dx = rawWorld.x - f.x;
        const dy = rawWorld.y - f.y;
        const rad = (-f.rotation * Math.PI) / 180;
        const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
        const localY = dx * Math.sin(rad) + dy * Math.cos(rad);

        if (Math.abs(localX) <= hw && Math.abs(localY) <= hd) {
          const isMulti = e.shiftKey || e.ctrlKey || e.metaKey;
          selectObject(f.id, isMulti);

          // Initiate move drag
          setDragMode('move');
          setDragStartWorld(rawWorld);
          setLastDragWorld(rawWorld);

          const initialMap = new Map();
          const targetIds = isMulti && selectedIds.includes(f.id) ? selectedIds : [f.id];
          for (const tid of targetIds) {
            const item = project.furniture.find((x) => x.id === tid);
            if (item) {
              initialMap.set(item.id, {
                x: item.x,
                y: item.y,
                rotation: item.rotation,
                width: item.width,
                depth: item.depth,
              });
            }
          }
          setInitialItemTransforms(initialMap);
          return;
        }
      }

      // Hit-test Openings
      for (const op of project.openings) {
        const wall = project.walls.find((w) => w.id === op.wallId);
        if (wall) {
          const wallLen = distance(wall.start, wall.end);
          const t = op.distanceAlongWall / wallLen;
          const opCenter = {
            x: wall.start.x + (wall.end.x - wall.start.x) * t,
            y: wall.start.y + (wall.end.y - wall.start.y) * t,
          };
          if (distance(rawWorld, opCenter) < op.width / 2 + 100) {
            selectObject(op.id, e.shiftKey || e.ctrlKey);
            return;
          }
        }
      }

      // Hit-test Walls
      for (const wall of project.walls) {
        const proj = projectPointOnSegment(rawWorld, wall.start, wall.end);
        if (proj.distance <= wall.thickness / 2 + 50) {
          const isMulti = e.shiftKey || e.ctrlKey || e.metaKey;
          selectObject(wall.id, isMulti);

          setDragMode('move');
          setDragStartWorld(rawWorld);
          setLastDragWorld(rawWorld);
          setInitialItemTransforms(new Map());
          setInitialRoomPoints(new Map());
          const wMap = new Map();
          wMap.set(wall.id, { start: { ...wall.start }, end: { ...wall.end } });
          setInitialWallEndpoints(wMap);
          return;
        }
      }

      // Hit-test Rooms (using isPointInsidePolygon)
      for (const room of project.rooms) {
        if (isPointInsidePolygon(rawWorld, room.points)) {
          const isMulti = e.shiftKey || e.ctrlKey || e.metaKey;
          selectObject(room.id, isMulti);

          setDragMode('move');
          setDragStartWorld(rawWorld);
          setLastDragWorld(rawWorld);
          setInitialItemTransforms(new Map());
          setInitialWallEndpoints(new Map());
          const rMap = new Map();
          rMap.set(room.id, [...room.points]);
          setInitialRoomPoints(rMap);
          return;
        }
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
    let world = rawWorld;
    if (project.snapEnabled) {
      const snappedGrid = snapToGrid(rawWorld, project.gridSize);
      const snapTargetResult = snapToTargets(rawWorld, getSnapTargets(), project.snapTolerance);
      world = snapTargetResult.snapped ? snapTargetResult.point : snappedGrid;
    }

    setCursorWorldPos(world);
    setCurrentMouseWorld(world);

    // Pan canvas
    if (isPanning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      setPanOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      setPanStart({ x: e.clientX, y: e.clientY });
      return;
    }

    // Drag move furniture, rooms, walls
    if (dragMode === 'move') {
      const dx = world.x - lastDragWorld.x;
      const dy = world.y - lastDragWorld.y;
      setLastDragWorld(world);

      if (dx !== 0 || dy !== 0) {
        // Absolute from the position at drag start: no stale `project` and no
        // rounding drift accumulating on every mouse event.
        initialItemTransforms.forEach((init, id) => {
          updateFurniture(id, {
            x: Math.round(init.x + (world.x - dragStartWorld.x)),
            y: Math.round(init.y + (world.y - dragStartWorld.y)),
          });
        });

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
        // Standard angle where top is 0 deg: angleDeg gives right=0, down=90, left=180, up=270
        let newRot = Math.round((curAngle + 90) % 360);
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
    if (dragMode !== 'none') {
      pushHistorySnapshot();
      setDragMode('none');
      setInitialItemTransforms(new Map());
    }

    // Complete drag-to-create rectangular room
    if (activeTool === 'draw_room_rect' && rectRoomStart) {
      const minX = Math.min(rectRoomStart.x, currentMouseWorld.x);
      const maxX = Math.max(rectRoomStart.x, currentMouseWorld.x);
      const minY = Math.min(rectRoomStart.y, currentMouseWorld.y);
      const maxY = Math.max(rectRoomStart.y, currentMouseWorld.y);

      const w = maxX - minX;
      const h = maxY - minY;

      if (w > 300 && h > 300) {
        const { room, walls } = buildRectRoom(minX, minY, maxX, maxY, `Habitación ${project.rooms.length + 1}`);
        addRoomWithWalls(room, walls);
        setRectRoomStart(null);
        setActiveTool('select');
      }
    }
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

  // Key shortcuts (Escape to cancel drawing, Enter to finish polygon)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setWallStartPoint(null);
        setRectRoomStart(null);
        setPolyRoomPoints([]);
        setMeasureStart(null);
        setActiveTool('select');
        setPendingFurnitureCatalogId(null);
        setPendingOpeningType(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-slate-50 select-none cursor-crosshair"
    >
      {/* Active Tool Guidance Banner */}
      {activeTool !== 'select' && activeTool !== 'pan' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-slate-900/90 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-lg backdrop-blur-xs flex items-center gap-2 border border-slate-700 pointer-events-none">
          <span className="w-2 h-2 rounded-full bg-sky-400"></span>
          <span>
            {activeTool === 'draw_room_rect' && 'Arrastra para crear la habitación (ej. 4×3 m) o haz clic en esquinas opuestas'}
            {activeTool === 'place_opening' && `Acerca el cursor a cualquier pared para insertar ${pendingOpeningType?.replace('_', ' ')}`}
            {activeTool === 'draw_wall' && (wallStartPoint ? 'Mueve el ratón y haz clic para fijar la pared' : 'Haz clic para comenzar el trazado de la pared')}
            {activeTool === 'place_furniture' && 'Haz clic en el plano para colocar el mueble'}
            {activeTool === 'measure_distance' && (measureStart ? 'Haz clic en el segundo punto a medir' : 'Haz clic en el primer punto de medición')}
          </span>
          <span className="text-slate-400 font-normal ml-1">· Esc para cancelar</span>
        </div>
      )}

      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        className="block w-full h-full"
      />
    </div>
  );
};
