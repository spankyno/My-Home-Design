import * as THREE from 'three';
import { FloorMaterialType, WallFinishType } from '../types';

export interface MaterialDefinition {
  id: string;
  name: string;
  category: 'suelo_madera' | 'suelo_ceramico' | 'suelo_continuo' | 'pared_pintura' | 'pared_revestimiento';
  colorHex: string;
  description: string;
}

export const FLOOR_MATERIALS: Array<{
  id: FloorMaterialType;
  name: string;
  categoryName: string;
  colorHex: string;
  roughness: number;
  metalness: number;
  description: string;
}> = [
  {
    id: 'parquet_herringbone',
    name: 'Parquet en Espiga (Herringbone)',
    categoryName: 'Maderas Nobles',
    colorHex: '#d4a373',
    roughness: 0.35,
    metalness: 0.05,
    description: 'Roble natural colocado en patrón chevron en espiga tradicional.',
  },
  {
    id: 'parquet_plank',
    name: 'Tarima Roble Nórdico',
    categoryName: 'Maderas Nobles',
    colorHex: '#e9edc9',
    roughness: 0.4,
    metalness: 0.05,
    description: 'Tablas anchas de madera clara escandinava de poro abierto.',
  },
  {
    id: 'wood_walnut',
    name: 'Nogal Americano Oscuro',
    categoryName: 'Maderas Nobles',
    colorHex: '#6f4e37',
    roughness: 0.35,
    metalness: 0.05,
    description: 'Madera oscura refinada con vetas profundas y acabado satinado.',
  },
  {
    id: 'hydraulic_tile',
    name: 'Mosaico Hidráulico Artesanal',
    categoryName: 'Cerámica y Piedra',
    colorHex: '#e0e1dd',
    roughness: 0.5,
    metalness: 0.05,
    description: 'Baldosas hidráulicas con motivos geométricos mediterráneos.',
  },
  {
    id: 'marble_carrara',
    name: 'Mármol Blanco Carrara',
    categoryName: 'Cerámica y Piedra',
    colorHex: '#f8fafc',
    roughness: 0.12,
    metalness: 0.15,
    description: 'Mármol blanco pulido de alto brillo con vetas grises suaves.',
  },
  {
    id: 'marble_nero',
    name: 'Mármol Negro Marquina',
    categoryName: 'Cerámica y Piedra',
    colorHex: '#1e293b',
    roughness: 0.12,
    metalness: 0.2,
    description: 'Mármol negro profundo con vetas minerales blancas contrastadas.',
  },
  {
    id: 'tile_ceramic',
    name: 'Porcelánico Rectificado 60×60',
    categoryName: 'Cerámica y Piedra',
    colorHex: '#cbd5e1',
    roughness: 0.25,
    metalness: 0.08,
    description: 'Baldosas porcelánicas de junta mínima en gris arquitectónico.',
  },
  {
    id: 'concrete_polished',
    name: 'Microcemento Continuo',
    categoryName: 'Continuos e Industriales',
    colorHex: '#94a3b8',
    roughness: 0.3,
    metalness: 0.1,
    description: 'Pavimento continuo pulido sin juntas de estilo industrial contemporáneo.',
  },
  {
    id: 'terrazzo',
    name: 'Terrazo Veneciano Claro',
    categoryName: 'Continuos e Industriales',
    colorHex: '#f1f5f9',
    roughness: 0.22,
    metalness: 0.08,
    description: 'Áridos pétreos incrustados sobre base clara pulida.',
  },
  {
    id: 'carpet_beige',
    name: 'Moqueta Textil Confort',
    categoryName: 'Textiles',
    colorHex: '#d6ccc2',
    roughness: 0.9,
    metalness: 0.0,
    description: 'Alfombrado textil suave de pelo corto de alto aislamiento térmico.',
  },
  {
    id: 'parquet',
    name: 'Parquet Clásico',
    categoryName: 'Maderas Nobles',
    colorHex: '#d97706',
    roughness: 0.4,
    metalness: 0.05,
    description: 'Acabado en roble miel estándar.',
  },
  {
    id: 'tile',
    name: 'Baldosa Estándar',
    categoryName: 'Cerámica y Piedra',
    colorHex: '#f1f5f9',
    roughness: 0.3,
    metalness: 0.1,
    description: 'Suelo cerámico liso de fácil limpieza.',
  },
  {
    id: 'concrete',
    name: 'Hormigón Fratasado',
    categoryName: 'Continuos e Industriales',
    colorHex: '#64748b',
    roughness: 0.6,
    metalness: 0.05,
    description: 'Acabado mate de hormigón para lofts y garajes.',
  },
  {
    id: 'marble',
    name: 'Mármol Blanco Estándar',
    categoryName: 'Cerámica y Piedra',
    colorHex: '#ffffff',
    roughness: 0.15,
    metalness: 0.1,
    description: 'Piedra natural clara.',
  },
  {
    id: 'carpet',
    name: 'Moqueta Neutra',
    categoryName: 'Textiles',
    colorHex: '#cbd5e1',
    roughness: 0.85,
    metalness: 0.0,
    description: 'Moqueta gris perla.',
  },
  {
    id: 'laminate',
    name: 'Tarima Laminada',
    categoryName: 'Maderas Nobles',
    colorHex: '#e2d9cc',
    roughness: 0.45,
    metalness: 0.05,
    description: 'Laminado AC5 resistente.',
  },
];

