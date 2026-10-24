import * as THREE from 'three';
import { Wall, Opening, FurnitureItem, Room, Project } from '../types';
import { distance } from '../geometry';
import { createFloorMaterial, createWallMaterial } from '../materials';
import { createAccent, createSurface } from '../materials/furniture';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { buildFurnitureModel, buildParametricCabinet3D } from './furnitureModels';

export type WallMode = 'solid' | 'transparent' | 'cutaway';

export const PROJECT_ROOT_NAME = 'PROJECT_DYNAMIC_ROOT';
/** Wall height (mm) in the low "maquette" section view. */
const CUTAWAY_HEIGHT = 1200;
const TRANSPARENT_WALL_OPACITY = 0.35;

/**
 * Builds the whole project (floors, walls with openings, furniture) as one Three.js
 * group in millimetres, Y-up. Shared by the interactive 3D view and the GLB export so
 * both always show the same model. Every wall/furniture group carries `userData.id`.
 */
export function buildProjectGroup(
  project: Project,
  wallMode: WallMode,
  selectedIds: readonly string[] = []
): THREE.Group {
  const root = new THREE.Group();
  root.name = PROJECT_ROOT_NAME;
  const selected = new Set(selectedIds);

  for (const room of project.rooms) {
    if (room.points.length >= 3) root.add(buildRoomFloor(room));
  }

  const isTransparent = wallMode === 'transparent';
  const opacity = isTransparent ? TRANSPARENT_WALL_OPACITY : 1;
  for (const wall of project.walls) {
    const height = wallMode === 'cutaway' ? Math.min(CUTAWAY_HEIGHT, wall.height) : wall.height;
    const openings = project.openings.filter((o) => o.wallId === wall.id);
    const group = buildWallWithOpenings(wall, openings, height, opacity, isTransparent, selected.has(wall.id));
    group.userData = { id: wall.id, type: 'wall' };
    root.add(group);
  }

  for (const item of project.furniture) {
    const group = buildFurnitureMesh(item, selected.has(item.id));
    group.userData = { id: item.id, type: 'furniture' };
    root.add(group);
  }

  return root;
}

export function disposeHierarchy(obj: THREE.Object3D) {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((m) => m.dispose());
    }
  });
}

/**
 * Builds Room Floor Polygon with procedural PBR materials
 */
export function buildRoomFloor(room: Room): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(room.points[0].x, room.points[0].y);
  for (let i = 1; i < room.points.length; i++) {
    shape.lineTo(room.points[i].x, room.points[i].y);
  }
  shape.closePath();

  const geom = new THREE.ShapeGeometry(shape);
  const mat = createFloorMaterial(room.floorMaterial, room.floorColor);
  // The +90° rotation below leaves the front face pointing down; render both sides
  // so the floor is visible from above whatever the vertex winding.
  mat.side = THREE.DoubleSide;

  const mesh = new THREE.Mesh(geom, mat);
  mesh.rotation.x = Math.PI / 2; // Flat on ground
  mesh.position.y = 1; // Slightly above ground plane to prevent z-fighting
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Builds Wall with Subdivided Openings (doors, windows) and real wall finishes
 */
