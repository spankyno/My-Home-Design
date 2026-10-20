import { describe, it, expect } from 'vitest';
import { buildCsvReport, buildPlanSvg, csvCell, escapeXml, fileSlug } from '../export/plan';
import { createSampleProject } from '../storage';

describe('export helpers', () => {
  it('escapes XML special characters', () => {
    expect(escapeXml(`Mesa & "Sillas" <2>`)).toBe('Mesa &amp; &quot;Sillas&quot; &lt;2&gt;');
  });

  it('csvCell doubles quotes and neutralises formulas', () => {
    expect(csvCell('Armario 2" alto')).toBe('"Armario 2"" alto"');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell(-90)).toBe('"-90"');
  });

  it('fileSlug is filesystem safe', () => {
    expect(fileSlug('Mi Casa: ¡Piso/1!')).toBe('mi_casa_piso_1');
    expect(fileSlug('***')).toBe('proyecto');
  });

  it('SVG plan is well-formed with unusual names and keeps real wall thickness / floor colours', () => {
    const p = createSampleProject();
    p.furniture[0] = { ...p.furniture[0], name: 'Mesa & <Sillas>' };
    p.walls[0] = { ...p.walls[0], thickness: 275 };
    const svg = buildPlanSvg(p);

    expect(svg).toContain('Mesa &amp; &lt;Sillas&gt;');
    expect(svg).toContain('stroke-width="275"');
    expect(svg).not.toContain('<style'); // CSS would override the presentation attributes
    for (const r of p.rooms) expect(svg).toContain(`fill="${r.floorColor}"`);
    expect(svg.match(/<svg/g)).toHaveLength(1);
    expect(buildPlanSvg(p, { width: 800, height: 600 })).toContain('width="800" height="600"');
  });

  it('CSV report escapes names and lists every furniture row', () => {
    const p = createSampleProject();
    p.furniture[0] = { ...p.furniture[0], name: '=SUM(A1)' };
    const csv = buildCsvReport(p, new Date('2026-01-01T00:00:00Z'));
    expect(csv).toContain(`"'=SUM(A1)"`);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv.split('\r\n').filter((l) => l.includes(';"Si"') || l.includes(';"No"')).length).toBe(p.furniture.length);
  });
});
