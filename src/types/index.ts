export type Unit = 'mm' | 'cm' | 'm';

export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface BoundingBox2D {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export type WallFinishType =
  | 'paint_white'
  | 'paint_warm_gray'
  | 'paint_charcoal'
  | 'paint_sage'
  | 'paint_navy'
  | 'brick_exposed'
  | 'tile_subway'
  | 'tile_marble'
  | 'concrete_wall';

export interface Wall {
  id: string;
  start: Point2D;
  end: Point2D;
  thickness: number; // in mm
  height: number;    // in mm
  color?: string;
  finishMaterial?: WallFinishType;
}

export type OpeningType =
  | 'door'
  | 'double_door'
  | 'sliding_door'
  | 'window'
  | 'french_window'
  | 'passage';

export interface Opening {
  id: string;
  wallId: string;
  type: OpeningType;
  distanceAlongWall: number; // mm from wall start
  width: number;             // mm
  height: number;            // mm
  elevation: number;         // mm from floor (sill height)
  flipSide: boolean;         // opening side
  flipDirection: boolean;    // hinge orientation
}

export type FloorMaterialType =
  | 'parquet'
  | 'parquet_herringbone'
  | 'parquet_plank'
  | 'wood_walnut'
  | 'tile'
  | 'tile_ceramic'
  | 'hydraulic_tile'
  | 'marble'
  | 'marble_carrara'
  | 'marble_nero'
  | 'concrete'
  | 'concrete_polished'
  | 'terrazzo'
  | 'carpet'
  | 'carpet_beige'
  | 'laminate';

export interface Room {
  id: string;
  name: string;
  points: Point2D[];        // Polygon vertices in mm
  wallIds?: string[];
  floorColor: string;
  floorMaterial: FloorMaterialType;
  height: number;           // mm
}

export type FurnitureCategory =
  | 'salon'
  | 'dormitorio'
  | 'cocina'
  | 'bano'
  | 'comedor'
  | 'oficina'
  | 'almacenaje'
  | 'generico'
  | 'personalizado';

export interface ParametricShelf {
  id: string;
  heightFromBase: number; // mm from bottom interior
  thickness: number;      // mm
  fullDepth: boolean;
}

export interface ParametricDrawer {
  id: string;
  frontHeight: number;   // mm
  positionFromBase: number; // mm
  handleType: 'bar' | 'recessed' | 'knob';
}

export interface ParametricDivider {
  id: string;
  positionFromLeft: number; // mm
  thickness: number;        // mm
}

export interface ParametricDoor {
  id: string;
  type: 'single_left' | 'single_right' | 'double' | 'sliding';
  handleType: 'bar' | 'knob' | 'push';
  glassInsert: boolean;
}

export type CabinetType =
  | 'closet'
  | 'kitchen_base'
  | 'kitchen_top'
  | 'kitchen_tall'
  | 'shelf'
  | 'dresser'
  | 'custom';

export interface ParametricCabinetConfig {
  type: CabinetType;
  exteriorWidth: number;   // mm
  exteriorHeight: number;  // mm
  exteriorDepth: number;   // mm
  boardThickness: number;  // mm
  plinthHeight: number;    // mm (zócalo)
  hasBack: boolean;
  backThickness: number;   // mm
  finishColor: string;
  finishMaterial: string;
  shelves: ParametricShelf[];
  drawers: ParametricDrawer[];
  dividers: ParametricDivider[];
  doors: ParametricDoor[];
}

export interface FurnitureItem {
  id: string;
  catalogId?: string;
  name: string;
  category: FurnitureCategory;
  x: number;               // mm (center)
  y: number;               // mm (center)
  z: number;               // mm (elevation above floor)
  width: number;           // mm
  depth: number;           // mm
  height: number;          // mm
  rotation: number;        // degrees (0-360)
  color: string;
  material: string;
  isLocked: boolean;
  lockProportions: boolean;
  /** 'circle' pieces (puff, lamp...) are round: width = depth = diameter. Default: rectangular. */
  shape?: 'rect' | 'circle';
  isParametric?: boolean;
  parametricConfig?: ParametricCabinetConfig;
}

export interface ManualDimension {
  id: string;
  start: Point2D;
  end: Point2D;
  offset: number; // perpendicular offset distance for CAD dimension line
  label?: string;
}

export interface LayersState {
  walls: boolean;
  furniture: boolean;
  dimensions: boolean;
  rooms: boolean;
}

export interface ProjectMetadata {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  version: string;
}

export interface Project extends ProjectMetadata {
  unit: Unit;
  decimalPrecision: number;
  gridSize: number;        // mm
  snapTolerance: number;   // mm
  snapEnabled: boolean;
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  furniture: FurnitureItem[];
  manualDimensions: ManualDimension[];
  layers: LayersState;
}

export type ActiveTool =
  | 'select'
  | 'pan'
  | 'place_opening'
  | 'place_furniture'
  | 'measure_distance';

export interface DynamicDimension {
  id: string;
  start: Point2D;
  end: Point2D;
  distance: number;
  type: 'wall_to_furniture' | 'furniture_to_furniture' | 'wall_segment' | 'room_bounds';
  label: string;
  orientation: 'horizontal' | 'vertical' | 'aligned';
  targetFurnitureId?: string;
  targetWallId?: string;
  axis?: 'x' | 'y';
  direction?: 'left' | 'right' | 'top' | 'bottom';
}