export const WALL_FINISHES: Array<{
  id: WallFinishType;
  name: string;
  colorHex: string;
  roughness: number;
  description: string;
}> = [
  {
    id: 'paint_white',
    name: 'Pintura Blanca Mate (RAL 9003)',
    colorHex: '#f8fafc',
    roughness: 0.85,
    description: 'Blanco luminoso de alta reflectancia y acabado aterciopelado.',
  },
  {
    id: 'paint_warm_gray',
    name: 'Pintura Gris Cálido Arena',
    colorHex: '#e2e0d8',
    roughness: 0.85,
    description: 'Tonalidad arena acogedora para salones y dormitorios.',
  },
  {
    id: 'paint_sage',
    name: 'Verde Salvia Escandinavo',
    colorHex: '#9caf88',
    roughness: 0.85,
    description: 'Color orgánico y sereno muy utilizado en interiorismo nórdico.',
  },
  {
    id: 'paint_navy',
    name: 'Azul Marino Profundo',
    colorHex: '#1e3a5f',
    roughness: 0.85,
    description: 'Pared de acento elegante y señorial.',
  },
  {
    id: 'paint_charcoal',
    name: 'Gris Antracita Mate',
    colorHex: '#334155',
    roughness: 0.9,
    description: 'Contraste moderno para fondos de televisión o cabeceros.',
  },
  {
    id: 'tile_subway',
    name: 'Azulejo Metro Biselado Blanco',
    colorHex: '#ffffff',
    roughness: 0.2,
    description: 'Clásico azulejo tipo metro neoyorquino para baños y salpicaderos de cocina.',
  },
  {
    id: 'tile_marble',
    name: 'Revestimiento Cerámico Mármol',
    colorHex: '#f1f5f9',
    roughness: 0.15,
    description: 'Alicatado de gran formato con efecto mármol continuo.',
  },
  {
    id: 'brick_exposed',
    name: 'Ladrillo Visto Rústico',
    colorHex: '#b45309',
    roughness: 0.8,
    description: 'Pared de ladrillo caravista con juntas de mortero visto.',
  },
  {
    id: 'concrete_wall',
    name: 'Hormigón Visto con Encofrado',
    colorHex: '#64748b',
    roughness: 0.7,
    description: 'Paneles de hormigón visto arquitectónico con marcas de conos.',
  },
];

// Texture cache to avoid recomputing canvases
const _textureCache = new Map<string, THREE.CanvasTexture>();

/**
 * Procedural Texture Generator
 */
