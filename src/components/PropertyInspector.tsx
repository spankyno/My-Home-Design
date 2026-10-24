import React, { useState } from 'react';
import {
  Sliders,
  Trash2,
  Copy,
  Lock,
  Unlock,
  ChevronRight,
  ChevronLeft,
  RotateCw,
  Palette,
  Sparkles,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore } from '../state/useEditorStore';
import { newId } from '../utils/id';
import { convertMmTo, convertToMm, formatMeasurement, calculatePolygonArea, calculatePolygonPerimeter, distance, getBoundingBox } from '../geometry';
import { FloorMaterialType, WallFinishType } from '../types';
import { FLOOR_MATERIALS, WALL_FINISHES } from '../materials';

export const PropertyInspector: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);

  const {
    project,
    selectedIds,
    updateFurniture,
    updateWall,
    updateRoom,
    updateRoomDimensions,
    moveRoom,
    deleteRoom,
    updateOpening,
    deleteOpening,
    addOpening,
    deleteSelected,
    duplicateSelected,
    openModal
  } = useEditorStore(
    useShallow((s) => ({
      project: s.project,
      selectedIds: s.selectedIds,
      updateFurniture: s.updateFurniture,
      updateWall: s.updateWall,
      updateRoom: s.updateRoom,
      updateRoomDimensions: s.updateRoomDimensions,
      moveRoom: s.moveRoom,
      deleteRoom: s.deleteRoom,
      updateOpening: s.updateOpening,
      deleteOpening: s.deleteOpening,
      addOpening: s.addOpening,
      deleteSelected: s.deleteSelected,
      duplicateSelected: s.duplicateSelected,
      openModal: s.openModal,
    }))
  );

  const selectedId = selectedIds[0];
  const unit = project.unit;

  // Find selected entity
  const selectedFurniture = project.furniture.find((f) => f.id === selectedId);
  const selectedWall = project.walls.find((w) => w.id === selectedId);
  const selectedRoom = project.rooms.find((r) => r.id === selectedId);
  const selectedOpening = project.openings.find((o) => o.id === selectedId);

  // Helper to format values for inputs
  const toDisplay = (valMm: number): number => {
    const val = convertMmTo(valMm, unit);
    return Number(val.toFixed(unit === 'mm' ? 0 : unit === 'cm' ? 1 : 3));
  };

  const fromDisplay = (val: number): number => {
    return Math.round(convertToMm(val, unit));
  };

  return (
    <aside
      className={`h-[calc(100vh-3.5rem)] bg-white border-l border-slate-200 flex flex-col transition-all duration-200 z-20 shadow-xs relative ${
        collapsed ? 'w-10' : 'w-80'
      }`}
    >
      {/* Collapse Handle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        title={collapsed ? 'Expandir inspector' : 'Contraer inspector'}
        className="absolute -left-3.5 top-6 w-7 h-7 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-800 shadow-md z-30"
      >
        {collapsed ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>

      {/* Collapsed State Bar */}
      {collapsed && (
        <div className="flex-1 flex flex-col items-center py-4 text-slate-400">
          <Sliders className="w-4 h-4" />
        </div>
      )}

      {/* Main Inspector Body */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Header */}
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-sky-600" />
              <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Propiedades
              </h2>
            </div>
            {selectedIds.length > 0 && (
              <span className="text-[10px] font-semibold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full">
                {selectedIds.length === 1 ? '1 seleccionado' : `${selectedIds.length} seleccionados`}
              </span>
            )}
          </div>

          {/* 1. FURNITURE PROPERTIES */}
          {selectedFurniture && (
            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase">Nombre</label>
                <input
                  type="text"
                  value={selectedFurniture.name}
                  onChange={(e) => updateFurniture(selectedFurniture.id, { name: e.target.value })}
                  className="w-full mt-1 text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:bg-white focus:outline-hidden"
                />
              </div>

              {/* Dimensions (W, D, H) */}
              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase flex items-center justify-between">
                  <span>Dimensiones ({unit})</span>
                  <button
                    onClick={() =>
                      updateFurniture(selectedFurniture.id, {
                        lockProportions: !selectedFurniture.lockProportions,
                      })
                    }
                    title={selectedFurniture.lockProportions ? 'Proporciones bloqueadas' : 'Proporciones libres'}
                    className={`text-[10px] flex items-center gap-1 font-medium ${
                      selectedFurniture.lockProportions ? 'text-sky-600' : 'text-slate-400'
                    }`}
                  >
                    {selectedFurniture.lockProportions ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                    <span>{selectedFurniture.lockProportions ? 'Bloqueadas' : 'Libres'}</span>
                  </button>
                </label>
                <div className="grid grid-cols-3 gap-2 mt-1.5">
                  {selectedFurniture.shape === 'circle' ? (
                    <>
                  <div>
                    <span className="text-[10px] text-slate-400 font-medium">Diámetro</span>
                    <input
                      type="number"
                      step={unit === 'm' ? '0.05' : '10'}
                      value={toDisplay(selectedFurniture.width)}
                      onChange={(e) => {
                        const d = fromDisplay(parseFloat(e.target.value) || 0);
                        if (d > 10) updateFurniture(selectedFurniture.id, { width: d, depth: d });
                      }}
                      className="w-full text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:bg-white"
                    />
                  </div>
                    </>
                  ) : (
                    <>
                  <div>
                    <span className="text-[10px] text-slate-400 font-medium">Ancho (X)</span>
                    <input
                      type="number"
                      step={unit === 'm' ? '0.05' : '10'}
                      value={toDisplay(selectedFurniture.width)}
                      onChange={(e) => {
                        const newW = fromDisplay(parseFloat(e.target.value) || 0);
                        if (newW > 10) {
                          if (selectedFurniture.lockProportions && selectedFurniture.width > 0) {
                            const ratio = newW / selectedFurniture.width;
                            updateFurniture(selectedFurniture.id, {
                              width: newW,
                              depth: Math.round(selectedFurniture.depth * ratio),
                            });
                          } else {
                            updateFurniture(selectedFurniture.id, { width: newW });
                          }
                        }
                      }}
                      className="w-full text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:bg-white"
                    />
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 font-medium">Fondo (Y)</span>
                    <input
                      type="number"
                      step={unit === 'm' ? '0.05' : '10'}
                      value={toDisplay(selectedFurniture.depth)}
                      onChange={(e) => {
                        const newD = fromDisplay(parseFloat(e.target.value) || 0);
                        if (newD > 10) {
                          updateFurniture(selectedFurniture.id, { depth: newD });
                        }
                      }}
                      className="w-full text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:bg-white"
                    />
                  </div>
                    </>
                  )}

                  <div>
                    <span className="text-[10px] text-slate-400 font-medium">Alto (Z)</span>
                    <input
                      type="number"
                      step={unit === 'm' ? '0.05' : '10'}
                      value={toDisplay(selectedFurniture.height)}
                      onChange={(e) => {
                        const newH = fromDisplay(parseFloat(e.target.value) || 0);
                        if (newH > 10) {
                          updateFurniture(selectedFurniture.id, { height: newH });
                        }
                      }}
                      className="w-full text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Coordinates (X, Y, Elevation) */}
              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase">Posición en Planta ({unit})</label>
                <div className="grid grid-cols-2 gap-2 mt-1.5">
                  <div>
                    <span className="text-[10px] text-slate-400 font-medium">X Centro</span>
                    <input
                      type="number"
                      step={unit === 'm' ? '0.05' : '10'}
                      value={toDisplay(selectedFurniture.x)}
                      onChange={(e) => {
                        updateFurniture(selectedFurniture.id, {
                          x: fromDisplay(parseFloat(e.target.value) || 0),
                        });
                      }}
                      className="w-full text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:bg-white"
                    />
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 font-medium">Y Centro</span>
                    <input
                      type="number"
                      step={unit === 'm' ? '0.05' : '10'}
                      value={toDisplay(selectedFurniture.y)}
                      onChange={(e) => {
                        updateFurniture(selectedFurniture.id, {
                          y: fromDisplay(parseFloat(e.target.value) || 0),
                        });
                      }}
                      className="w-full text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Rotation */}
              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase flex items-center justify-between">
                  <span>Rotación</span>
                  <span className="text-xs font-bold text-slate-800">{selectedFurniture.rotation}°</span>
                </label>
                <div className="flex items-center gap-2 mt-1.5">
                  <input
                    type="range"
                    min="0"
                    max="360"
                    step="15"
                    value={selectedFurniture.rotation}
                    onChange={(e) =>
                      updateFurniture(selectedFurniture.id, { rotation: parseInt(e.target.value) || 0 })
                    }
                    className="flex-1 accent-sky-600 cursor-pointer"
                  />
                  <button
                    onClick={() =>
                      updateFurniture(selectedFurniture.id, {
                        rotation: (selectedFurniture.rotation + 90) % 360,
                      })
                    }
                    title="Girar 90°"
                    className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Color & Material */}
              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-1">
                  <Palette className="w-3 h-3 text-slate-400" />
                  <span>Color y Acabado</span>
                </label>
                <div className="flex items-center gap-2 mt-1.5">
                  <input
                    type="color"
                    value={selectedFurniture.color || '#475569'}
                    onChange={(e) => updateFurniture(selectedFurniture.id, { color: e.target.value })}
                    className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer p-0.5 bg-white"
                  />
                  <div className="flex-1 flex gap-1.5 overflow-x-auto py-1">
                    {['#475569', '#334155', '#cbd5e1', '#b45309', '#78350f', '#f8fafc', '#3b82f6'].map((c) => (
                      <button
                        key={c}
                        onClick={() => updateFurniture(selectedFurniture.id, { color: c })}
                        style={{ backgroundColor: c }}
                        className="w-6 h-6 rounded-md border border-slate-300 shadow-xs shrink-0"
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Parametric Special Button */}
              {selectedFurniture.isParametric && (
                <div className="bg-indigo-50 border border-indigo-200/80 p-3 rounded-xl space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <span>Mueble Paramétrico Activo</span>
                  </div>
                  <p className="text-[11px] text-indigo-700 leading-snug">
                    Este mueble dispone de reglas paramétricas, baldas interiores, cajones y despiece de tableros.
                  </p>
                  <button
                    onClick={() => openModal('parametric_designer', selectedFurniture.id)}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 rounded-lg text-xs transition-all shadow-xs"
                  >
                    Editar en Diseñador Paramétrico
                  </button>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={duplicateSelected}
                  className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200/80 text-slate-700 font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Duplicar</span>
                </button>
                <button
                  onClick={deleteSelected}
                  className="py-2 px-3 bg-red-50 hover:bg-red-100 text-red-600 font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Eliminar</span>
                </button>
              </div>
            </div>
          )}

          {/* 2. WALL PROPERTIES */}
          {selectedWall && (
            <div className="space-y-4">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1">
                <span className="text-[10px] text-slate-400 font-semibold uppercase">Longitud de Pared</span>
                <div className="text-lg font-black text-slate-800">
                  {formatMeasurement(distance(selectedWall.start, selectedWall.end), unit)}
                </div>
              </div>

              {/* Thickness & Height */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 uppercase">Grosor ({unit})</label>
                  <input
                    type="number"
                    value={toDisplay(selectedWall.thickness)}
                    onChange={(e) => {
                      const t = fromDisplay(parseFloat(e.target.value) || 150);
                      updateWall(selectedWall.id, { thickness: t });
                    }}
                    className="w-full mt-1 text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-500 uppercase">Altura ({unit})</label>
                  <input
                    type="number"
                    value={toDisplay(selectedWall.height)}
                    onChange={(e) => {
                      const h = fromDisplay(parseFloat(e.target.value) || 2600);
                      updateWall(selectedWall.id, { height: h });
                    }}
                    className="w-full mt-1 text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5"
                  />
                </div>
              </div>

              {/* Wall Start & End Coordinates */}
              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase">Inicio de Pared ({unit})</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <div>
                    <span className="text-[10px] text-slate-400">X1</span>
                    <input
                      type="number"
                      step={unit === 'm' ? '0.05' : '10'}
                      value={toDisplay(selectedWall.start.x)}
                      onChange={(e) => {
                        const val = fromDisplay(parseFloat(e.target.value) || 0);
                        updateWall(selectedWall.id, { start: { ...selectedWall.start, x: val } });
                      }}
                      className="w-full text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400">Y1</span>
                    <input
                      type="number"
                      step={unit === 'm' ? '0.05' : '10'}
                      value={toDisplay(selectedWall.start.y)}
                      onChange={(e) => {
                        const val = fromDisplay(parseFloat(e.target.value) || 0);
                        updateWall(selectedWall.id, { start: { ...selectedWall.start, y: val } });
                      }}
                      className="w-full text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase">Fin de Pared ({unit})</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <div>
                    <span className="text-[10px] text-slate-400">X2</span>
                    <input
                      type="number"
                      step={unit === 'm' ? '0.05' : '10'}
                      value={toDisplay(selectedWall.end.x)}
                      onChange={(e) => {
                        const val = fromDisplay(parseFloat(e.target.value) || 0);
                        updateWall(selectedWall.id, { end: { ...selectedWall.end, x: val } });
                      }}
                      className="w-full text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400">Y2</span>
                    <input
                      type="number"
                      step={unit === 'm' ? '0.05' : '10'}
                      value={toDisplay(selectedWall.end.y)}
                      onChange={(e) => {
                        const val = fromDisplay(parseFloat(e.target.value) || 0);
                        updateWall(selectedWall.id, { end: { ...selectedWall.end, y: val } });
                      }}
                      className="w-full text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1"
                    />
                  </div>
                </div>
              </div>

              {/* Wall Finish / Revestimiento */}
              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-1.5 mb-1.5">
                  <Palette className="w-3.5 h-3.5 text-sky-600" />
                  <span>Acabado de Pared</span>
                </label>
                <select
                  value={selectedWall.finishMaterial || 'paint_white'}
                  onChange={(e) => updateWall(selectedWall.id, { finishMaterial: e.target.value as WallFinishType })}
                  className="w-full text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:bg-white"
                >
                  {WALL_FINISHES.map((wf) => (
                    <option key={wf.id} value={wf.id}>
                      {wf.name}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  {WALL_FINISHES.find((w) => w.id === (selectedWall.finishMaterial || 'paint_white'))?.description}
                </p>
              </div>

              {/* Color */}
              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase">Tono / Color Pared</label>
                <div className="flex items-center gap-2 mt-1.5">
                  <input
                    type="color"
                    value={selectedWall.color || '#e2e8f0'}
                    onChange={(e) => updateWall(selectedWall.id, { color: e.target.value })}
                    className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer p-0.5 bg-white"
                  />
                  <div className="flex-1 flex gap-1.5 overflow-x-auto py-1">
                    {['#f8fafc', '#e2e0d8', '#9caf88', '#1e3a5f', '#334155', '#b45309'].map((c) => (
                      <button
                        key={c}
                        onClick={() => updateWall(selectedWall.id, { color: c })}
                        style={{ backgroundColor: c }}
                        className="w-6 h-6 rounded-md border border-slate-300 shadow-xs shrink-0"
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Wall Quick Actions: Insert Door/Window directly */}
              <div className="space-y-1.5 pt-1">
                <span className="text-[10px] text-slate-400 font-semibold uppercase">Añadir Hueco Directo</span>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const wallLen = distance(selectedWall.start, selectedWall.end);
                      addOpening({
                        id: newId('op'),
                        wallId: selectedWall.id,
                        type: 'door',
                        distanceAlongWall: Math.round(wallLen / 2),
                        width: 800,
                        height: 2050,
                        elevation: 0,
                        flipSide: false,
                        flipDirection: false,
                      });
                    }}
                    className="p-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-lg text-[11px] font-bold text-center border border-sky-200 transition-colors"
                  >
                    + Puerta Batiente
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const wallLen = distance(selectedWall.start, selectedWall.end);
                      addOpening({
                        id: newId('op'),
                        wallId: selectedWall.id,
                        type: 'window',
                        distanceAlongWall: Math.round(wallLen / 2),
                        width: 1200,
                        height: 1200,
                        elevation: 900,
                        flipSide: false,
                        flipDirection: false,
                      });
                    }}
                    className="p-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-lg text-[11px] font-bold text-center border border-sky-200 transition-colors"
                  >
                    + Ventana
                  </button>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <button
                  onClick={deleteSelected}
                  className="w-full py-2 px-3 bg-red-50 hover:bg-red-100 text-red-600 font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Eliminar Pared</span>
                </button>
              </div>
            </div>
          )}

          {/* 3. ROOM PROPERTIES */}
          {selectedRoom && (() => {
            const box = getBoundingBox(selectedRoom.points);
            const roomW = Math.max(100, box.maxX - box.minX);
            const roomH = Math.max(100, box.maxY - box.minY);
            const centerX = (box.minX + box.maxX) / 2;
            const centerY = (box.minY + box.maxY) / 2;

            return (
              <div className="space-y-4">
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 uppercase">Nombre del Espacio</label>
                  <input
                    type="text"
                    value={selectedRoom.name}
                    onChange={(e) => updateRoom(selectedRoom.id, { name: e.target.value })}
                    className="w-full mt-1 text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:bg-white"
                  />
                </div>

                {/* Dimensions (Width & Length in active unit) */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 uppercase flex items-center justify-between">
                    <span>Dimensiones del Espacio ({unit})</span>
                    <span className="text-[10px] text-sky-600 font-medium">Modifica medidas exactas</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2 mt-1.5">
                    <div>
                      <span className="text-[10px] text-slate-400 font-medium">Ancho (X)</span>
                      <input
                        type="number"
                        step={unit === 'm' ? '0.05' : '10'}
                        value={toDisplay(roomW)}
                        onChange={(e) => {
                          const val = fromDisplay(parseFloat(e.target.value) || 0);
                          if (val > 100) {
                            updateRoomDimensions(selectedRoom.id, val, roomH);
                          }
                        }}
                        className="w-full text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:bg-white focus:border-sky-400"
                      />
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 font-medium">Largo / Fondo (Y)</span>
                      <input
                        type="number"
                        step={unit === 'm' ? '0.05' : '10'}
                        value={toDisplay(roomH)}
                        onChange={(e) => {
                          const val = fromDisplay(parseFloat(e.target.value) || 0);
                          if (val > 100) {
                            updateRoomDimensions(selectedRoom.id, roomW, val);
                          }
                        }}
                        className="w-full text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:bg-white focus:border-sky-400"
                      />
                    </div>
                  </div>
                </div>

                {/* Room Center Position */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 uppercase">Posición en Planta ({unit})</label>
                  <div className="grid grid-cols-2 gap-2 mt-1.5">
                    <div>
                      <span className="text-[10px] text-slate-400 font-medium">X Centro</span>
                      <input
                        type="number"
                        step={unit === 'm' ? '0.05' : '10'}
                        value={toDisplay(centerX)}
                        onChange={(e) => {
                          const targetX = fromDisplay(parseFloat(e.target.value) || 0);
                          moveRoom(selectedRoom.id, targetX - centerX, 0);
                        }}
                        className="w-full text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:bg-white"
                      />
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 font-medium">Y Centro</span>
                      <input
                        type="number"
                        step={unit === 'm' ? '0.05' : '10'}
                        value={toDisplay(centerY)}
                        onChange={(e) => {
                          const targetY = fromDisplay(parseFloat(e.target.value) || 0);
                          moveRoom(selectedRoom.id, 0, targetY - centerY);
                        }}
                        className="w-full text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:bg-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Ceiling Height */}
                <div>
                  <span className="text-[10px] text-slate-400 font-medium">Altura de Paredes / Techo ({unit})</span>
                  <input
                    type="number"
                    step={unit === 'm' ? '0.05' : '10'}
                    value={toDisplay(selectedRoom.height || 2600)}
                    onChange={(e) => {
                      const h = fromDisplay(parseFloat(e.target.value) || 2600);
                      updateRoom(selectedRoom.id, { height: h });
                    }}
                    className="w-full mt-1 text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:bg-white"
                  />
                </div>

                {/* Area & Perimeter */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-sky-50 p-2.5 rounded-xl border border-sky-100">
                    <div className="text-[10px] text-sky-700 font-semibold uppercase">Superficie Útil</div>
                    <div className="text-base font-black text-sky-900 mt-0.5">
                      {(calculatePolygonArea(selectedRoom.points) / 1_000_000).toFixed(2).replace('.', ',')} m²
                    </div>
                  </div>

                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                    <div className="text-[10px] text-slate-500 font-semibold uppercase">Perímetro</div>
                    <div className="text-base font-black text-slate-800 mt-0.5">
                      {(calculatePolygonPerimeter(selectedRoom.points) / 1_000).toFixed(2).replace('.', ',')} m
                    </div>
                  </div>
                </div>

                {/* Advanced Material Selector with Swatches */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 uppercase flex items-center justify-between mb-1.5">
                    <span className="flex items-center gap-1.5">
                      <Palette className="w-3.5 h-3.5 text-sky-600" />
                      <span>Material de Pavimento</span>
                    </span>
                    <span className="text-[10px] text-sky-600 font-medium">Texturas PBR 3D</span>
                  </label>

                  <select
                    value={selectedRoom.floorMaterial}
                    onChange={(e) => {
                      const matId = e.target.value as FloorMaterialType;
                      const def = FLOOR_MATERIALS.find((m) => m.id === matId);
                      updateRoom(selectedRoom.id, {
                        floorMaterial: matId,
                        floorColor: def ? def.colorHex : selectedRoom.floorColor,
                      });
                    }}
                    className="w-full text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:bg-white mb-2"
                  >
                    {FLOOR_MATERIALS.map((mat) => (
                      <option key={mat.id} value={mat.id}>
                        {mat.name} ({mat.categoryName})
                      </option>
                    ))}
                  </select>

                  {/* Visual Swatches Grid */}
                  <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
                    {FLOOR_MATERIALS.map((mat) => {
                      const isSelected = selectedRoom.floorMaterial === mat.id;
                      return (
                        <button
                          key={mat.id}
                          type="button"
                          onClick={() =>
                            updateRoom(selectedRoom.id, {
                              floorMaterial: mat.id,
                              floorColor: mat.colorHex,
                            })
                          }
                          className={`p-1.5 rounded-lg border text-left flex items-center gap-2 transition-all ${
                            isSelected
                              ? 'border-sky-500 bg-sky-50/70 shadow-xs'
                              : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <span
                            className="w-5 h-5 rounded-md border border-slate-300 shrink-0 shadow-2xs"
                            style={{ backgroundColor: mat.colorHex }}
                          />
                          <div className="overflow-hidden">
                            <div className="text-[10px] font-bold text-slate-800 truncate leading-tight">
                              {mat.name}
                            </div>
                            <div className="text-[9px] text-slate-400 truncate leading-tight">
                              {mat.categoryName}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Color Tint */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 uppercase">Tono / Tinte Personalizado</label>
                  <div className="flex items-center gap-2 mt-1.5">
                    <input
                      type="color"
                      value={selectedRoom.floorColor || '#e2d9cc'}
                      onChange={(e) => updateRoom(selectedRoom.id, { floorColor: e.target.value })}
                      className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer p-0.5 bg-white"
                    />
                    <span className="text-xs text-slate-600 font-medium">Ajuste de color 2D y 3D</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <button
                    onClick={() => deleteRoom(selectedRoom.id, true)}
                    className="w-full py-2.5 px-3 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-2xs"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Eliminar Habitación y sus Paredes</span>
                  </button>
                  <button
                    onClick={() => deleteRoom(selectedRoom.id, false)}
                    className="w-full py-1.5 px-3 text-slate-500 hover:text-slate-700 hover:bg-slate-100 font-medium rounded-lg text-[10px] flex items-center justify-center gap-1 transition-all"
                  >
                    <span>Eliminar solo relleno (conservar paredes)</span>
                  </button>
                </div>
              </div>
            );
          })()}

          {/* 4. OPENING PROPERTIES */}
          {selectedOpening && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="text-xs font-bold text-slate-800 capitalize">
                  {selectedOpening.type.replace('_', ' ')}
                </div>
                <span className="text-[10px] bg-sky-100 text-sky-700 px-2 py-0.5 rounded font-semibold">
                  Pared: {selectedOpening.wallId}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-slate-400 font-medium">Ancho ({unit})</span>
                  <input
                    type="number"
                    step={unit === 'm' ? '0.05' : '10'}
                    value={toDisplay(selectedOpening.width)}
                    onChange={(e) => {
                      updateOpening(selectedOpening.id, { width: fromDisplay(parseFloat(e.target.value) || 800) });
                    }}
                    className="w-full text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5"
                  />
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 font-medium">Alto ({unit})</span>
                  <input
                    type="number"
                    step={unit === 'm' ? '0.05' : '10'}
                    value={toDisplay(selectedOpening.height)}
                    onChange={(e) => {
                      updateOpening(selectedOpening.id, { height: fromDisplay(parseFloat(e.target.value) || 2050) });
                    }}
                    className="w-full text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5"
                  />
                </div>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 font-medium">Altura desde suelo / Antepecho ({unit})</span>
                <input
                  type="number"
                  step={unit === 'm' ? '0.05' : '10'}
                  value={toDisplay(selectedOpening.elevation)}
                  onChange={(e) => {
                    updateOpening(selectedOpening.id, { elevation: fromDisplay(parseFloat(e.target.value) || 0) });
                  }}
                  className="w-full text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5"
                />
              </div>

              {/* Invert Side / Direction for doors */}
              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase">Orientación de Apertura</label>
                <div className="grid grid-cols-2 gap-2 mt-1.5">
                  <button
                    onClick={() => updateOpening(selectedOpening.id, { flipSide: !selectedOpening.flipSide })}
                    className="py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors"
                    title="Invertir lado interior/exterior"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>Lado: {selectedOpening.flipSide ? 'Int' : 'Ext'}</span>
                  </button>
                  <button
                    onClick={() => updateOpening(selectedOpening.id, { flipDirection: !selectedOpening.flipDirection })}
                    className="py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors"
                    title="Invertir mano de apertura (izquierda/derecha)"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>Mano: {selectedOpening.flipDirection ? 'Der' : 'Izq'}</span>
                  </button>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <button
                  onClick={() => deleteOpening(selectedOpening.id)}
                  className="w-full py-2 px-3 bg-red-50 hover:bg-red-100 text-red-600 font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Eliminar Hueco</span>
                </button>
              </div>
            </div>
          )}

          {/* 5. EMPTY SELECTION OVERVIEW */}
          {!selectedFurniture && !selectedWall && !selectedRoom && !selectedOpening && (
            <div className="space-y-4 text-xs text-slate-500">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 space-y-2">
                <h3 className="font-bold text-slate-700 text-xs uppercase tracking-wider">
                  Resumen del Proyecto
                </h3>
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex justify-between">
                    <span>Habitaciones:</span>
                    <span className="font-bold text-slate-800">{project.rooms.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Paredes construidas:</span>
                    <span className="font-bold text-slate-800">{project.walls.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Puertas y ventanas:</span>
                    <span className="font-bold text-slate-800">{project.openings.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Mobiliario distribuido:</span>
                    <span className="font-bold text-slate-800">{project.furniture.length}</span>
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                Selecciona cualquier mueble, pared o habitación en la vista 2D o en la vista 3D para editar sus cotas exactas, coordenadas y materiales.
              </p>
            </div>
          )}
        </div>
      )}
    </aside>
  );
};
