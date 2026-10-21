import * as THREE from 'three';
import { Wall, Opening, FurnitureItem, Room, Project, ParametricCabinetConfig } from '../types';
import { distance } from '../geometry';
import { createFloorMaterial, createWallMaterial } from '../materials';

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
    const fixture = buildOpeningFixture(op, opWidth, wall.thickness);
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
  withSill: boolean
) {
  const addBar = (w: number, h: number, x: number, y: number) => {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, depth), material);
    bar.position.set(x, y, 0);
    bar.castShadow = true;
    group.add(bar);
  };
  addBar(FRAME_BAR, height, -width / 2 + FRAME_BAR / 2, yBottom + height / 2); // left jamb
  addBar(FRAME_BAR, height, width / 2 - FRAME_BAR / 2, yBottom + height / 2); // right jamb
  addBar(width - 2 * FRAME_BAR, FRAME_BAR, 0, yBottom + height - FRAME_BAR / 2); // head
  if (withSill) addBar(width - 2 * FRAME_BAR, FRAME_BAR, 0, yBottom + FRAME_BAR / 2); // sill
}

/**
 * Builds 3D door (frame + leaf + handle) or window (frame + glass) fixtures.
 * Passages get no fixture.
 */
function buildOpeningFixture(op: Opening, actualWidth: number, wallThickness: number): THREE.Group {
  const group = new THREE.Group();
  const frameDepth = wallThickness + 20; // frame slightly proud of the wall faces

  if (op.type.includes('door') || op.type === 'french_window') {
    const frameMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.6 });
    const leafMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.5 });
    const handleMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', metalness: 0.85, roughness: 0.2 });

    addFrame(group, actualWidth, op.height, op.elevation, frameDepth, frameMat, false);

    // Closed leaf inside the frame
    const leafW = actualWidth - 2 * FRAME_BAR;
    const leafH = op.height - FRAME_BAR;
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(leafW, leafH, 40), leafMat);
    leaf.position.set(0, op.elevation + leafH / 2, 0);
    leaf.castShadow = true;
    group.add(leaf);

    const handle = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 120, 16), handleMat);
    handle.rotation.z = Math.PI / 2;
    handle.position.set(leafW / 2 - 80, op.elevation + 1000, 35);
    group.add(handle);
  } else if (op.type === 'window') {
    const frameMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.4 });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: '#e0f2fe',
      transmission: 0.9,
      roughness: 0.1,
      metalness: 0.05,
      transparent: true,
      opacity: 0.4,
    });

    addFrame(group, actualWidth, op.height, op.elevation, frameDepth, frameMat, true);

    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(actualWidth - 2 * FRAME_BAR, op.height - 2 * FRAME_BAR, 10),
      glassMat
    );
    glass.position.set(0, op.elevation + op.height / 2, 0);
    group.add(glass);
  }

  return group;
}

/**
 * Builds Composite 3D Procedural Furniture Mesh (3-12 parts)
 */
