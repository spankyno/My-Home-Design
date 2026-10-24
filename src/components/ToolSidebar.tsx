import React, { useState } from 'react';
import {
  MousePointer,
  Hand,
  Square,
  Minus,
  Ruler,
  DoorOpen,
  AppWindow,
  Sliders,
  Layers,
  ChevronLeft,
  ChevronRight,
  Armchair,
  Eye,
  EyeOff,
  Sparkles,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore } from '../state/useEditorStore';
import { ActiveTool, FurnitureCategory, OpeningType } from '../types';
import { FURNITURE_CATALOG, OPENING_CATALOG, CATEGORY_LABELS, furnitureFromCatalog } from '../catalog';
import { convertToMm, buildRectRoom } from '../geometry';
import { newId } from '../utils/id';

type SidebarTab = 'tools' | 'furniture' | 'openings' | 'parametric' | 'layers';

const OPENING_ICONS: Record<OpeningType, React.ElementType> = {
  door: DoorOpen,
  double_door: DoorOpen,
  sliding_door: DoorOpen,
  window: AppWindow,
  french_window: AppWindow,
  passage: Square,
};

export const ToolSidebar: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<SidebarTab>('tools');
  const [selectedCategory, setSelectedCategory] = useState<FurnitureCategory>('salon');

  const {
    toggleLayer,
    activeTool,
    pendingFurnitureCatalogId,
    pendingOpeningType,
    project,
    setActiveTool,
    setPendingFurnitureCatalogId,
    setPendingOpeningType,
    openModal,
    addFurniture,
    addWall,
    addRoomWithWalls,
  } = useEditorStore(
    useShallow((s) => ({
      toggleLayer: s.toggleLayer,
      activeTool: s.activeTool,
      pendingFurnitureCatalogId: s.pendingFurnitureCatalogId,
      pendingOpeningType: s.pendingOpeningType,
      project: s.project,
      setActiveTool: s.setActiveTool,
      setPendingFurnitureCatalogId: s.setPendingFurnitureCatalogId,
      setPendingOpeningType: s.setPendingOpeningType,
      openModal: s.openModal,
      addFurniture: s.addFurniture,
      addWall: s.addWall,
      addRoomWithWalls: s.addRoomWithWalls,
    }))
  );

  const unit = project.unit;
  const [customRoomWidth, setCustomRoomWidth] = useState<number>(unit === 'm' ? 4.5 : unit === 'cm' ? 450 : 4500);
  const [customRoomHeight, setCustomRoomHeight] = useState<number>(unit === 'm' ? 3.5 : unit === 'cm' ? 350 : 3500);
  const [customWallLen, setCustomWallLen] = useState<number>(unit === 'm' ? 3.0 : unit === 'cm' ? 300 : 3000);
  const [customWallDir, setCustomWallDir] = useState<'h' | 'v'>('h');

  const handleSelectTool = (tool: ActiveTool) => setActiveTool(tool);

  const handleSelectOpening = (type: OpeningType) => {
    setPendingOpeningType(type);
  };

  const handleSelectFurniture = (catalogId: string) => {
    setPendingFurnitureCatalogId(catalogId);
  };

  const filteredFurniture = FURNITURE_CATALOG.filter((f) => f.category === selectedCategory);

  return (
    <aside
      className={`h-[calc(100vh-3.5rem)] bg-white border-r border-slate-200 flex transition-all duration-200 z-20 shadow-xs relative ${
        collapsed ? 'w-12' : 'w-72'
      }`}
    >
      {/* Collapse Toggle Handle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        title={collapsed ? 'Expandir panel' : 'Contraer panel'}
        className="absolute -right-3.5 top-6 w-7 h-7 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-800 shadow-md z-30 transition-transform"
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>

      {/* Vertical Icon Tabstrip */}
      <div className="w-12 border-r border-slate-100 flex flex-col items-center py-3 gap-2 bg-slate-50/60 shrink-0">
        <button
          onClick={() => {
            setActiveTab('tools');
            if (collapsed) setCollapsed(false);
          }}
          title="Herramientas de dibujo"
          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
            activeTab === 'tools'
              ? 'bg-sky-600 text-white shadow-sm'
              : 'text-slate-500 hover:bg-slate-200/60'
          }`}
        >
          <MousePointer className="w-4 h-4" />
        </button>

        <button
          onClick={() => {
            setActiveTab('furniture');
            if (collapsed) setCollapsed(false);
          }}
          title="Catálogo de Mobiliario"
          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
            activeTab === 'furniture'
              ? 'bg-sky-600 text-white shadow-sm'
              : 'text-slate-500 hover:bg-slate-200/60'
          }`}
        >
          <Armchair className="w-4 h-4" />
        </button>

        <button
          onClick={() => {
            setActiveTab('openings');
            if (collapsed) setCollapsed(false);
          }}
          title="Puertas y Ventanas"
          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
            activeTab === 'openings'
              ? 'bg-sky-600 text-white shadow-sm'
              : 'text-slate-500 hover:bg-slate-200/60'
          }`}
        >
          <DoorOpen className="w-4 h-4" />
        </button>

        <button
          onClick={() => {
            setActiveTab('parametric');
            if (collapsed) setCollapsed(false);
          }}
          title="Muebles Paramétricos"
          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
            activeTab === 'parametric'
              ? 'bg-sky-600 text-white shadow-sm'
              : 'text-slate-500 hover:bg-slate-200/60'
          }`}
        >
          <Sliders className="w-4 h-4" />
        </button>

        <button
          onClick={() => {
            setActiveTab('layers');
            if (collapsed) setCollapsed(false);
          }}
          title="Capas del plano"
          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
            activeTab === 'layers'
              ? 'bg-sky-600 text-white shadow-sm'
              : 'text-slate-500 hover:bg-slate-200/60'
          }`}
        >
          <Layers className="w-4 h-4" />
        </button>
      </div>

      {/* Expanded Tab Content */}
      {!collapsed && (
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-white">
          {/* TAB 1: DRAWING TOOLS */}
          {activeTab === 'tools' && (
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Edición y Navegación
                </h3>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => handleSelectTool('select')}
                    className={`p-2.5 rounded-xl border text-left text-xs font-medium flex items-center gap-2 transition-all ${
                      activeTool === 'select'
                        ? 'bg-sky-50 border-sky-300 text-sky-800 font-semibold'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <MousePointer className="w-4 h-4 text-sky-600" />
                    <span>Seleccionar</span>
                  </button>

                  <button
                    onClick={() => handleSelectTool('pan')}
                    className={`p-2.5 rounded-xl border text-left text-xs font-medium flex items-center gap-2 transition-all ${
                      activeTool === 'pan'
                        ? 'bg-sky-50 border-sky-300 text-sky-800 font-semibold'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Hand className="w-4 h-4 text-slate-600" />
                    <span>Desplazar</span>
                  </button>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Dibujo de Arquitectura
                </h3>
                <div className="space-y-3">
                  {/* Option 1: Preset Room 4x3 m */}
                  <button
                    onClick={() => {
                      const offset = (project.rooms.length % 5) * 600;
                      const p1 = { x: 500 + offset, y: 500 + offset };
                      const p3 = { x: 4500 + offset, y: 3500 + offset };

                      const { room, walls } = buildRectRoom(p1.x, p1.y, p3.x, p3.y, `Habitación ${project.rooms.length + 1} (4×3 m)`);
                      addRoomWithWalls(room, walls);
                      setActiveTool('select');
                    }}
                    className="w-full p-2.5 rounded-xl border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100/80 text-left text-xs font-medium flex items-center gap-2.5 transition-all text-indigo-950 shadow-xs cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
                    <div>
                      <div className="font-bold flex items-center gap-1.5">
                        <span>+ Habitación 4×3 m</span>
                        <span className="text-[10px] bg-indigo-200/80 text-indigo-800 px-1.5 py-0.2 rounded font-semibold">12 m²</span>
                      </div>
                      <div className="text-[10px] text-indigo-700">Inserta habitación instantánea con 4 paredes y suelo</div>
                    </div>
                  </button>

                  {/* Option 2: Custom Dimensions Rectangular Room */}
                  <div className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-xs text-slate-800">
                        <Square className="w-4 h-4 text-indigo-600" />
                        <span>Habitación a Medida</span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-medium">({unit})</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[10px] text-slate-400 font-medium">Ancho</span>
                        <input
                          type="number"
                          step={unit === 'm' ? '0.1' : '10'}
                          value={customRoomWidth}
                          onChange={(e) => setCustomRoomWidth(parseFloat(e.target.value) || 1)}
                          className="w-full text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-lg px-2 py-1 focus:outline-hidden focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-medium">Largo</span>
                        <input
                          type="number"
                          step={unit === 'm' ? '0.1' : '10'}
                          value={customRoomHeight}
                          onChange={(e) => setCustomRoomHeight(parseFloat(e.target.value) || 1)}
                          className="w-full text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-lg px-2 py-1 focus:outline-hidden focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    <div className="flex gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          const wMm = Math.max(500, Math.round(convertToMm(customRoomWidth, unit)));
                          const hMm = Math.max(500, Math.round(convertToMm(customRoomHeight, unit)));
                          const offset = (project.rooms.length % 5) * 600;
                          const p1 = { x: 500 + offset, y: 500 + offset };
                          const p3 = { x: 500 + offset + wMm, y: 500 + offset + hMm };

                          const { room, walls } = buildRectRoom(p1.x, p1.y, p3.x, p3.y, `Habitación ${project.rooms.length + 1} (${customRoomWidth}×${customRoomHeight} ${unit})`);
                          addRoomWithWalls(room, walls);
                          setActiveTool('select');
                        }}
                        className="flex-1 py-1.5 px-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors text-center cursor-pointer shadow-xs"
                      >
                        + Crear Habitación
                      </button>
                    </div>
                  </div>

                  {/* Option 3: Custom Wall */}
                  <div className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-xs text-slate-800">
                        <Minus className="w-4 h-4 text-emerald-600" />
                        <span>Pared Individual</span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-medium">({unit})</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[10px] text-slate-400 font-medium">Longitud</span>
                        <input
                          type="number"
                          step={unit === 'm' ? '0.1' : '10'}
                          value={customWallLen}
                          onChange={(e) => setCustomWallLen(parseFloat(e.target.value) || 1)}
                          className="w-full text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-lg px-2 py-1 focus:outline-hidden focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-medium">Sentido</span>
                        <select
                          value={customWallDir}
                          onChange={(e) => setCustomWallDir(e.target.value as 'h' | 'v')}
                          className="w-full text-xs font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg px-2 py-1 focus:outline-hidden"
                        >
                          <option value="h">Horizontal (→)</option>
                          <option value="v">Vertical (↓)</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          const lenMm = Math.max(200, Math.round(convertToMm(customWallLen, unit)));
                          const offset = (project.walls.length % 6) * 400;
                          const start = { x: 1000 + offset, y: 1000 + offset };
                          const end =
                            customWallDir === 'h'
                              ? { x: 1000 + offset + lenMm, y: 1000 + offset }
                              : { x: 1000 + offset, y: 1000 + offset + lenMm };

                          addWall({
                            id: newId('wall'),
                            start,
                            end,
                            thickness: 150,
                            height: 2600,
                          });
                          setActiveTool('select');
                        }}
                        className="flex-1 py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors text-center cursor-pointer shadow-xs"
                      >
                        + Insertar Pared
                      </button>
                    </div>
                  </div>

                  {/* Option 4: Measure distance between two points */}
                  <button
                    onClick={() => handleSelectTool('measure_distance')}
                    className={`w-full p-2.5 rounded-xl border text-left text-xs font-medium flex items-center gap-2.5 transition-all cursor-pointer ${
                      activeTool === 'measure_distance'
                        ? 'bg-sky-50 border-sky-300 text-sky-800 font-semibold'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Ruler className="w-4 h-4 text-amber-600" />
                    <div>
                      <div className="font-semibold">Medir</div>
                      <div className="text-[10px] text-slate-500">Distancia entre dos puntos del plano</div>
                    </div>
                  </button>
                </div>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 text-[11px] text-slate-600 space-y-1">
                <div className="font-semibold text-slate-800">Consejos de precisión CAD:</div>
                <div>• Pulsa <kbd className="px-1 py-0.5 bg-white border rounded">Shift</kbd> para selección múltiple.</div>
                <div>• Pulsa <kbd className="px-1 py-0.5 bg-white border rounded">Esc</kbd> para salir de la herramienta activa.</div>
                <div>• Haz clic en una cota azul para introducir la distancia exacta deseada.</div>
                <div>• Con un objeto seleccionado, las <kbd className="px-1 py-0.5 bg-white border rounded">flechas</kbd> lo mueven 10 mm (<kbd className="px-1 py-0.5 bg-white border rounded">Shift</kbd> una celda de rejilla, <kbd className="px-1 py-0.5 bg-white border rounded">Alt</kbd> 1 mm).</div>
                <div>• Mantén <kbd className="px-1 py-0.5 bg-white border rounded">Alt</kbd> al arrastrar para desactivar el imán.</div>
              </div>
            </div>
          )}

          {/* TAB 2: FURNITURE CATALOG */}
          {activeTab === 'furniture' && (
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              {/* Category selector */}
              <div className="p-2 border-b border-slate-100 bg-slate-50/50">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value as FurnitureCategory)}
                  className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-hidden"
                >
                  {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Items List */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                {filteredFurniture.map((item) => {
                  const isPending = pendingFurnitureCatalogId === item.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleSelectFurniture(item.id)}
                      className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                        isPending
                          ? 'bg-sky-50 border-sky-400 shadow-xs'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">{item.name}</span>
                        <span className="text-[10px] text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded font-medium">
                          {item.defaultWidth} × {item.defaultDepth} mm
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">{item.description}</p>
                      <div className="mt-2 flex items-center justify-between text-[10px]">
                        <span className="text-slate-400">Altura: {item.defaultHeight} mm</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              addFurniture(furnitureFromCatalog(item, { x: 2500, y: 2500 }));
                            }}
                            className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold transition-colors"
                            title="Insertar inmediatamente en el centro del plano"
                          >
                            + Al centro
                          </button>
                          <span className="text-sky-600 font-semibold">
                            {isPending ? 'Colocando...' : '+ Colocar'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: OPENINGS */}
          {activeTab === 'openings' && (
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Puertas y Ventanas
              </h3>
              <p className="text-xs text-slate-500">
                Inserta directamente en cualquier pared del plano o activa el puntero para colocarla con el ratón.
              </p>


              {pendingOpeningType && (
                <div className="bg-sky-50 border border-sky-300 p-2.5 rounded-xl text-xs text-sky-800 font-medium flex items-center gap-2 shadow-xs">
                  <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse shrink-0"></span>
                  <span>Modo colocación: Acerca el ratón a una pared en el plano y haz clic para fijarla.</span>
                </div>
              )}

              {OPENING_CATALOG.map((op) => {
                const isPending = pendingOpeningType === op.type;
                const Icon = OPENING_ICONS[op.type];
                return (
                  <div
                    key={op.type}
                    className={`p-2.5 rounded-xl border text-left text-xs transition-all ${
                      isPending
                        ? 'bg-sky-50 border-sky-400 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center text-sky-700 shrink-0">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-800 truncate">{op.name}</div>
                        <div className="text-[10px] text-slate-500 truncate">{op.desc}</div>
                      </div>
                    </div>

                    <div className="mt-2.5 flex items-center justify-end pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => handleSelectOpening(op.type)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${
                          isPending
                            ? 'bg-sky-100 text-sky-800 border-sky-300 font-bold'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                        title="Haz clic en una pared del plano para colocarla"
                      >
                        {isPending ? 'Colocando...' : 'Colocar'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 4: PARAMETRIC DESIGNER SHORTCUT */}
          {activeTab === 'parametric' && (
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 p-4 rounded-2xl text-white shadow-md">
                <div className="flex items-center gap-2 mb-2">
                  <Sliders className="w-5 h-5 text-indigo-200" />
                  <h4 className="font-bold text-sm">Diseñador Paramétrico</h4>
                </div>
                <p className="text-xs text-indigo-100 leading-relaxed mb-3">
                  Configura armarios, cocinas y estanterías con dimensiones exactas, baldas, cajones y despiece completo de tableros.
                </p>
                <button
                  onClick={() => openModal('parametric_designer')}
                  className="w-full bg-white text-indigo-800 hover:bg-indigo-50 font-bold py-2 px-3 rounded-xl text-xs shadow-xs transition-all text-center block"
                >
                  Abrir Taller Paramétrico
                </button>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Plantillas Rápidas
                </h4>
                <div className="space-y-1.5">
                  <button
                    onClick={() => openModal('parametric_designer')}
                    className="w-full p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-left text-xs"
                  >
                    <div className="font-semibold text-slate-800">Armario Ropero 1800×2200</div>
                    <div className="text-[10px] text-slate-500">2 módulos, baldas y cajonera</div>
                  </button>
                  <button
                    onClick={() => openModal('parametric_designer')}
                    className="w-full p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-left text-xs"
                  >
                    <div className="font-semibold text-slate-800">Librería Modular 1000×2000</div>
                    <div className="text-[10px] text-slate-500">4 baldas regulables</div>
                  </button>
                  <button
                    onClick={() => openModal('parametric_designer')}
                    className="w-full p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-left text-xs"
                  >
                    <div className="font-semibold text-slate-800">Cómoda 4 Cajones 1100×950</div>
                    <div className="text-[10px] text-slate-500">Frentes uniformes con tirador</div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: LAYERS */}
          {activeTab === 'layers' && (
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                Capas de Visualización
              </h3>

              {[
                { key: 'walls' as const, label: 'Paredes y Huecos', desc: 'Muros, puertas y ventanas' },
                { key: 'rooms' as const, label: 'Habitaciones', desc: 'Superficies y etiquetas' },
                { key: 'furniture' as const, label: 'Mobiliario', desc: 'Muebles y objetos' },
                { key: 'dimensions' as const, label: 'Cotas y Medidas', desc: 'Cotas dinámicas y manuales' },
              ].map((layer) => {
                const isVisible = project.layers[layer.key];
                return (
                  <div
                    key={layer.key}
                    onClick={() => toggleLayer(layer.key)}
                    className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-800">{layer.label}</div>
                      <div className="text-[10px] text-slate-500">{layer.desc}</div>
                    </div>
                    <button className="text-slate-500 hover:text-slate-800">
                      {isVisible ? (
                        <Eye className="w-4 h-4 text-sky-600" />
                      ) : (
                        <EyeOff className="w-4 h-4 text-slate-300" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </aside>
  );
};
