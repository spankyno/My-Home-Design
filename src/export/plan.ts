import { Point2D, Project } from '../types';
import { calculatePolygonArea, calculatePolygonPerimeter, distance, getBoundingBox, getRotatedCorners } from '../geometry';

const PLAN_MARGIN_MM = 500;

/** Escapes text for use inside XML/SVG content or attribute values. */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Quotes a CSV cell: doubles inner quotes and neutralises spreadsheet formulas
 * (a text starting with = + - @ would be executed by Excel).
 */
export function csvCell(value: string | number): string {
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** Safe file-name fragment from a project name. */
export function fileSlug(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || 'proyecto';
}

const decimalEs = (n: number) => n.toFixed(2).replace('.', ',');

/** World-space bounds (mm) of everything drawn in the plan, with margin. */
export function getPlanBounds(project: Project) {
  const points: Point2D[] = [
    ...project.walls.flatMap((w) => [w.start, w.end]),
    ...project.rooms.flatMap((r) => r.points),
    ...project.furniture.flatMap((f) => getRotatedCorners({ x: f.x, y: f.y }, f.width, f.depth, f.rotation)),
  ];
  const box = points.length > 0 ? getBoundingBox(points) : { minX: 0, minY: 0, maxX: 6000, maxY: 6000 };
  const minX = box.minX - PLAN_MARGIN_MM;
  const minY = box.minY - PLAN_MARGIN_MM;
  return { minX, minY, width: box.maxX - box.minX + 2 * PLAN_MARGIN_MM, height: box.maxY - box.minY + 2 * PLAN_MARGIN_MM };
}

/**
 * Vector floor plan. Styling uses presentation attributes only: a CSS rule for the
 * same property would override them (that made every wall 140 mm thick before).
 * `size` sets the pixel dimensions (needed to rasterise); otherwise it scales to fit.
 */
export function buildPlanSvg(project: Project, size?: { width: number; height: number }): string {
  const { minX, minY, width, height } = getPlanBounds(project);
  const dims = size ? `width="${size.width}" height="${size.height}"` : 'width="100%" height="100%"';
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" ${dims}>`,
    `  <rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#ffffff"/>`,
  ];

  for (const r of project.rooms) {
    if (r.points.length < 3) continue;
    const pts = r.points.map((p) => `${p.x},${p.y}`).join(' ');
    out.push(
      `  <polygon points="${pts}" fill="${escapeXml(r.floorColor || '#f1f5f9')}" fill-opacity="0.5" stroke="#cbd5e1" stroke-width="20"/>`
    );
  }

  for (const w of project.walls) {
    out.push(
      `  <line x1="${w.start.x}" y1="${w.start.y}" x2="${w.end.x}" y2="${w.end.y}" stroke="#1e293b" stroke-width="${w.thickness || 150}" stroke-linecap="round"/>`
    );
  }

  for (const f of project.furniture) {
    out.push(
      `  <g transform="translate(${f.x}, ${f.y}) rotate(${f.rotation})">`,
      `    <rect x="${-f.width / 2}" y="${-f.depth / 2}" width="${f.width}" height="${f.depth}" rx="20" fill="${escapeXml(f.color || '#94a3b8')}" stroke="#334155" stroke-width="14"/>`,
      `    <text transform="rotate(${-f.rotation})" text-anchor="middle" dominant-baseline="central" font-family="sans-serif" font-size="90" font-weight="bold" fill="#0f172a">${escapeXml(f.name)}</text>`,
      `  </g>`
    );
  }

  out.push('</svg>');
  return out.join('\n');
}

/** Semicolon-separated report (Spanish Excel) with rooms, furniture and walls. */
export function buildCsvReport(project: Project, now: Date = new Date()): string {
  const row = (...cells: Array<string | number>) => cells.map(csvCell).join(';');
  const lines: string[] = [
    row(`INFORME DEL PROYECTO: ${project.name}`),
    row('Fecha de exportación', now.toLocaleString('es-ES')),
    row('Unidad de trabajo', project.unit),
    '',
    row('HABITACIONES Y ESPACIOS'),
    row('Nombre', 'Superficie (m2)', 'Perimetro (m)', 'Material de Suelo'),
  ];

  let totalM2 = 0;
  for (const r of project.rooms) {
    const area = calculatePolygonArea(r.points) / 1_000_000;
    totalM2 += area;
    lines.push(row(r.name, decimalEs(area), decimalEs(calculatePolygonPerimeter(r.points) / 1_000), r.floorMaterial));
  }
  lines.push(row('TOTAL SUPERFICIE UTIL', decimalEs(totalM2), '', ''), '');

  lines.push(
    row('MOBILIARIO Y OBJETOS'),
    row('Nombre', 'Categoria', 'Ancho (mm)', 'Fondo (mm)', 'Alto (mm)', 'Rotacion (deg)', 'Parametrico')
  );
  for (const f of project.furniture) {
    lines.push(row(f.name, f.category, f.width, f.depth, f.height, f.rotation, f.isParametric ? 'Si' : 'No'));
  }
  lines.push('');

  lines.push(row('PAREDES Y PARTICIONES'), row('ID', 'Longitud (mm)', 'Grosor (mm)', 'Altura (mm)'));
  for (const w of project.walls) {
    lines.push(row(w.id, Math.round(distance(w.start, w.end)), w.thickness, w.height));
  }

  return '\uFEFF' + lines.join('\r\n');
}
