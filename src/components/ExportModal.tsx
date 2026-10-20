import React, { useState } from 'react';
import {
  Download,
  X,
  FileCode,
  Image,
  FileSpreadsheet,
  Box,
  CheckCircle2,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore } from '../state/useEditorStore';
import { exportProjectToJSON } from '../storage';
import { buildCsvReport, buildPlanSvg, fileSlug, getPlanBounds } from '../export/plan';
import { buildProjectGroup, disposeHierarchy } from '../editor3d/sceneBuilders';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

const PNG_TARGET_WIDTH = 2400;
const PNG_MAX_SIDE = 4096;
const MM_TO_M = 0.001; // glTF units are metres, the editor works in millimetres

export const ExportModal: React.FC = () => {
  const { activeModal, project, closeModal } = useEditorStore(
    useShallow((s) => ({
      activeModal: s.activeModal,
      project: s.project,
      closeModal: s.closeModal,
    }))
  );
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  if (activeModal !== 'export') return null;

  const triggerDownload = (blob: Blob, suffix: string) => {
    const filename = `${fileSlug(project.name)}_${suffix}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatusMsg(`¡Archivo "${filename}" descargado con éxito!`);
    setTimeout(() => setStatusMsg(null), 3000);
  };

  /** Runs an export that can fail, reporting errors to the user. */
  const run = async (label: string, task: () => Promise<void> | void) => {
    setBusy(true);
    try {
      await task();
    } catch (err) {
      alert(`Error al exportar ${label}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleExportJSON = () =>
    triggerDownload(new Blob([exportProjectToJSON(project)], { type: 'application/json' }), 'plan.json');

  const handleExportCSV = () =>
    triggerDownload(new Blob([buildCsvReport(project)], { type: 'text/csv;charset=utf-8;' }), 'informe.csv');

  const handleExportSVG = () =>
    triggerDownload(new Blob([buildPlanSvg(project)], { type: 'image/svg+xml;charset=utf-8' }), 'planta.svg');

  // PNG: rasterise the vector plan, so it always contains the whole plan (independent of
  // zoom/pan or of the 2D/3D view, where the WebGL canvas would come out blank).
  const handleExportPNG = () =>
    run('PNG', async () => {
      const { width, height } = getPlanBounds(project);
      const scale = Math.min(PNG_TARGET_WIDTH / width, PNG_MAX_SIDE / height);
      const px = { width: Math.round(width * scale), height: Math.round(height * scale) };

      const svgUrl = URL.createObjectURL(new Blob([buildPlanSvg(project, px)], { type: 'image/svg+xml;charset=utf-8' }));
      try {
        const img = new window.Image();
        img.src = svgUrl;
        await img.decode();

        const canvas = document.createElement('canvas');
        canvas.width = px.width;
        canvas.height = px.height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, px.width, px.height);

        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('No se pudo generar la imagen.');
        triggerDownload(blob, 'plano.png');
      } finally {
        URL.revokeObjectURL(svgUrl);
      }
    });

  // GLB: the same model shown in the 3D view (floors, walls with openings, furniture),
  // scaled from millimetres to metres.
  const handleExportGLB = () =>
    run('el modelo 3D', async () => {
      const model = buildProjectGroup(project, 'solid');
      try {
        const root = new THREE.Group();
        root.scale.setScalar(MM_TO_M);
        root.add(model);
        const scene = new THREE.Scene();
        scene.add(root);

        const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
        triggerDownload(new Blob([glb as ArrayBuffer], { type: 'model/gltf-binary' }), 'modelo3d.glb');
      } finally {
        disposeHierarchy(model);
      }
    });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden space-y-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-600 flex items-center justify-center text-white">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Exportar Proyecto</h2>
              <p className="text-[11px] text-slate-500">Formatos estándar de diseño e ingeniería</p>
            </div>
          </div>
          <button
            onClick={closeModal}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Notification */}
        {statusMsg && (
          <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl flex items-center gap-2 text-xs text-emerald-800 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{statusMsg}</span>
          </div>
        )}

        {/* Export Formats List */}
        <div className="space-y-2">
          {/* SVG */}
          <div
            onClick={handleExportSVG}
            className="p-3 rounded-xl border border-slate-200 hover:border-sky-300 hover:bg-sky-50/50 cursor-pointer flex items-center justify-between transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center">
                <FileCode className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800">Plano Vectorial (SVG)</div>
                <div className="text-[10px] text-slate-500">Escalable sin pérdida de resolución para AutoCAD / Illustrator</div>
              </div>
            </div>
            <Download className="w-4 h-4 text-slate-400" />
          </div>

          {/* PNG */}
          <div
            onClick={busy ? undefined : handleExportPNG}
            className={`p-3 rounded-xl border border-slate-200 hover:border-sky-300 hover:bg-sky-50/50 cursor-pointer flex items-center justify-between transition-all${busy ? ' opacity-50 cursor-wait' : ''}`}
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-sky-100 text-sky-600 flex items-center justify-center">
                <Image className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800">Imagen de Plano (PNG)</div>
                <div className="text-[10px] text-slate-500">Captura visual de alta definición del estado actual</div>
              </div>
            </div>
            <Download className="w-4 h-4 text-slate-400" />
          </div>

          {/* CSV */}
          <div
            onClick={handleExportCSV}
            className="p-3 rounded-xl border border-slate-200 hover:border-sky-300 hover:bg-sky-50/50 cursor-pointer flex items-center justify-between transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800">Informe y Mediciones (CSV)</div>
                <div className="text-[10px] text-slate-500">Listado de habitaciones, m², perímetros y muebles para Excel</div>
              </div>
            </div>
            <Download className="w-4 h-4 text-slate-400" />
          </div>

          {/* GLB 3D */}
          <div
            onClick={busy ? undefined : handleExportGLB}
            className={`p-3 rounded-xl border border-slate-200 hover:border-sky-300 hover:bg-sky-50/50 cursor-pointer flex items-center justify-between transition-all${busy ? ' opacity-50 cursor-wait' : ''}`}
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
                <Box className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800">Modelo Tridimensional (GLB)</div>
                <div className="text-[10px] text-slate-500">Compatible con Blender, SketchUp, Unity y visores WebGL</div>
              </div>
            </div>
            <Download className="w-4 h-4 text-slate-400" />
          </div>

          {/* JSON */}
          <div
            onClick={handleExportJSON}
            className="p-3 rounded-xl border border-slate-200 hover:border-sky-300 hover:bg-sky-50/50 cursor-pointer flex items-center justify-between transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
                <FileCode className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800">Copia de Seguridad (JSON)</div>
                <div className="text-[10px] text-slate-500">Proyecto completo con geometría, muebles y parámetros</div>
              </div>
            </div>
            <Download className="w-4 h-4 text-slate-400" />
          </div>
        </div>
      </div>
    </div>
  );
};
