import React from 'react';
import {
  Compass,
  Grid,
  Magnet,
  Maximize2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore } from '../state/useEditorStore';
import { formatMeasurement, calculatePolygonArea, calculatePolygonPerimeter } from '../geometry';

export const StatusBar: React.FC = () => {
  const {
    project,
    zoom,
    cursorWorldPos,
    setZoom,
    setGridSize,
    setSnapEnabled,
    fitToScreen
  } = useEditorStore(
    useShallow((s) => ({
      project: s.project,
      zoom: s.zoom,
      cursorWorldPos: s.cursorWorldPos,
      setZoom: s.setZoom,
      setGridSize: s.setGridSize,
      setSnapEnabled: s.setSnapEnabled,
      fitToScreen: s.fitToScreen,
    }))
  );

  // Total Net Surface (Sum of rooms)
  const totalNetAreaM2 = project.rooms.reduce((acc, r) => {
    return acc + calculatePolygonArea(r.points) / 1_000_000;
  }, 0);

  // Total Perimeter of rooms
  const totalPerimeterM = project.rooms.reduce((acc, r) => {
    return acc + calculatePolygonPerimeter(r.points) / 1_000;
  }, 0);

  // Approximate gross/built surface (net surface + wall thicknesses factor ~12%)
  const totalGrossAreaM2 = totalNetAreaM2 > 0 ? totalNetAreaM2 * 1.12 : 0;

  return (
    <footer className="h-8 bg-white border-t border-slate-200 px-4 flex items-center justify-between text-[11px] text-slate-600 select-none z-30 font-medium shadow-xs">
      {/* Left: Cursor coordinates & Snap */}
      <div className="flex items-center gap-4">
        {/* Coordinates */}
        <div className="flex items-center gap-1.5 font-mono text-slate-700">
          <Compass className="w-3.5 h-3.5 text-sky-600" />
          <span>
            X: {formatMeasurement(cursorWorldPos.x, project.unit)} &nbsp;·&nbsp; Y:{' '}
            {formatMeasurement(cursorWorldPos.y, project.unit)}
          </span>
        </div>

        <div className="w-[1px] h-3.5 bg-slate-200" />

        {/* Snap to Grid Toggle */}
        <button
          onClick={() => setSnapEnabled(!project.snapEnabled)}
          title="Ajuste Magnético (Snap a rejilla y vértices)"
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
            project.snapEnabled
              ? 'text-sky-700 bg-sky-50 font-semibold'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Magnet className="w-3 h-3" />
          <span>Snap {project.snapEnabled ? 'ON' : 'OFF'}</span>
        </button>

        {/* Grid spacing */}
        <div className="flex items-center gap-1 text-slate-500">
          <Grid className="w-3 h-3" />
          <select
            value={project.gridSize}
            onChange={(e) => setGridSize(parseInt(e.target.value) || 100)}
            className="bg-transparent hover:bg-slate-100 rounded px-1 py-0.5 text-[11px] cursor-pointer focus:outline-hidden"
          >
            <option value="50">Rejilla 50 mm</option>
            <option value="100">Rejilla 100 mm</option>
            <option value="200">Rejilla 200 mm</option>
            <option value="500">Rejilla 500 mm</option>
            <option value="1000">Rejilla 1000 mm</option>
          </select>
        </div>
      </div>

      {/* Center: Real Architectural Surfaces */}
      <div className="hidden md:flex items-center gap-4 text-slate-600">
        <div>
          <span className="text-slate-400">Sup. Útil:</span>{' '}
          <strong className="text-slate-800 font-bold">
            {totalNetAreaM2.toFixed(2).replace('.', ',')} m²
          </strong>
        </div>
        <div className="w-[1px] h-3 bg-slate-200" />
        <div>
          <span className="text-slate-400">Sup. Construida aprox:</span>{' '}
          <strong className="text-slate-800 font-bold">
            {totalGrossAreaM2.toFixed(2).replace('.', ',')} m²
          </strong>
        </div>
        <div className="w-[1px] h-3 bg-slate-200" />
        <div>
          <span className="text-slate-400">Perímetro total:</span>{' '}
          <strong className="text-slate-800 font-bold">
            {totalPerimeterM.toFixed(1).replace('.', ',')} m
          </strong>
        </div>
      </div>

      {/* Right: Zoom controls & Fit to screen */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setZoom((z) => Math.max(0.02, z * 0.85))}
          title="Alejar Zoom (-)"
          className="p-1 hover:bg-slate-100 rounded text-slate-600"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>

        <span className="font-mono text-slate-700 w-12 text-center">
          {Math.round(zoom * 1000)}%
        </span>

        <button
          onClick={() => setZoom((z) => Math.min(2.0, z * 1.15))}
          title="Acercar Zoom (+)"
          className="p-1 hover:bg-slate-100 rounded text-slate-600"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => fitToScreen(window.innerWidth - 320, window.innerHeight - 100)}
          title="Ajustar plano a pantalla"
          className="flex items-center gap-1 ml-1 px-1.5 py-0.5 hover:bg-slate-100 rounded text-sky-700 font-medium"
        >
          <Maximize2 className="w-3 h-3" />
          <span className="hidden sm:inline">Ajustar</span>
        </button>
      </div>
    </footer>
  );
};