export function buildFurnitureMesh(item: FurnitureItem, isSelected: boolean): THREE.Group {
  const group = new THREE.Group();
  // Three.js coords: X = item.x, Y = item.z, Z = item.y
  group.position.set(item.x, item.z, item.y);
  group.rotation.y = (-item.rotation * Math.PI) / 180;

  const baseMat = new THREE.MeshStandardMaterial({
    color: isSelected ? '#38bdf8' : item.color || '#64748b',
    roughness: 0.6,
    metalness: 0.1,
  });

  const accentMat = new THREE.MeshStandardMaterial({
    color: '#334155',
    roughness: 0.35,
    metalness: 0.4,
  });

  const W = item.width;
  const D = item.depth;
  const H = item.height;

  // 1. Parametric Cabinet
  if (item.isParametric && item.parametricConfig) {
    const pGroup = buildParametricCabinet3D(item.parametricConfig, isSelected);
    group.add(pGroup);
    return group;
  }

  // 2. Sofas
  if (item.category === 'salon' && item.catalogId?.includes('sofa')) {
    // Main base
    const baseH = H * 0.45;
    const baseMesh = new THREE.Mesh(new THREE.BoxGeometry(W, baseH, D), baseMat);
    baseMesh.position.set(0, baseH / 2, 0);
    baseMesh.castShadow = true;
    group.add(baseMesh);

    // Backrest
    const backH = H * 0.55;
    const backD = D * 0.28;
    const backMesh = new THREE.Mesh(new THREE.BoxGeometry(W, backH, backD), baseMat);
    backMesh.position.set(0, baseH + backH / 2, -D / 2 + backD / 2);
    backMesh.castShadow = true;
    group.add(backMesh);

    // Armrests
    const armW = W * 0.12;
    const armH = H * 0.45;
    const leftArm = new THREE.Mesh(new THREE.BoxGeometry(armW, armH, D), baseMat);
    leftArm.position.set(-W / 2 + armW / 2, baseH + armH / 2, 0);
    leftArm.castShadow = true;
    group.add(leftArm);

    const rightArm = new THREE.Mesh(new THREE.BoxGeometry(armW, armH, D), baseMat);
    rightArm.position.set(W / 2 - armW / 2, baseH + armH / 2, 0);
    rightArm.castShadow = true;
    group.add(rightArm);

    // Seat cushions
    const cCount = W > 2000 ? 3 : 2;
    const cW = (W - 2 * armW) / cCount;
    for (let i = 0; i < cCount; i++) {
      const cMesh = new THREE.Mesh(
        new THREE.BoxGeometry(cW - 20, 80, D - backD - 30),
        new THREE.MeshStandardMaterial({ color: item.color, roughness: 0.7 })
      );
      cMesh.position.set(-W / 2 + armW + cW * (i + 0.5), baseH + 40, backD / 2 - 10);
      cMesh.castShadow = true;
      group.add(cMesh);
    }
    return group;
  }

  // 3. Bed
  if (item.category === 'dormitorio' && item.catalogId?.includes('bed')) {
    // Bed frame base
    const frameH = 300;
    const frameMesh = new THREE.Mesh(new THREE.BoxGeometry(W, frameH, D), accentMat);
    frameMesh.position.set(0, frameH / 2, 0);
    frameMesh.castShadow = true;
    group.add(frameMesh);

    // Headboard
    const headH = H;
    const headD = 120;
    const headMesh = new THREE.Mesh(new THREE.BoxGeometry(W, headH, headD), baseMat);
    headMesh.position.set(0, headH / 2, -D / 2 + headD / 2);
    headMesh.castShadow = true;
    group.add(headMesh);

    // Mattress
    const matH = 240;
    const matMesh = new THREE.Mesh(
      new THREE.BoxGeometry(W - 40, matH, D - headD - 40),
      new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.85 })
    );
    matMesh.position.set(0, frameH + matH / 2, headD / 2);
    matMesh.castShadow = true;
    group.add(matMesh);

    // Pillows
    const pillowGeo = new THREE.BoxGeometry(W > 1200 ? (W - 200) / 2 : W - 150, 100, 380);
    const pillowMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.9 });
    if (W > 1200) {
      const p1 = new THREE.Mesh(pillowGeo, pillowMat);
      p1.position.set(-W / 4, frameH + matH + 50, -D / 2 + headD + 220);
      group.add(p1);
      const p2 = new THREE.Mesh(pillowGeo, pillowMat);
      p2.position.set(W / 4, frameH + matH + 50, -D / 2 + headD + 220);
      group.add(p2);
    }
    return group;
  }

  // 4. Tables & Desks
  if (item.catalogId?.includes('table') || item.catalogId?.includes('desk')) {
    // Tabletop
    const topH = 45;
    const topMesh = new THREE.Mesh(new THREE.BoxGeometry(W, topH, D), baseMat);
    topMesh.position.set(0, H - topH / 2, 0);
    topMesh.castShadow = true;
    group.add(topMesh);

    // 4 Legs
    const legW = 60;
    const legGeo = new THREE.BoxGeometry(legW, H - topH, legW);
    const legMat = accentMat;
    const offsets = [
      [-W / 2 + legW, -D / 2 + legW],
      [W / 2 - legW, -D / 2 + legW],
      [W / 2 - legW, D / 2 - legW],
      [-W / 2 + legW, D / 2 - legW],
    ];
    for (const [lx, lz] of offsets) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(lx, (H - topH) / 2, lz);
      leg.castShadow = true;
      group.add(leg);
    }
    return group;
  }

  // 5. Kitchen Sink
  if (item.catalogId?.includes('sink')) {
    // Cabinet
    const cab = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), baseMat);
    cab.position.set(0, H / 2, 0);
    cab.castShadow = true;
    group.add(cab);

    // Steel sink basin insert
    const basinMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.9, roughness: 0.2 });
    const basin = new THREE.Mesh(new THREE.BoxGeometry(W * 0.7, 30, D * 0.65), basinMat);
    basin.position.set(0, H + 15, 0);
    group.add(basin);

    // Faucet
    const faucetMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', metalness: 0.95, roughness: 0.1 });
    const faucet = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 200, 16), faucetMat);
    faucet.position.set(0, H + 100, -D * 0.25);
    group.add(faucet);
    return group;
  }

  // Fallback: Clean architectural procedural volume
  const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), baseMat);
  bodyMesh.position.set(0, H / 2, 0);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  group.add(bodyMesh);

  return group;
}

