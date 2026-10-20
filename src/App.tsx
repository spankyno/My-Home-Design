import React, { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore } from './state/useEditorStore';
import { loadLastSessionProject } from './storage';
import { Header } from './components/Header';
import { ToolSidebar } from './components/ToolSidebar';
import { PropertyInspector } from './components/PropertyInspector';
import { StatusBar } from './components/StatusBar';
import { EditorCanvas2D } from './editor2d/EditorCanvas2D';
import { EditorCanvas3D } from './editor3d/EditorCanvas3D';
import { ParametricModal } from './components/ParametricModal';
import { ProjectsModal } from './components/ProjectsModal';
import { ExportModal } from './components/ExportModal';
import { DimensionEditModal } from './components/DimensionEditModal';

const AUTOSAVE_DELAY_MS = 1500;

/** True when the key event comes from a control where typing must not trigger shortcuts. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
}

export const App: React.FC = () => {
  const {
    viewMode,
    project,
    isDirty,
    setProject,
    saveCurrentProject,
    undo,
    redo,
    deleteSelected,
    duplicateSelected,
    clearSelection,
    setActiveTool,
  } = useEditorStore(
    useShallow((s) => ({
      viewMode: s.viewMode,
      project: s.project,
      isDirty: s.isDirty,
      setProject: s.setProject,
      saveCurrentProject: s.saveCurrentProject,
      undo: s.undo,
      redo: s.redo,
      deleteSelected: s.deleteSelected,
      duplicateSelected: s.duplicateSelected,
      clearSelection: s.clearSelection,
      setActiveTool: s.setActiveTool,
    }))
  );

  // Load last session on mount
  useEffect(() => {
    let cancelled = false;
    loadLastSessionProject()
      .then((proj) => {
        // Don't clobber the project if the user already started editing.
        if (!cancelled && !useEditorStore.getState().isDirty) setProject(proj);
      })
      .catch((err) => console.error('Could not restore the last session', err));
    return () => {
      cancelled = true;
    };
  }, [setProject]);

  // Debounced autosave: runs AUTOSAVE_DELAY_MS after the *last* modification
  // (depending on `project` restarts the timer on every edit).
  useEffect(() => {
    if (!isDirty) return;
    const timer = setTimeout(saveCurrentProject, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [project, isDirty, saveCurrentProject]);

  // Flush pending changes as soon as the tab is hidden or the page is being left.
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === 'hidden' && useEditorStore.getState().isDirty) {
        saveCurrentProject();
      }
    };
    document.addEventListener('visibilitychange', flush);
    return () => document.removeEventListener('visibilitychange', flush);
  }, [saveCurrentProject]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && key === 'y') {
        e.preventDefault();
        redo();
      } else if (mod && key === 's') {
        e.preventDefault();
        saveCurrentProject();
      } else if (mod && key === 'd') {
        e.preventDefault();
        duplicateSelected();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelected();
      } else if (e.key === 'Escape') {
        clearSelection();
        setActiveTool('select');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, saveCurrentProject, duplicateSelected, deleteSelected, clearSelection, setActiveTool]);

  return (
    <div className="w-screen h-screen flex flex-col bg-slate-100 overflow-hidden font-sans text-slate-800 antialiased select-none">
      {/* Top Application Bar */}
      <Header />

      {/* Main Workspace (Left Sidebar + Center Canvas + Right Inspector) */}
      <main className="flex-1 flex overflow-hidden relative">
        <ToolSidebar />

        <div className="flex-1 h-full relative overflow-hidden bg-slate-100">
          {viewMode === '2d' ? <EditorCanvas2D /> : <EditorCanvas3D />}
        </div>

        <PropertyInspector />
      </main>

      {/* Bottom Status Bar */}
      <StatusBar />

      {/* Modals & Popovers */}
      <ParametricModal />
      <ProjectsModal />
      <ExportModal />
      <DimensionEditModal />
    </div>
  );
};

export default App;
