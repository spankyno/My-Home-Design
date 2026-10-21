import React, { useEffect, useState } from 'react';
import {
  FolderOpen,
  Plus,
  Trash2,
  Copy,
  Upload,
  Clock,
  X,
  FileText,
  Sparkles,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore } from '../state/useEditorStore';
import { ProjectMetadata } from '../types';
import {
  listProjects,
  loadProject,
  deleteProject,
  saveProject,
  createEmptyProject,
  createSampleProject,
  importProjectFromJSON,
} from '../storage';
import { newId } from '../utils/id';

export const ProjectsModal: React.FC = () => {
  const { activeModal, project, closeModal, setProject, openProject, newProject } = useEditorStore(
    useShallow((s) => ({
      activeModal: s.activeModal,
      project: s.project,
      closeModal: s.closeModal,
      setProject: s.setProject,
      openProject: s.openProject,
      newProject: s.newProject,
    }))
  );
  const [projectsList, setProjectsList] = useState<ProjectMetadata[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshList = async () => {
    setLoading(true);
    const list = await listProjects();
    setProjectsList(list);
    setLoading(false);
  };

  useEffect(() => {
    if (activeModal === 'projects') {
      refreshList();
    }
  }, [activeModal]);

  if (activeModal !== 'projects') return null;

  const handleOpen = async (id: string) => {
    // Re-opening the project already on screen would only discard its unsaved state.
    if (id === project.id) {
      closeModal();
      return;
    }
    const loaded = await loadProject(id);
    if (loaded) {
      await openProject(loaded);
      closeModal();
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Estás seguro de que deseas eliminar el proyecto "${name}"?`)) return;

    await deleteProject(id);
    if (id === project.id) {
      // The deleted project is open: replace it right away (without flushing it back
      // to storage), otherwise the next autosave would silently recreate it.
      const fresh = createEmptyProject();
      setProject(fresh);
      await saveProject(fresh);
    }
    refreshList();
  };

  const handleDuplicate = async (id: string) => {
    // The open project may have edits that are not in storage yet.
    const source = id === project.id ? project : await loadProject(id);
    if (!source) return;

    const now = Date.now();
    await saveProject({
      ...source,
      id: newId('project'),
      name: `${source.name} (Copia)`,
      createdAt: now,
      updatedAt: now,
    });
    refreshList();
  };

  const handleLoadSample = async () => {
    const sample = createSampleProject();
    await saveProject(sample);
    await openProject(sample);
    closeModal();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const imported = importProjectFromJSON(await file.text());
      await saveProject(imported);
      await openProject(imported);
      closeModal();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al importar archivo JSON.');
    } finally {
      // Allow importing the same file again.
      input.value = '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl h-[75vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="h-14 border-b border-slate-200 px-6 flex items-center justify-between shrink-0 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-600 flex items-center justify-center text-white">
              <FolderOpen className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Mis Proyectos</h2>
              <p className="text-[11px] text-slate-500">Guardado local seguro en IndexedDB</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-2.5 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition-all">
              <Upload className="w-3.5 h-3.5" />
              <span>Importar JSON</span>
              <input type="file" accept=".json" onChange={handleImportFile} className="hidden" />
            </label>

            <button
              onClick={() => {
                newProject();
                closeModal();
              }}
              className="bg-sky-600 hover:bg-sky-700 text-white font-semibold px-2.5 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nuevo</span>
            </button>

            <button
              onClick={closeModal}
              className="p-1.5 hover:bg-slate-200/60 rounded-lg text-slate-500 transition-colors ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Project List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {loading ? (
            <div className="text-center py-12 text-slate-400 text-xs">Cargando proyectos...</div>
          ) : projectsList.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-xs text-slate-500">No hay proyectos guardados aún.</p>
              <button
                onClick={handleLoadSample}
                className="bg-indigo-50 text-indigo-700 font-semibold px-4 py-2 rounded-xl text-xs inline-flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>Cargar Apartamento de Demostración</span>
              </button>
            </div>
          ) : (
            projectsList.map((item) => {
              const isCurrent = item.id === project.id;
              const dateStr = new Date(item.updatedAt).toLocaleString('es-ES', {
                dateStyle: 'medium',
                timeStyle: 'short',
              });
              return (
                <div
                  key={item.id}
                  className={`p-4 rounded-xl border flex items-center justify-between transition-all ${
                    isCurrent
                      ? 'bg-sky-50/60 border-sky-300 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div
                    onClick={() => handleOpen(item.id)}
                    className="flex-1 cursor-pointer flex items-center gap-3"
                  >
                    <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-800">{item.name}</span>
                        {isCurrent && (
                          <span className="text-[10px] bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded font-semibold">
                            Activo
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-0.5">
                        <Clock className="w-3 h-3" />
                        <span>{dateStr}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleDuplicate(item.id)}
                      title="Duplicar proyecto"
                      className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 rounded-lg transition-colors"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(item.id, item.name)}
                      title="Eliminar proyecto"
                      className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="border-t border-slate-200 p-3 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>Los datos se almacenan exclusivamente en tu navegador (sin necesidad de servidor).</span>
          <button
            onClick={handleLoadSample}
            className="text-sky-600 hover:text-sky-800 font-semibold"
          >
            Restaurar Ejemplo
          </button>
        </div>
      </div>
    </div>
  );
};
