import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Sliders,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Download,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore } from '../state/useEditorStore';
import { newId } from '../utils/id';
import {
  ParametricCabinetConfig,
  CabinetType,
} from '../types';
import {
  createDefaultCabinetConfig,
  validateCabinetConfig,
  distributeShelvesUniformly,
  distributeDrawersUniformly,
  calculateCutList,
} from '../parametric';
import { saveLibraryItem } from '../storage';

export const ParametricModal: React.FC = () => {
  const {
    activeModal,
    editingParametricFurnitureId,
    project,
    closeModal,
    addFurniture,
    updateFurniture
  } = useEditorStore(
    useShallow((s) => ({
      activeModal: s.activeModal,
      editingParametricFurnitureId: s.editingParametricFurnitureId,
      project: s.project,
      closeModal: s.closeModal,
      addFurniture: s.addFurniture,
      updateFurniture: s.updateFurniture,
    }))
  );

  const [activeTab, setActiveTab] = useState<'preview' | 'cutlist'>('preview');
  const [cabinetType, setCabinetType] = useState<CabinetType>('closet');
  const [config, setConfig] = useState<ParametricCabinetConfig>(createDefaultCabinetConfig('closet'));
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Initialize config if editing existing item
  useEffect(() => {
    if (editingParametricFurnitureId) {
      const item = project.furniture.find((f) => f.id === editingParametricFurnitureId);
      if (item && item.parametricConfig) {
        setConfig(JSON.parse(JSON.stringify(item.parametricConfig)));
        setCabinetType(item.parametricConfig.type);
        return;
      }
    }
    setConfig(createDefaultCabinetConfig(cabinetType));
  }, [editingParametricFurnitureId, cabinetType]);

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Validation
  const issues = validateCabinetConfig(config);
  const errors = issues.filter((i) => i.type === 'error');

  // Cut List
  const cutList = calculateCutList(config);

  // Draw 4-View Technical CAD Preview onto Canvas
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, width, height);

    // Grid divider for 4 quadrants
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(width / 2, 0);
    ctx.lineTo(width / 2, height);
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Quadrant Titles
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.fillText('VISTA FRONTAL (ALZADO)', 15, 20);
    ctx.fillText('VISTA AXONOMÉTRICA 3D', width / 2 + 15, 20);
    ctx.fillText('VISTA SUPERIOR (PLANTA)', 15, height / 2 + 20);
    ctx.fillText('VISTA LATERAL (PERFIL)', width / 2 + 15, height / 2 + 20);

    // 1. FRONT VIEW (Top-Left quadrant: 0..W/2, 0..H/2)
    drawFrontView(ctx, config, width / 2, height / 2);

    // 2. 3D AXONOMETRIC VIEW (Top-Right quadrant: W/2..W, 0..H/2)
    drawAxonometricView(ctx, config, width / 2, height / 2, width / 2, 0);

    // 3. TOP VIEW (Bottom-Left quadrant: 0..W/2, H/2..H)
    drawTopView(ctx, config, width / 2, height / 2, 0, height / 2);

    // 4. SIDE VIEW (Bottom-Right quadrant: W/2..W, H/2..H)
    drawSideView(ctx, config, width / 2, height / 2, width / 2, height / 2);
  }, [config]);

  // Front View Drawing Helper
  function drawFrontView(ctx: CanvasRenderingContext2D, cfg: ParametricCabinetConfig, qW: number, qH: number) {
    const margin = 45;
    const scale = Math.min((qW - margin * 2) / cfg.exteriorWidth, (qH - margin * 2) / cfg.exteriorHeight);

    const drawW = cfg.exteriorWidth * scale;
    const drawH = cfg.exteriorHeight * scale;
    const originX = (qW - drawW) / 2;
    const originY = qH - (qH - drawH) / 2; // baseline

    ctx.save();
    // Carcass outer frame
    ctx.fillStyle = cfg.finishColor || '#f8fafc';
    ctx.fillRect(originX, originY - drawH, drawW, drawH);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.strokeRect(originX, originY - drawH, drawW, drawH);

    // Plinth
    if (cfg.plinthHeight > 0) {
      const plinthH = cfg.plinthHeight * scale;
      ctx.fillStyle = '#334155';
      ctx.fillRect(originX + 5, originY - plinthH, drawW - 10, plinthH);
    }

    const t = cfg.boardThickness * scale;
    const p = cfg.plinthHeight * scale;

    // Uprights (left & right)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.fillRect(originX, originY - drawH, t, drawH - p);
    ctx.fillRect(originX + drawW - t, originY - drawH, t, drawH - p);

    // Top and bottom boards
    ctx.fillRect(originX + t, originY - drawH, drawW - 2 * t, t);
    ctx.fillRect(originX + t, originY - p - t, drawW - 2 * t, t);

    // Dividers
    for (const div of cfg.dividers) {
      const divX = originX + div.positionFromLeft * scale;
      ctx.fillStyle = '#334155';
      ctx.fillRect(divX - (div.thickness * scale) / 2, originY - drawH + t, div.thickness * scale, drawH - p - 2 * t);
    }

    // Shelves
    for (const s of cfg.shelves) {
      const sY = originY - p - t - s.heightFromBase * scale;
      ctx.fillStyle = '#475569';
      ctx.fillRect(originX + t, sY - (s.thickness * scale) / 2, drawW - 2 * t, s.thickness * scale);

      // Dimension text
      ctx.fillStyle = '#0284c7';
      ctx.font = '9px Inter, sans-serif';
      ctx.fillText(`${s.heightFromBase} mm`, originX + t + 8, sY - 4);
    }

    // Drawers
    for (const d of cfg.drawers) {
      const dY = originY - p - t - (d.positionFromBase + d.frontHeight) * scale;
      const dH = d.frontHeight * scale;
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(originX + t + 2, dY, drawW - 2 * t - 4, dH);

      // Handle
      ctx.fillStyle = '#334155';
      ctx.fillRect(originX + drawW / 2 - 15, dY + dH / 2 - 2, 30, 4);
    }

    // Dimension lines
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#64748b';
    ctx.font = '10px Inter, sans-serif';
    // Bottom W label
    ctx.fillText(`${cfg.exteriorWidth} mm`, originX + drawW / 2 - 20, originY + 20);
    // Left H label
    ctx.fillText(`${cfg.exteriorHeight} mm`, originX - 35, originY - drawH / 2);

    ctx.restore();
  }

  // 3D Axonometric View Helper
  function drawAxonometricView(
    ctx: CanvasRenderingContext2D,
    cfg: ParametricCabinetConfig,
    qW: number,
    qH: number,
    offsetX: number,
    offsetY: number
  ) {
    const scale = Math.min((qW * 0.5) / cfg.exteriorWidth, (qH * 0.5) / cfg.exteriorHeight);
    const cx = offsetX + qW * 0.45;
    const cy = offsetY + qH * 0.8;

    const isoAngle = Math.PI / 6; // 30 deg
    const cosA = Math.cos(isoAngle);
    const sinA = Math.sin(isoAngle);

    // Function to project 3D mm (x: width, y: height, z: depth) to 2D
    const project3D = (x: number, y: number, z: number) => {
      const px = cx + (x - z) * cosA * scale;
      const py = cy - y * scale + (x + z) * sinA * scale * 0.5;
      return { x: px, y: py };
    };

    const W = cfg.exteriorWidth;
    const H = cfg.exteriorHeight;
    const D = cfg.exteriorDepth;

    ctx.save();
    // 3D Cabinet Box (Isometric)
    const p000 = project3D(0, 0, 0);
    const pW00 = project3D(W, 0, 0);
      const p00D = project3D(0, 0, D);

    const p0H0 = project3D(0, H, 0);
    const pWH0 = project3D(W, H, 0);
    const pWHD = project3D(W, H, D);
    const p0HD = project3D(0, H, D);

    // Back interior
    ctx.fillStyle = '#f1f5f9';
    ctx.beginPath();
    ctx.moveTo(p000.x, p000.y);
    ctx.lineTo(pW00.x, pW00.y);
    ctx.lineTo(pWH0.x, pWH0.y);
    ctx.lineTo(p0H0.x, p0H0.y);
    ctx.closePath();
    ctx.fill();

    // Left face
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.moveTo(p000.x, p000.y);
    ctx.lineTo(p00D.x, p00D.y);
    ctx.lineTo(p0HD.x, p0HD.y);
    ctx.lineTo(p0H0.x, p0H0.y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#334155';
    ctx.stroke();

    // Top face
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(p0H0.x, p0H0.y);
    ctx.lineTo(pWH0.x, pWH0.y);
    ctx.lineTo(pWHD.x, pWHD.y);
    ctx.lineTo(p0HD.x, p0HD.y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#334155';
    ctx.stroke();

    // Shelves in 3D
    for (const s of cfg.shelves) {
      const shY = cfg.plinthHeight + cfg.boardThickness + s.heightFromBase;
      const sp1 = project3D(0, shY, 0);
      const sp2 = project3D(W, shY, 0);
      const sp3 = project3D(W, shY, D);
      const sp4 = project3D(0, shY, D);

      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.moveTo(sp1.x, sp1.y);
      ctx.lineTo(sp2.x, sp2.y);
      ctx.lineTo(sp3.x, sp3.y);
      ctx.lineTo(sp4.x, sp4.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  }

  // Top View Helper
  function drawTopView(
    ctx: CanvasRenderingContext2D,
    cfg: ParametricCabinetConfig,
    qW: number,
    qH: number,
    offsetX: number,
    offsetY: number
  ) {
    const scale = Math.min((qW - 80) / cfg.exteriorWidth, (qH - 80) / cfg.exteriorDepth);
    const drawW = cfg.exteriorWidth * scale;
    const drawD = cfg.exteriorDepth * scale;
    const originX = offsetX + (qW - drawW) / 2;
    const originY = offsetY + (qH - drawD) / 2;

    ctx.save();
    ctx.fillStyle = cfg.finishColor || '#f8fafc';
    ctx.fillRect(originX, originY, drawW, drawD);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(originX, originY, drawW, drawD);

    // Backboard indication
    if (cfg.hasBack) {
      ctx.fillStyle = '#475569';
      ctx.fillRect(originX, originY, drawW, Math.max(3, cfg.backThickness * scale));
    }

    // Dividers in top view
    for (const div of cfg.dividers) {
      const dx = originX + div.positionFromLeft * scale;
      ctx.fillStyle = '#475569';
      ctx.fillRect(dx - 1, originY, 3, drawD);
    }

    ctx.fillStyle = '#64748b';
    ctx.font = '10px Inter, sans-serif';
    ctx.fillText(`Fondo: ${cfg.exteriorDepth} mm`, originX + drawW / 2 - 35, originY + drawD + 18);
    ctx.restore();
  }

  // Side View Helper
  function drawSideView(
    ctx: CanvasRenderingContext2D,
    cfg: ParametricCabinetConfig,
    qW: number,
    qH: number,
    offsetX: number,
    offsetY: number
  ) {
    const scale = Math.min((qW - 80) / cfg.exteriorDepth, (qH - 80) / cfg.exteriorHeight);
    const drawD = cfg.exteriorDepth * scale;
    const drawH = cfg.exteriorHeight * scale;
    const originX = offsetX + (qW - drawD) / 2;
    const originY = offsetY + qH - (qH - drawH) / 2;

    ctx.save();
    ctx.fillStyle = cfg.finishColor || '#f8fafc';
    ctx.fillRect(originX, originY - drawH, drawD, drawH);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(originX, originY - drawH, drawD, drawH);

    // Plinth setback
    if (cfg.plinthHeight > 0) {
      const plinthH = cfg.plinthHeight * scale;
      ctx.fillStyle = '#334155';
      ctx.fillRect(originX + 15, originY - plinthH, drawD - 30, plinthH);
    }

    ctx.fillStyle = '#64748b';
    ctx.font = '10px Inter, sans-serif';
    ctx.fillText(`${cfg.exteriorHeight} mm`, originX - 35, originY - drawH / 2);
    ctx.restore();
  }

  // Handle save into project or library
  const handleInsertIntoPlan = () => {
    if (editingParametricFurnitureId) {
      // Update existing item
      updateFurniture(editingParametricFurnitureId, {
        name: `Armario a Medida (${config.exteriorWidth}×${config.exteriorHeight})`,
        width: config.exteriorWidth,
        depth: config.exteriorDepth,
        height: config.exteriorHeight,
        color: config.finishColor,
        isParametric: true,
        parametricConfig: config,
      });
    } else {
      // Add new
      addFurniture({
        id: newId('f-param'),
        name: `Armario Paramétrico (${config.exteriorWidth}×${config.exteriorHeight})`,
        category: 'personalizado',
        x: 2000,
        y: 2000,
        z: 0,
        width: config.exteriorWidth,
        depth: config.exteriorDepth,
        height: config.exteriorHeight,
        rotation: 0,
        color: config.finishColor,
        material: config.finishMaterial,
        isLocked: false,
        lockProportions: false,
        isParametric: true,
        parametricConfig: config,
      });
    }
    closeModal();
  };

  const handleSaveToPersonalLibrary = async () => {
    await saveLibraryItem({
      name: `Plantilla ${config.type} ${config.exteriorWidth}×${config.exteriorHeight}`,
      category: 'parametric_template',
      data: config,
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  if (activeModal !== 'parametric_designer') return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="h-14 border-b border-slate-200 px-6 flex items-center justify-between shrink-0 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-xs">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">
                Diseñador de Mobiliario Paramétrico
              </h2>
              <p className="text-[11px] text-slate-500">
                Configuración milimétrica, vanos interiores, cajones y despiece de tableros
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Tab switch */}
            <div className="flex bg-slate-200/60 p-0.5 rounded-lg text-xs font-semibold">
              <button
                onClick={() => setActiveTab('preview')}
                className={`px-3 py-1 rounded-md transition-all ${
                  activeTab === 'preview' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600'
                }`}
              >
                Planos y 3D
              </button>
              <button
                onClick={() => setActiveTab('cutlist')}
                className={`px-3 py-1 rounded-md transition-all ${
                  activeTab === 'cutlist' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600'
                }`}
              >
                Despiece de Tableros ({cutList.length})
              </button>
            </div>

            <button
              onClick={closeModal}
              className="p-1.5 hover:bg-slate-200/60 rounded-lg text-slate-500 transition-colors ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Main Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Interactive Canvas or Cut List */}
          <div className="flex-1 bg-slate-50 flex flex-col relative overflow-hidden">
            {activeTab === 'preview' ? (
              <canvas
                ref={previewCanvasRef}
                width={700}
                height={550}
                className="w-full h-full block"
              />
            ) : (
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-800 text-sm">
                    Despiece de Fabricación (Lista de Corte de Tableros)
                  </h3>
                  <span className="text-xs text-slate-500 font-medium">
                    Grosor base: {config.boardThickness} mm
                  </span>
                </div>

                <table className="w-full text-xs text-left border-collapse bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
                  <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] font-bold">
                    <tr>
                      <th className="p-3">Componente</th>
                      <th className="p-3 text-center">Uds.</th>
                      <th className="p-3 text-right">Largo (mm)</th>
                      <th className="p-3 text-right">Ancho (mm)</th>
                      <th className="p-3 text-right">Grosor (mm)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-slate-700">
                    {cutList.map((piece, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80">
                        <td className="p-3 font-sans font-semibold text-slate-800">{piece.name}</td>
                        <td className="p-3 text-center font-bold text-indigo-600">{piece.count}</td>
                        <td className="p-3 text-right font-medium">{piece.height}</td>
                        <td className="p-3 text-right font-medium">{piece.width}</td>
                        <td className="p-3 text-right font-medium">{piece.thickness}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Validation Alerts Bar */}
            {issues.length > 0 && (
              <div className="absolute bottom-3 left-4 right-4 bg-amber-50 border border-amber-200 p-2.5 rounded-xl flex items-center gap-2 text-xs text-amber-800 shadow-md">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="truncate">{issues[0].message}</span>
              </div>
            )}
          </div>

          {/* Right: Parameter Controls Panel */}
          <div className="w-96 border-l border-slate-200 bg-white overflow-y-auto p-5 space-y-5">
            {/* Preset Type */}
            <div>
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-1.5">
                Tipo de Mueble
              </label>
              <select
                value={config.type}
                onChange={(e) => {
                  const t = e.target.value as CabinetType;
                  setCabinetType(t);
                  setConfig(createDefaultCabinetConfig(t));
                }}
                className="w-full text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-hidden"
              >
                <option value="closet">Armario Ropero / Vestidor</option>
                <option value="kitchen_base">Mueble Bajo Cocina</option>
                <option value="kitchen_top">Mueble Alto Cocina</option>
                <option value="shelf">Librería / Estantería</option>
                <option value="dresser">Cómoda de Cajones</option>
                <option value="custom">Mueble a Medida</option>
              </select>
            </div>

            {/* General Dimensions */}
            <div>
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-2">
                Medidas Exteriores (mm)
              </label>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className="text-[10px] text-slate-400 font-semibold">Ancho (W)</span>
                  <input
                    type="number"
                    value={config.exteriorWidth}
                    onChange={(e) => setConfig({ ...config, exteriorWidth: parseInt(e.target.value) || 0 })}
                    className="w-full text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg p-2"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-semibold">Alto (H)</span>
                  <input
                    type="number"
                    value={config.exteriorHeight}
                    onChange={(e) => setConfig({ ...config, exteriorHeight: parseInt(e.target.value) || 0 })}
                    className="w-full text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg p-2"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-semibold">Fondo (D)</span>
                  <input
                    type="number"
                    value={config.exteriorDepth}
                    onChange={(e) => setConfig({ ...config, exteriorDepth: parseInt(e.target.value) || 0 })}
                    className="w-full text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg p-2"
                  />
                </div>
              </div>
            </div>

            {/* Thickness & Plinth */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] text-slate-400 font-semibold">Grosor Tableros</span>
                <select
                  value={config.boardThickness}
                  onChange={(e) => setConfig({ ...config, boardThickness: parseInt(e.target.value) || 19 })}
                  className="w-full mt-1 text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg p-2"
                >
                  <option value="16">16 mm</option>
                  <option value="19">19 mm (Estándar)</option>
                  <option value="22">22 mm (Robusto)</option>
                  <option value="30">30 mm (Premium)</option>
                </select>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 font-semibold">Zócalo Inferior</span>
                <input
                  type="number"
                  value={config.plinthHeight}
                  onChange={(e) => setConfig({ ...config, plinthHeight: parseInt(e.target.value) || 0 })}
                  className="w-full mt-1 text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg p-2"
                />
              </div>
            </div>

            {/* Shelves Manager */}
            <div className="border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-700">Baldas Interiores ({config.shelves.length})</span>
                <button
                  onClick={() =>
                    setConfig({
                      ...config,
                      shelves: [
                        ...config.shelves,
                        { id: newId('sh'), heightFromBase: 400, thickness: config.boardThickness, fullDepth: true },
                      ],
                    })
                  }
                  className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Añadir
                </button>
              </div>

              {/* Uniform distribution preset */}
              <button
                onClick={() => setConfig({ ...config, shelves: distributeShelvesUniformly(config, 4) })}
                className="text-[10px] text-indigo-600 bg-indigo-50 hover:bg-indigo-100 font-semibold px-2 py-1 rounded-lg w-full mb-2 text-center"
              >
                Distribuir 4 baldas uniformemente
              </button>

              <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                {config.shelves.map((s, idx) => (
                  <div key={s.id} className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg text-xs">
                    <span className="text-slate-400 font-mono text-[10px]">#{idx + 1}</span>
                    <span className="text-slate-600">Altura:</span>
                    <input
                      type="number"
                      value={s.heightFromBase}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        setConfig({
                          ...config,
                          shelves: config.shelves.map((sh) => (sh.id === s.id ? { ...sh, heightFromBase: val } : sh)),
                        });
                      }}
                      className="w-20 font-bold bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-800"
                    />
                    <span className="text-slate-400 text-[10px]">mm</span>
                    <button
                      onClick={() =>
                        setConfig({
                          ...config,
                          shelves: config.shelves.filter((sh) => sh.id !== s.id),
                        })
                      }
                      className="ml-auto text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Drawers Manager */}
            <div className="border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-700">Cajoneras ({config.drawers.length})</span>
                <button
                  onClick={() =>
                    setConfig({
                      ...config,
                      drawers: distributeDrawersUniformly(config, 3),
                    })
                  }
                  className="text-[10px] text-indigo-600 bg-indigo-50 hover:bg-indigo-100 font-semibold px-2 py-1 rounded-lg"
                >
                  Generar 3 cajones
                </button>
              </div>

              <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                {config.drawers.map((d, idx) => (
                  <div key={d.id} className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg text-xs">
                    <span className="text-slate-400 font-mono text-[10px]">#{idx + 1}</span>
                    <span className="text-slate-600">Frente:</span>
                    <input
                      type="number"
                      value={d.frontHeight}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        setConfig({
                          ...config,
                          drawers: config.drawers.map((dr) => (dr.id === d.id ? { ...dr, frontHeight: val } : dr)),
                        });
                      }}
                      className="w-16 font-bold bg-white border border-slate-200 rounded px-1.5 py-0.5"
                    />
                    <span className="text-slate-400 text-[10px]">mm</span>
                    <button
                      onClick={() =>
                        setConfig({
                          ...config,
                          drawers: config.drawers.filter((dr) => dr.id !== d.id),
                        })
                      }
                      className="ml-auto text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="border-t border-slate-200 pt-4 space-y-2">
              <button
                onClick={handleInsertIntoPlan}
                disabled={errors.length > 0}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 shadow-md shadow-indigo-200 transition-all"
              >
                <Sparkles className="w-4 h-4" />
                <span>
                  {editingParametricFurnitureId ? 'Actualizar Mueble en Plano' : 'Insertar en el Plano'}
                </span>
              </button>

              <button
                onClick={handleSaveToPersonalLibrary}
                className="w-full bg-slate-100 hover:bg-slate-200/80 text-slate-700 font-semibold py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all"
              >
                {savedSuccess ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Download className="w-4 h-4" />}
                <span>{savedSuccess ? 'Guardado en Mi Biblioteca' : 'Guardar como Plantilla'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
