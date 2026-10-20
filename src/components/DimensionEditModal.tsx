import React, { useState, useEffect } from 'react';
import { Ruler, X, Check } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore } from '../state/useEditorStore';
import { convertMmTo, convertToMm, formatMeasurement } from '../geometry';

export const DimensionEditModal: React.FC = () => {
  const {
    dimensionEditTarget,
    project,
    setDimensionEditTarget,
    applyExactDimensionDistance
  } = useEditorStore(
    useShallow((s) => ({
      dimensionEditTarget: s.dimensionEditTarget,
      project: s.project,
      setDimensionEditTarget: s.setDimensionEditTarget,
      applyExactDimensionDistance: s.applyExactDimensionDistance,
    }))
  );
  const [val, setVal] = useState<string>('');

  useEffect(() => {
    if (dimensionEditTarget) {
      const displayVal = convertMmTo(dimensionEditTarget.distance, project.unit);
      setVal(displayVal.toFixed(project.unit === 'mm' ? 0 : 2));
    }
  }, [dimensionEditTarget, project.unit]);

  if (!dimensionEditTarget) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(val.replace(',', '.'));
    if (!isNaN(num) && num >= 0) {
      const targetMm = convertToMm(num, project.unit);
      applyExactDimensionDistance(dimensionEditTarget, targetMm);
    }
    setDimensionEditTarget(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center">
              <Ruler className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-800">Cota Dinámica Exacta</h3>
              <p className="text-[10px] text-slate-500">Ajusta la separación del elemento</p>
            </div>
          </div>
          <button
            onClick={() => setDimensionEditTarget(null)}
            className="text-slate-400 hover:text-slate-600 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="flex justify-between text-[11px] font-semibold text-slate-600 mb-1.5">
              <span>Distancia actual:</span>
              <span className="font-mono text-slate-800">
                {formatMeasurement(dimensionEditTarget.distance, project.unit)}
              </span>
            </div>

            <label className="block text-xs font-bold text-slate-700 mb-1">
              Nueva distancia deseada ({project.unit})
            </label>
            <input
              type="text"
              autoFocus
              value={val}
              onChange={(e) => setVal(e.target.value)}
              className="w-full text-base font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:bg-white focus:border-sky-500 focus:outline-hidden"
              placeholder="Ej: 500 o 0.5"
            />
            <span className="text-[10px] text-slate-400 mt-1 block">
              El mueble se desplazará automáticamente para satisfacer esta separación exacta.
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDimensionEditTarget(null)}
              className="flex-1 py-2 px-3 border border-slate-200 text-slate-600 font-semibold rounded-xl text-xs hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 py-2 px-3 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm shadow-sky-200"
            >
              <Check className="w-4 h-4" />
              <span>Aplicar</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
