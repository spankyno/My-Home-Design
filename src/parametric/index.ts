import {
  ParametricCabinetConfig,
  ParametricShelf,
  ParametricDrawer,
  CabinetType,
} from '../types';
import { newId } from '../utils/id';

/** Drawer fronts lower than this (mm) trigger a validation warning. */
const MIN_DRAWER_FRONT = 80;

export interface CabinetValidationIssue {
  type: 'error' | 'warning';
  message: string;
  field?: string;
}

export interface BoardCutPiece {
  name: string;
  count: number;
  width: number;    // mm
  height: number;   // mm
  thickness: number;// mm
  material: string;
}

/**
 * Creates default parametric configurations for standard cabinet types
 */
export function createDefaultCabinetConfig(type: CabinetType): ParametricCabinetConfig {
  switch (type) {
    case 'closet':
      return {
        type: 'closet',
        exteriorWidth: 1800,
        exteriorHeight: 2200,
        exteriorDepth: 600,
        boardThickness: 19,
        plinthHeight: 80,
        hasBack: true,
        backThickness: 10,
        finishColor: '#e2e8f0',
        finishMaterial: 'wood_oak',
        dividers: [
          { id: 'div-1', positionFromLeft: 900, thickness: 19 },
        ],
        shelves: [
          { id: 'sh-1', heightFromBase: 350, thickness: 19, fullDepth: true },
          { id: 'sh-2', heightFromBase: 1800, thickness: 19, fullDepth: true },
        ],
        drawers: [
          { id: 'dr-1', frontHeight: 200, positionFromBase: 0, handleType: 'bar' },
          { id: 'dr-2', frontHeight: 200, positionFromBase: 210, handleType: 'bar' },
        ],
        doors: [
          { id: 'door-1', type: 'double', handleType: 'bar', glassInsert: false },
        ],
      };

    case 'kitchen_base':
      return {
        type: 'kitchen_base',
        exteriorWidth: 600,
        exteriorHeight: 850,
        exteriorDepth: 600,
        boardThickness: 19,
        plinthHeight: 100,
        hasBack: true,
        backThickness: 5,
        finishColor: '#ffffff',
        finishMaterial: 'melamine_white',
        dividers: [],
        shelves: [
          { id: 'sh-kb-1', heightFromBase: 350, thickness: 19, fullDepth: true },
        ],
        drawers: [],
        doors: [
          { id: 'door-kb-1', type: 'single_left', handleType: 'bar', glassInsert: false },
        ],
      };

    case 'kitchen_top':
      return {
        type: 'kitchen_top',
        exteriorWidth: 600,
        exteriorHeight: 700,
        exteriorDepth: 350,
        boardThickness: 19,
        plinthHeight: 0,
        hasBack: true,
        backThickness: 5,
        finishColor: '#ffffff',
        finishMaterial: 'melamine_white',
        dividers: [],
        shelves: [
          { id: 'sh-kt-1', heightFromBase: 320, thickness: 19, fullDepth: true },
        ],
        drawers: [],
        doors: [
          { id: 'door-kt-1', type: 'single_right', handleType: 'bar', glassInsert: false },
        ],
      };

    case 'shelf':
      return {
        type: 'shelf',
        exteriorWidth: 1000,
        exteriorHeight: 2000,
        exteriorDepth: 350,
        boardThickness: 19,
        plinthHeight: 60,
        hasBack: true,
        backThickness: 8,
        finishColor: '#78350f',
        finishMaterial: 'wood_dark',
        dividers: [],
        shelves: [
          { id: 'sh-1', heightFromBase: 360, thickness: 19, fullDepth: true },
          { id: 'sh-2', heightFromBase: 740, thickness: 19, fullDepth: true },
          { id: 'sh-3', heightFromBase: 1120, thickness: 19, fullDepth: true },
          { id: 'sh-4', heightFromBase: 1500, thickness: 19, fullDepth: true },
        ],
        drawers: [],
        doors: [],
      };

    case 'dresser':
      return {
        type: 'dresser',
        exteriorWidth: 1100,
        exteriorHeight: 950,
        exteriorDepth: 500,
        boardThickness: 19,
        plinthHeight: 70,
        hasBack: true,
        backThickness: 8,
        finishColor: '#b45309',
        finishMaterial: 'wood_walnut',
        dividers: [],
        shelves: [],
        drawers: [
          { id: 'dr-1', frontHeight: 180, positionFromBase: 0, handleType: 'bar' },
          { id: 'dr-2', frontHeight: 180, positionFromBase: 195, handleType: 'bar' },
          { id: 'dr-3', frontHeight: 180, positionFromBase: 390, handleType: 'bar' },
          { id: 'dr-4', frontHeight: 180, positionFromBase: 585, handleType: 'bar' },
        ],
        doors: [],
      };

    case 'kitchen_tall':
    case 'custom':
    default:
      return {
        type: 'custom',
        exteriorWidth: 1200,
        exteriorHeight: 1800,
        exteriorDepth: 500,
        boardThickness: 19,
        plinthHeight: 70,
        hasBack: true,
        backThickness: 10,
        finishColor: '#475569',
        finishMaterial: 'melamine_gray',
        dividers: [],
        shelves: [
          { id: 'sh-c-1', heightFromBase: 500, thickness: 19, fullDepth: true },
          { id: 'sh-c-2', heightFromBase: 1000, thickness: 19, fullDepth: true },
        ],
        drawers: [],
        doors: [],
      };
  }
}