export function getProceduralTexture(type: string): THREE.CanvasTexture {
  if (_textureCache.has(type)) {
    return _textureCache.get(type)!;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  switch (type) {
    case 'parquet_herringbone': {
      // Herringbone pattern
      ctx.fillStyle = '#c59563';
      ctx.fillRect(0, 0, 512, 512);

      const plankW = 40;
      const plankL = 120;
      ctx.strokeStyle = 'rgba(75, 45, 20, 0.4)';
      ctx.lineWidth = 1.5;

      for (let y = -200; y < 700; y += plankW * 2) {
        for (let x = -200; x < 700; x += plankL) {
          ctx.save();
          ctx.translate(x, y);
          // Angle 45 deg
          ctx.rotate(Math.PI / 4);
          ctx.fillStyle = ((x + y) % (plankL * 2) === 0) ? '#d4a373' : '#b88456';
          ctx.fillRect(0, 0, plankL, plankW);
          ctx.strokeRect(0, 0, plankL, plankW);
          ctx.restore();
        }
      }
      break;
    }

    case 'parquet_plank':
    case 'parquet':
    case 'laminate': {
      // Staggered planks
      ctx.fillStyle = '#dfb182';
      ctx.fillRect(0, 0, 512, 512);
      ctx.strokeStyle = 'rgba(60, 35, 15, 0.45)';
      ctx.lineWidth = 2;

      const rowH = 64;
      for (let row = 0; row < 8; row++) {
        const y = row * rowH;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(512, y);
        ctx.stroke();

        const offset = (row % 2) * 128 + ((row % 3) * 64);
        for (let col = -1; col < 6; col++) {
          const x = col * 256 + offset;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + rowH);
          ctx.stroke();
        }
      }
      break;
    }

    case 'wood_walnut': {
      // Dark walnut
      ctx.fillStyle = '#4a3324';
      ctx.fillRect(0, 0, 512, 512);
      ctx.strokeStyle = 'rgba(25, 15, 10, 0.6)';
      ctx.lineWidth = 2;
      for (let row = 0; row < 8; row++) {
        const y = row * 64;
        ctx.fillStyle = row % 2 === 0 ? '#543d2c' : '#452f20';
        ctx.fillRect(0, y, 512, 64);
        ctx.strokeRect(0, y, 512, 64);
      }
      break;
    }

    case 'hydraulic_tile': {
      // Mediterranean decorative tile
      ctx.fillStyle = '#e8ecef';
      ctx.fillRect(0, 0, 512, 512);
      const size = 128;
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 2;

      for (let y = 0; y < 512; y += size) {
        for (let x = 0; x < 512; x += size) {
          ctx.strokeRect(x, y, size, size);
          // Central star/flower motif
          const cx = x + size / 2;
          const cy = y + size / 2;
          ctx.fillStyle = '#0284c7';
          ctx.beginPath();
          ctx.arc(cx, cy, 24, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#0369a1';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(cx, cy, 40, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      break;
    }

    case 'marble_carrara':
    case 'marble': {
      // Carrara white marble
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, 512, 512);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
      ctx.lineWidth = 4;

      // Organic curved veins
      ctx.beginPath();
      ctx.moveTo(30, 0);
      ctx.bezierCurveTo(150, 120, 200, 280, 320, 512);
      ctx.moveTo(250, 0);
      ctx.bezierCurveTo(320, 180, 180, 360, 480, 512);
      ctx.moveTo(0, 200);
      ctx.bezierCurveTo(180, 240, 380, 150, 512, 350);
      ctx.stroke();
      break;
    }

    case 'marble_nero': {
      // Black Marquina marble
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 512, 512);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.lineWidth = 3;

      ctx.beginPath();
      ctx.moveTo(60, 0);
      ctx.bezierCurveTo(180, 150, 120, 340, 420, 512);
      ctx.moveTo(350, 0);
      ctx.bezierCurveTo(220, 220, 380, 320, 200, 512);
      ctx.stroke();
      break;
    }

    case 'tile_ceramic':
    case 'tile': {
      // 60x60 Ceramic tile
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(0, 0, 512, 512);
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 3;

      const tileSize = 256;
      for (let y = 0; y < 512; y += tileSize) {
        for (let x = 0; x < 512; x += tileSize) {
          ctx.strokeRect(x, y, tileSize, tileSize);
        }
      }
      break;
    }

    case 'concrete_polished':
    case 'concrete': {
      // Polished microcement
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(0, 0, 512, 512);
      // Subtle cloud patches
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
        ctx.beginPath();
        const rx = Math.random() * 512;
        const ry = Math.random() * 512;
        ctx.arc(rx, ry, 60 + Math.random() * 80, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case 'terrazzo': {
      // Terrazzo
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(0, 0, 512, 512);
      const colors = ['#0f172a', '#b45309', '#0284c7', '#94a3b8', '#ca8a04'];
      for (let i = 0; i < 160; i++) {
        ctx.fillStyle = colors[i % colors.length];
        ctx.beginPath();
        const cx = Math.random() * 512;
        const cy = Math.random() * 512;
        ctx.ellipse(cx, cy, 3 + Math.random() * 6, 2 + Math.random() * 4, Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case 'carpet_beige':
    case 'carpet': {
      // Woven carpet
      ctx.fillStyle = '#d6ccc2';
      ctx.fillRect(0, 0, 512, 512);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.06)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 512; i += 8) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 512);
        ctx.moveTo(0, i);
        ctx.lineTo(512, i);
        ctx.stroke();
      }
      break;
    }

    case 'brick_exposed': {
      // Exposed Brick wall
      ctx.fillStyle = '#a14214';
      ctx.fillRect(0, 0, 512, 512);
      ctx.strokeStyle = '#e2e8f0'; // Mortar joint
      ctx.lineWidth = 5;

      const brickH = 48;
      const brickW = 128;
      for (let r = 0; r < 512 / brickH + 1; r++) {
        const y = r * brickH;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(512, y);
        ctx.stroke();

        const offset = (r % 2) * (brickW / 2);
        for (let c = -1; c < 512 / brickW + 2; c++) {
          const x = c * brickW + offset;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + brickH);
          ctx.stroke();
        }
      }
      break;
    }

    case 'tile_subway': {
      // Subway beveled tile
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 512, 512);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 3;

      const bh = 64;
      const bw = 128;
      for (let r = 0; r < 9; r++) {
        const y = r * bh;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(512, y);
        ctx.stroke();

        const offset = (r % 2) * (bw / 2);
        for (let c = -1; c < 6; c++) {
          const x = c * bw + offset;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + bh);
          ctx.stroke();
        }
      }
      break;
    }

    case 'concrete_wall': {
      // Architectural formwork concrete
      ctx.fillStyle = '#64748b';
      ctx.fillRect(0, 0, 512, 512);
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, 512, 256);
      ctx.strokeRect(0, 256, 512, 256);

      // Tie holes
      ctx.fillStyle = '#1e293b';
      const holes = [
        [64, 64], [448, 64], [64, 192], [448, 192],
        [64, 320], [448, 320], [64, 448], [448, 448]
      ];
      for (const [hx, hy] of holes) {
        ctx.beginPath();
        ctx.arc(hx, hy, 8, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    default: {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, 512, 512);
      break;
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.repeat.set(2, 2);

  _textureCache.set(type, texture);
  return texture;
}

/**
 * Creates or retrieves Three.js PBR material for floors
 */
export function createFloorMaterial(materialType: FloorMaterialType, customColor?: string): THREE.MeshStandardMaterial {
  const def = FLOOR_MATERIALS.find((m) => m.id === materialType) || FLOOR_MATERIALS[0];
  const texture = getProceduralTexture(materialType);

  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    color: customColor ? new THREE.Color(customColor) : new THREE.Color(def.colorHex),
    roughness: def.roughness,
    metalness: def.metalness,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  return mat;
}

/**
 * Creates Three.js PBR material for walls
 */
export function createWallMaterial(
  finishType?: WallFinishType,
  customColor?: string,
  isTransparent: boolean = false,
  opacity: number = 1.0,
  isSelected: boolean = false
): THREE.MeshStandardMaterial {
  if (isSelected) {
    return new THREE.MeshStandardMaterial({
      color: '#38bdf8',
      roughness: 0.5,
      metalness: 0.1,
      transparent: isTransparent,
      opacity,
    });
  }

  const def = WALL_FINISHES.find((w) => w.id === finishType);

  if (def && (def.id.startsWith('brick_') || def.id.startsWith('tile_') || def.id.startsWith('concrete_'))) {
    const tex = getProceduralTexture(def.id);
    return new THREE.MeshStandardMaterial({
      map: tex,
      color: customColor ? new THREE.Color(customColor) : new THREE.Color(def.colorHex),
      roughness: def.roughness,
      metalness: 0.05,
      transparent: isTransparent,
      opacity,
    });
  }

  return new THREE.MeshStandardMaterial({
    color: customColor || (def ? def.colorHex : '#e2e8f0'),
    roughness: def ? def.roughness : 0.85,
    metalness: 0.05,
    transparent: isTransparent,
    opacity,
  });
}