/**
 * Builds 3D Parametric Cabinet with carcass, shelves, drawers, doors
 */
function buildParametricCabinet3D(config: ParametricCabinetConfig, isSelected: boolean): THREE.Group {
  const group = new THREE.Group();
  const {
    exteriorWidth: W,
    exteriorHeight: H,
    exteriorDepth: D,
    boardThickness: T,
    plinthHeight: P,
    finishColor,
    shelves,
    drawers,
    dividers,
  } = config;

  const cabMat = new THREE.MeshStandardMaterial({
    color: isSelected ? '#38bdf8' : finishColor || '#f8fafc',
    roughness: 0.5,
    metalness: 0.05,
  });

  const darkMat = new THREE.MeshStandardMaterial({
    color: '#334155',
    roughness: 0.7,
  });

  const sideH = H - P;

  // Plinth
  if (P > 0) {
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(W - 20, P, D - 40), darkMat);
    plinth.position.set(0, P / 2, 0);
    plinth.castShadow = true;
    group.add(plinth);
  }

  // Left & Right uprights
  const leftSide = new THREE.Mesh(new THREE.BoxGeometry(T, sideH, D), cabMat);
  leftSide.position.set(-W / 2 + T / 2, P + sideH / 2, 0);
  leftSide.castShadow = true;
  group.add(leftSide);

  const rightSide = new THREE.Mesh(new THREE.BoxGeometry(T, sideH, D), cabMat);
  rightSide.position.set(W / 2 - T / 2, P + sideH / 2, 0);
  rightSide.castShadow = true;
  group.add(rightSide);

  // Top & Bottom panels
  const innerW = W - 2 * T;
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(innerW, T, D), cabMat);
  bottom.position.set(0, P + T / 2, 0);
  bottom.castShadow = true;
  group.add(bottom);

  const top = new THREE.Mesh(new THREE.BoxGeometry(innerW, T, D), cabMat);
  top.position.set(0, H - T / 2, 0);
  top.castShadow = true;
  group.add(top);

  // Back panel
  if (config.hasBack) {
    const back = new THREE.Mesh(new THREE.BoxGeometry(innerW, sideH - 2 * T, 10), cabMat);
    back.position.set(0, P + sideH / 2, -D / 2 + 5);
    group.add(back);
  }

  // Dividers
  for (const div of dividers) {
    const divMesh = new THREE.Mesh(new THREE.BoxGeometry(div.thickness, sideH - 2 * T, D - 20), cabMat);
    const divX = -W / 2 + div.positionFromLeft;
    divMesh.position.set(divX, P + T + (sideH - 2 * T) / 2, 0);
    divMesh.castShadow = true;
    group.add(divMesh);
  }

  // Shelves
  for (const s of shelves) {
    const shelfMesh = new THREE.Mesh(new THREE.BoxGeometry(innerW, s.thickness, D - 20), cabMat);
    shelfMesh.position.set(0, P + T + s.heightFromBase, 0);
    shelfMesh.castShadow = true;
    group.add(shelfMesh);
  }

  // Drawers
  for (const d of drawers) {
    const drMesh = new THREE.Mesh(new THREE.BoxGeometry(innerW - 6, d.frontHeight - 4, D - 30), cabMat);
    drMesh.position.set(0, P + T + d.positionFromBase + d.frontHeight / 2, 0);
    drMesh.castShadow = true;
    group.add(drMesh);

    // Drawer handle
    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(160, 18, 25),
      new THREE.MeshStandardMaterial({ color: '#e2e8f0', metalness: 0.9, roughness: 0.2 })
    );
    handle.position.set(0, P + T + d.positionFromBase + d.frontHeight / 2, D / 2);
    group.add(handle);
  }

  return group;
}