/**
 * Validates parametric cabinet geometric constraints
 */
export function validateCabinetConfig(config: ParametricCabinetConfig): CabinetValidationIssue[] {
  const issues: CabinetValidationIssue[] = [];

  if (config.exteriorWidth <= 0 || config.exteriorHeight <= 0 || config.exteriorDepth <= 0) {
    issues.push({ type: 'error', message: 'Las dimensiones exteriores deben ser mayores a 0' });
    return issues;
  }

  const minInteriorWidth = 200;
  const interiorWidth = config.exteriorWidth - 2 * config.boardThickness;
  if (interiorWidth < minInteriorWidth) {
    issues.push({
      type: 'error',
      message: `El ancho interior (${interiorWidth} mm) es insuficiente para los tableros seleccionados`,
    });
  }

  const interiorHeight = config.exteriorHeight - config.plinthHeight - 2 * config.boardThickness;
  if (interiorHeight < 200) {
    issues.push({
      type: 'error',
      message: `La altura interior útil (${interiorHeight} mm) es demasiado pequeña`,
    });
  }

  // Check shelves
  for (const s of config.shelves) {
    if (s.heightFromBase < 0 || s.heightFromBase > interiorHeight) {
      issues.push({
        type: 'warning',
        message: `Una balda se encuentra fuera del vano interior (${s.heightFromBase} mm vs ${interiorHeight} mm útil)`,
      });
    }
  }

  // Check drawers
  for (const d of config.drawers) {
    if (d.frontHeight < MIN_DRAWER_FRONT) {
      issues.push({
        type: 'warning',
        message: `El frente de cajón (${d.frontHeight} mm) es muy pequeño (mínimo aconsejable ${MIN_DRAWER_FRONT} mm)`,
      });
    }
    const topOfDrawer = d.positionFromBase + d.frontHeight;
    if (topOfDrawer > interiorHeight) {
      issues.push({
        type: 'error',
        message: `Un cajón sobresale de la altura interior (${topOfDrawer} mm > ${interiorHeight} mm)`,
      });
    }
  }

  // Check dividers
  for (const div of config.dividers) {
    if (div.positionFromLeft <= config.boardThickness || div.positionFromLeft >= config.exteriorWidth - config.boardThickness) {
      issues.push({
        type: 'error',
        message: `Una división vertical excede los límites interiores (${div.positionFromLeft} mm)`,
      });
    }
  }

  return issues;
}

/**
 * Distribute N shelves uniformly inside the cabinet
 */
