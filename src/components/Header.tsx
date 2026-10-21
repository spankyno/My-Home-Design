import React from 'react';
import {
  FolderOpen,
  Save,
  Undo2,
  Redo2,
  Plus,
  Download,
  Box,
  Layers,
  Sliders,
  Check,
  RotateCw,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore } from '../state/useEditorStore';
import { Unit } from '../types';

export const Header: React.FC = () => {
  const {
    project,
    viewMode,
    isSaving,
    isDirty,
    canUndo,
    canRedo,
    setViewMode,
    setUnit,
    newProject,
    saveCurrentProject,
    undo,
    redo,
    openModal
  } = useEditorStore(
    useShallow((s) => ({
      project: s.project,
      viewMode: s.viewMode,
      isSaving: s.isSaving,
      isDirty: s.isDirty,
      canUndo: s.historyIndex > 0 || s.uncommitted,
      canRedo: s.historyIndex < s.history.length - 1,
      setViewMode: s.setViewMode,
      setUnit: s.setUnit,
      newProject: s.newProject,
      saveCurrentProject: s.saveCurrentProject,
      undo: s.undo,
      redo: s.redo,
      openModal: s.openModal,
    }))
  );

  const handleUnitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setUnit(e.target.value as Unit);
  };

  return (
    <header className="h-14 bg-white border-b border-slate-200 px-4 flex items-center justify-between z-30 select-none shadow-xs">
      {/* Brand & Project Info */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center text-white shadow-sm shadow-sky-200">
          <Layers className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold text-slate-800 tracking-tight leading-none">
              My Home Design
            </h1>
            <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-100">
              CAD 2D/3D
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs text-slate-500 font-medium truncate max-w-[180px]">
              {project.name}
            </span>
            {isDirty ? (
              <span className="text-[10px] text-amber-600 flex items-center gap-1">
                • Modificado
              </span>
            ) : (
              <span className="text-[10px] text-emerald-600 flex items-center gap-0.5">
                <Check className="w-2.5 h-2.5" /> Guardado
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Action Toolbar */}
      <div className="flex items-center gap-1.5 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60">
        {/* Project Operations */}
        <button
          onClick={newProject}
          title="Nuevo Proyecto"
          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-all"
        >
          <Plus className="w-4 h-4" />
        </button>

        <button
          onClick={() => openModal('projects')}
          title="Abrir Proyecto"
          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-all flex items-center gap-1"
        >
          <FolderOpen className="w-4 h-4" />
          <span className="text-xs font-medium hidden sm:inline">Proyectos</span>
        </button>

        <button
          onClick={saveCurrentProject}
          disabled={isSaving}
          title="Guardar Proyecto Localmente"
          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-all flex items-center gap-1"
        >
          {isSaving ? <RotateCw className="w-4 h-4 animate-spin text-sky-600" /> : <Save className="w-4 h-4" />}
          <span className="text-xs font-medium hidden sm:inline">Guardar</span>
        </button>

        <div className="w-[1px] h-4 bg-slate-300 mx-1" />

        {/* Undo / Redo */}
        <button
          onClick={undo}
          disabled={!canUndo}
          title="Deshacer (Ctrl+Z)"
          className={`p-1.5 rounded-lg transition-all ${
            canUndo ? 'text-slate-700 hover:bg-white' : 'text-slate-300 cursor-not-allowed'
          }`}
        >
          <Undo2 className="w-4 h-4" />
        </button>

        <button
          onClick={redo}
          disabled={!canRedo}
          title="Rehacer (Ctrl+Y)"
          className={`p-1.5 rounded-lg transition-all ${
            canRedo ? 'text-slate-700 hover:bg-white' : 'text-slate-300 cursor-not-allowed'
          }`}
        >
          <Redo2 className="w-4 h-4" />
        </button>
      </div>

      {/* Mode Switch & Settings */}
      <div className="flex items-center gap-3">
        {/* Unit Selector */}
        <div className="flex items-center gap-1.5 text-xs text-slate-600">
          <span className="text-slate-400 font-medium">Unidad:</span>
          <select
            value={project.unit}
            onChange={handleUnitChange}
            className="bg-slate-100 hover:bg-slate-200/80 text-slate-800 font-semibold px-2 py-1 rounded-lg border border-slate-200 cursor-pointer focus:outline-hidden text-xs"
          >
            <option value="m">Metros (m)</option>
            <option value="cm">Centímetros (cm)</option>
            <option value="mm">Milímetros (mm)</option>
          </select>
        </div>

        {/* 2D / 3D Switch */}
        <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200">
          <button
            onClick={() => setViewMode('2d')}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              viewMode === '2d'
                ? 'bg-white text-sky-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>Planta 2D</span>
          </button>
          <button
            onClick={() => setViewMode('3d')}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              viewMode === '3d'
                ? 'bg-white text-sky-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Box className="w-3.5 h-3.5" />
            <span>Vista 3D</span>
          </button>
        </div>

        {/* Parametric Designer Launcher */}
        <button
          onClick={() => openModal('parametric_designer')}
          className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/60 font-semibold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-xs"
        >
          <Sliders className="w-3.5 h-3.5 text-indigo-600" />
          <span className="hidden md:inline">Muebles Paramétricos</span>
        </button>

        {/* Export Button */}
        <button
          onClick={() => openModal('export')}
          className="bg-sky-600 hover:bg-sky-700 text-white font-medium px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-xs shadow-sky-200"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Exportar</span>
        </button>
      </div>
    </header>
  );
};