export function buildWallWithOpenings(
  wall: Wall,
  openings: Opening[],
  wallHeight: number,
  wallOpacity: number,
  isTransparent: boolean,
  isSelected: boolean
): THREE.Group {
  const group = new THREE.Group();
  const wallLen = distance(wall.start, wall.end);
  if (wallLen < 1) return group;

  const wallMat = createWallMaterial(
    wall.finishMaterial,
    wall.color,
    isTransparent,
    wallOpacity,
    isSelected
  );

  const angle = Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x);

  // Position and rotate wall group in Three.js world space
  // Three.js: X is world X, Y is UP (elevation), Z is world Y
  group.position.set(wall.start.x, 0, wall.start.y);
  group.rotation.y = -angle;

  // If no openings, simple full box
  if (openings.length === 0) {
    const geo = new THREE.BoxGeometry(wallLen, wallHeight, wall.thickness);
    const mesh = new THREE.Mesh(geo, wallMat);
    mesh.position.set(wallLen / 2, wallHeight / 2, 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return group;
  }

  // Sort openings along wall
  const sorted = [...openings].sort((a, b) => a.distanceAlongWall - b.distanceAlongWall);

  let currentDist = 0;
  for (const op of sorted) {
    const opStart = Math.max(0, op.distanceAlongWall - op.width / 2);
    const opEnd = Math.min(wallLen, op.distanceAlongWall + op.width / 2);
    if (opEnd - opStart <= 1) continue; // opening lies outside the wall: nothing to cut

    // 1. Wall section before opening
    if (opStart > currentDist + 1) {
      const segLen = opStart - currentDist;
      const geo = new THREE.BoxGeometry(segLen, wallHeight, wall.thickness);
      const mesh = new THREE.Mesh(geo, wallMat);
      mesh.position.set(currentDist + segLen / 2, wallHeight / 2, 0);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    // 2. Opening section (above lintel / below sill)
    const opWidth = opEnd - opStart;
    const opSill = op.elevation;
    const opTop = Math.min(wallHeight, op.elevation + op.height);

    // Sill below window
    if (opSill > 1) {
      const sillH = Math.min(wallHeight, opSill);
      const sillGeo = new THREE.BoxGeometry(opWidth, sillH, wall.thickness);
      const sillMesh = new THREE.Mesh(sillGeo, wallMat);
      sillMesh.position.set(opStart + opWidth / 2, sillH / 2, 0);
      sillMesh.castShadow = true;
      sillMesh.receiveShadow = true;
      group.add(sillMesh);
    }

    // Lintel above opening
    if (opTop < wallHeight - 1) {
      const lintelH = wallHeight - opTop;
      const lintelGeo = new THREE.BoxGeometry(opWidth, lintelH, wall.thickness);
      const lintelMesh = new THREE.Mesh(lintelGeo, wallMat);
      lintelMesh.position.set(opStart + opWidth / 2, opTop + lintelH / 2, 0);
      lintelMesh.castShadow = true;
      lintelMesh.receiveShadow = true;
      group.add(lintelMesh);
    }

    // 3. Opening 3D Fixture (Door frame + leaf / Window glass + frame)
    const fixture = buildOpeningFixture(op, opWidth, wall.thickness, wallHeight);
    fixture.position.set(opStart + opWidth / 2, 0, 0);
    group.add(fixture);

    currentDist = opEnd;
  }

  // Final wall section after last opening
  if (currentDist < wallLen - 1) {
    const segLen = wallLen - currentDist;
    const geo = new THREE.BoxGeometry(segLen, wallHeight, wall.thickness);
    const mesh = new THREE.Mesh(geo, wallMat);
    mesh.position.set(currentDist + segLen / 2, wallHeight / 2, 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  return group;
}

const FRAME_BAR = 50; // mm, width of the frame profile

/** Adds the jambs, head and (optionally) sill of a rectangular frame centred on x = 0. */
function addFrame(
  group: THREE.Group,
  width: number,
  height: number,
  yBottom: number,
  depth: number,
  material: THREE.Material,
  opts: { sill: boolean; head: boolean }
) {
  const addBar = (w: number, h: number, x: number, y: number) => {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, depth), material);
    bar.position.set(x, y, 0);
    bar.castShadow = true;
    group.add(bar);
  };
  addBar(FRAME_BAR, height, -width / 2 + FRAME_BAR / 2, yBottom + height / 2); // left jamb
  addBar(FRAME_BAR, height, width / 2 - FRAME_BAR / 2, yBottom + height / 2); // right jamb
  if (opts.head) addBar(width - 2 * FRAME_BAR, FRAME_BAR, 0, yBottom + height - FRAME_BAR / 2);
  if (opts.sill) addBar(width - 2 * FRAME_BAR, FRAME_BAR, 0, yBottom + FRAME_BAR / 2);
}

/**
 * 3D door (frame + leaf + handle) or window (frame + glass); passages get no fixture.
 * Clipped to `wallHeight`: in the low "section" view a 2.1 m door must not stick out above a 1.2 m wall.
 */
function buildOpeningFixture(op: Opening, actualWidth: number, wallThickness: number, wallHeight: number): THREE.Group {
  const group = new THREE.Group();
  const frameDepth = wallThickness + 20; // frame slightly proud of the wall faces

  const top = Math.min(op.elevation + op.height, wallHeight);
  const height = top - op.elevation;
  if (height < 150) return group; // the cut wall is lower than the sill: nothing of the fixture is visible
  const clipped = top < op.elevation + op.height;

  if (op.type.includes('door') || op.type === 'french_window') {
    const frameMat = createSurface('satin', '#334155');
    const leafMat = createSurface('satin', '#f8fafc');

    addFrame(group, actualWidth, height, op.elevation, frameDepth, frameMat, { sill: false, head: !clipped });

    // Closed leaf inside the frame
    const leafW = actualWidth - 2 * FRAME_BAR;
    const leafH = height - (clipped ? 0 : FRAME_BAR);
    const leaf = new THREE.Mesh(new RoundedBoxGeometry(leafW, leafH, 40, 1, 6), leafMat);
    leaf.position.set(0, op.elevation + leafH / 2, 0);
    leaf.castShadow = true;
    group.add(leaf);

    // Lever handle at ~1 m, only if it is within the visible part
    const handleY = op.elevation + 1000;
    if (handleY < top - 60) {
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 120, 16), createAccent('chrome'));
      handle.rotation.z = Math.PI / 2;
      handle.position.set(leafW / 2 - 80, handleY, 35);
      group.add(handle);
    }
  } else if (op.type === 'window') {
    const frameMat = createSurface('satin', '#1e293b');
    addFrame(group, actualWidth, height, op.elevation, frameDepth, frameMat, { sill: true, head: !clipped });

    const glassH = height - FRAME_BAR - (clipped ? 0 : FRAME_BAR);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(actualWidth - 2 * FRAME_BAR, glassH, 10), createAccent('glass'));
    glass.position.set(0, op.elevation + FRAME_BAR + glassH / 2, 0);
    group.add(glass);
  }

  return group;
}

/**
 * 3D model of a plan item (textured, detailed), placed and rotated like on the plan.
 * Three.js axes: X = plan x, Y = elevation, Z = plan y.
 */
export function buildFurnitureMesh(item: FurnitureItem, isSelected: boolean): THREE.Group {
  const group = new THREE.Group();
  group.position.set(item.x, item.z, item.y);
  group.rotation.y = (-item.rotation * Math.PI) / 180;

  group.add(
    item.isParametric && item.parametricConfig
      ? buildParametricCabinet3D(item.parametricConfig, isSelected)
      : buildFurnitureModel(item, isSelected)
  );
  return group;
}