export function distributeShelvesUniformly(
  config: ParametricCabinetConfig,
  count: number
): ParametricShelf[] {
  const interiorHeight = config.exteriorHeight - config.plinthHeight - 2 * config.boardThickness;
  if (count <= 0 || interiorHeight <= 0) return [];

  const step = interiorHeight / (count + 1);
  const shelves: ParametricShelf[] = [];

  for (let i = 1; i <= count; i++) {
    shelves.push({
      id: newId('shelf-auto'),
      heightFromBase: Math.round(step * i),
      thickness: config.boardThickness,
      fullDepth: true,
    });
  }

  return shelves;
}

/**
 * Distribute N drawers uniformly at the bottom of the cabinet
 */
export function distributeDrawersUniformly(
  config: ParametricCabinetConfig,
  count: number,
  gap: number = 4
): ParametricDrawer[] {
  const interiorHeight = config.exteriorHeight - config.plinthHeight - 2 * config.boardThickness;
  if (count <= 0 || interiorHeight <= 0) return [];

  // Dedicate up to 70% or full height depending on count
  const maxAvailableHeight = Math.min(interiorHeight, count * 220);
  // floor (not round): rounding up can make the stack overshoot the interior height
  const individualHeight = Math.floor((maxAvailableHeight - gap * (count - 1)) / count);

  const drawers: ParametricDrawer[] = [];
  let currentY = 0;

  for (let i = 0; i < count; i++) {
    drawers.push({
      id: newId('drawer-auto'),
      frontHeight: individualHeight,
      positionFromBase: currentY,
      handleType: 'bar',
    });
    currentY += individualHeight + gap;
  }

  return drawers;
}

/**
 * Calculates complete cut list / despiece de tableros
 */
export function calculateCutList(config: ParametricCabinetConfig): BoardCutPiece[] {
  const cuts: BoardCutPiece[] = [];
  const {
    exteriorWidth: W,
    exteriorHeight: H,
    exteriorDepth: D,
    boardThickness: T,
    plinthHeight: P,
    finishMaterial: mat,
    shelves,
    drawers,
    dividers,
  } = config;

  const sideH = H - P;
  // Two lateral uprights
  cuts.push({
    name: 'Costados / Laterales',
    count: 2,
    width: D,
    height: sideH,
    thickness: T,
    material: mat,
  });

  // Top and bottom boards
  const innerW = W - 2 * T;
  cuts.push({
    name: 'Tapa superior',
    count: 1,
    width: innerW,
    height: D,
    thickness: T,
    material: mat,
  });

  cuts.push({
    name: 'Base inferior',
    count: 1,
    width: innerW,
    height: D,
    thickness: T,
    material: mat,
  });

  // Plinth
  if (P > 0) {
    cuts.push({
      name: 'Zócalo frontal',
      count: 1,
      width: innerW,
      height: P,
      thickness: T,
      material: mat,
    });
  }

  // Back panel
  if (config.hasBack) {
    cuts.push({
      name: 'Trasera',
      count: 1,
      width: innerW,
      height: sideH - 2 * T,
      thickness: config.backThickness,
      material: `${mat}_trasera`,
    });
  }

  // Vertical dividers
  if (dividers.length > 0) {
    cuts.push({
      name: 'Divisiones verticales',
      count: dividers.length,
      width: D - (config.hasBack ? config.backThickness : 0),
      height: sideH - 2 * T,
      thickness: T,
      material: mat,
    });
  }

  // Shelves
  if (shelves.length > 0) {
    cuts.push({
      name: 'Baldas interiores',
      count: shelves.length,
      width: innerW,
      height: D - (config.hasBack ? config.backThickness : 0) - 20, // 20mm setback
      thickness: T,
      material: mat,
    });
  }

  // Drawers: one cut line per distinct front height
  const fronts = new Map<number, number>();
  for (const d of drawers) fronts.set(d.frontHeight, (fronts.get(d.frontHeight) ?? 0) + 1);
  for (const [frontHeight, count] of fronts) {
    cuts.push({
      name: 'Frentes de cajón',
      count,
      width: innerW - 4,
      height: frontHeight,
      thickness: T,
      material: mat,
    });
  }

  return cuts;
}
