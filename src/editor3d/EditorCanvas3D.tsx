import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore } from '../state/useEditorStore';
import { buildProjectGroup, disposeHierarchy, PROJECT_ROOT_NAME } from './sceneBuilders';

// Module-level scratch objects to prevent GC allocations
const _raycaster = new THREE.Raycaster();
const _mouse = new THREE.Vector2();

/** A pointer that moves less than this (px) between down and up is a click, not an orbit drag. */
const CLICK_MAX_MOVE_PX = 5;

export const EditorCanvas3D: React.FC = () => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);

  const {
    project,
    selectedIds,
    camera3DPreset,
    wall3DMode,
    showShadows3D,
    selectObject,
    clearSelection,
    setCamera3DPreset,
    setWall3DMode,
    setShowShadows3D,
  } = useEditorStore(
    useShallow((s) => ({
      project: s.project,
      selectedIds: s.selectedIds,
      camera3DPreset: s.camera3DPreset,
      wall3DMode: s.wall3DMode,
      showShadows3D: s.showShadows3D,
      selectObject: s.selectObject,
      clearSelection: s.clearSelection,
      setCamera3DPreset: s.setCamera3DPreset,
      setWall3DMode: s.setWall3DMode,
      setShowShadows3D: s.setShowShadows3D,
    }))
  );

  // Initialize Three.js Scene (once)
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth;
    const height = mount.clientHeight;
    const initialShadows = useEditorStore.getState().showShadows3D;

    // 1. Scene & Background
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f1f5f9');
    scene.fog = new THREE.FogExp2('#f1f5f9', 0.00005);
    sceneRef.current = scene;

    // 2. Camera (Coordinates in mm: scale 1 Three.js unit = 1 mm)
    const camera = new THREE.PerspectiveCamera(45, width / height, 50, 100000);
    camera.position.set(3000, 7500, 9500);
    cameraRef.current = camera;

    // 3. Renderer with ACES ToneMapping & SRGB ColorSpace
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = initialShadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;
    mount.appendChild(renderer.domElement);

    // 4. Studio Environment Reflection (RoomEnvironment)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;
    pmremGenerator.dispose();

    // 5. Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2 - 0.02; // Don't go below ground
    controls.target.set(3000, 800, 3500);
    controlsRef.current = controls;

    // 6. Lighting Rig
    scene.add(new THREE.HemisphereLight('#f8fafc', '#94a3b8', 0.85));

    const dirLight = new THREE.DirectionalLight('#fffbeb', 1.8);
    dirLight.position.set(6000, 14000, 8000);
    dirLight.castShadow = initialShadows;
    dirLight.shadow.mapSize.set(2048, 2048);
    dirLight.shadow.camera.near = 500;
    dirLight.shadow.camera.far = 40000;
    dirLight.shadow.camera.left = -10000;
    dirLight.shadow.camera.right = 10000;
    dirLight.shadow.camera.top = 10000;
    dirLight.shadow.camera.bottom = -10000;
    dirLight.shadow.bias = -0.0005;
    dirLight.shadow.normalBias = 0.02;
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight('#e0f2fe', 0.6);
    fillLight.position.set(-6000, 6000, -6000);
    scene.add(fillLight);

    // 7. Ground Plane & Subtle Grid
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(60000, 60000),
      new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.9, metalness: 0.05 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -2;
    ground.receiveShadow = true;
    scene.add(ground);

    const gridHelper = new THREE.GridHelper(30000, 30, '#94a3b8', '#cbd5e1');
    gridHelper.position.y = -1;
    scene.add(gridHelper);

    // 8. Animation Loop
    let animId = 0;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // 9. Follow the container size (not just the window): the side panels can
    //    appear/disappear without any window resize.
    const resizeObserver = new ResizeObserver(() => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(mount);

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      controls.dispose();
      disposeHierarchy(scene);
      envTexture.dispose();
      renderer.dispose();
      renderer.forceContextLoss(); // browsers cap live WebGL contexts; free this one now
      renderer.domElement.remove();
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
    };
  }, []);

  // Update Shadow Map setting dynamically
  useEffect(() => {
    const scene = sceneRef.current;
    const renderer = rendererRef.current;
    if (!renderer || !scene) return;
    renderer.shadowMap.enabled = showShadows3D;
    scene.traverse((obj) => {
      if (obj instanceof THREE.Light && obj.castShadow !== undefined) obj.castShadow = showShadows3D;
      // Materials must be recompiled when shadow maps are switched on/off.
      if (obj instanceof THREE.Mesh) {
        (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => (m.needsUpdate = true));
      }
    });
  }, [showShadows3D]);

  // Camera presets. Deliberately NOT tied to the walls: editing a wall must not
  // throw away the viewpoint the user has orbited to. Re-frames on preset or project change.
  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const { walls } = useEditorStore.getState().project;
    let centerX = 3000;
    let centerZ = 3500;
    if (walls.length > 0) {
      let sumX = 0;
      let sumZ = 0;
      for (const w of walls) {
        sumX += w.start.x + w.end.x;
        sumZ += w.start.y + w.end.y;
      }
      centerX = sumX / (walls.length * 2);
      centerZ = sumZ / (walls.length * 2);
    }
    controls.target.set(centerX, 400, centerZ);

    switch (camera3DPreset) {
      case 'perspective':
        camera.position.set(centerX + 3500, 6500, centerZ + 6500);
        break;
      case 'top':
        camera.position.set(centerX, 14000, centerZ + 1);
        break;
      case 'front':
        camera.position.set(centerX, 2000, centerZ + 9000);
        break;
      case 'side':
        camera.position.set(centerX + 9000, 2000, centerZ);
        break;
    }
    camera.lookAt(centerX, 400, centerZ);
    controls.update();
  }, [camera3DPreset, project.id]);

  // Synchronize Scene Meshes with Project State
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const existing = scene.getObjectByName(PROJECT_ROOT_NAME);
    if (existing) {
      scene.remove(existing);
      disposeHierarchy(existing);
    }
    scene.add(buildProjectGroup(project, wall3DMode, selectedIds));
  }, [project, selectedIds, wall3DMode]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    pointerDownPos.current = { x: e.clientX, y: e.clientY };
  };

  // Select on click (pointer released without dragging) so that orbiting the camera
  // never changes the selection; clicking empty space clears it.
  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = pointerDownPos.current;
    pointerDownPos.current = null;
    if (e.button !== 0 || !start) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > CLICK_MAX_MOVE_PX) return;

    const mount = mountRef.current;
    const camera = cameraRef.current;
    const scene = sceneRef.current;
    if (!mount || !camera || !scene) return;

    const rect = mount.getBoundingClientRect();
    _mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    _raycaster.setFromCamera(_mouse, camera);

    const root = scene.getObjectByName(PROJECT_ROOT_NAME);
    const hit = root ? _raycaster.intersectObjects(root.children, true)[0] : undefined;

    // Walk up to the group that carries the project id
    let obj: THREE.Object3D | null = hit?.object ?? null;
    while (obj && !obj.userData?.id) obj = obj.parent;

    const multi = e.shiftKey || e.ctrlKey || e.metaKey;
    if (obj) selectObject(obj.userData.id as string, multi);
    else if (!multi) clearSelection();
  };

  return (
    <div className="relative w-full h-full overflow-hidden select-none">
      {/* 3D WebGL Canvas Container */}
      <div
        ref={mountRef}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        className="w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* Ergonomic Collapsible Bottom Dock (Zero Viewport Occlusion per Three.js skill) */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-slate-900/90 text-white px-4 py-2.5 rounded-2xl shadow-2xl backdrop-blur-md border border-slate-700/60 text-xs">
        {/* Camera Views */}
        <div className="flex items-center gap-1 border-r border-slate-700 pr-3">
          <span className="text-slate-400 font-medium mr-1">Cámara:</span>
          {(['perspective', 'top', 'front', 'side'] as const).map((cam) => (
            <button
              key={cam}
              onClick={() => setCamera3DPreset(cam)}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                camera3DPreset === cam
                  ? 'bg-sky-500 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              {cam === 'perspective' && 'Órbita'}
              {cam === 'top' && 'Planta'}
              {cam === 'front' && 'Frontal'}
              {cam === 'side' && 'Lateral'}
            </button>
          ))}
        </div>

        {/* Wall Modes */}
        <div className="flex items-center gap-1 border-r border-slate-700 pr-3 pl-1">
          <span className="text-slate-400 font-medium mr-1">Paredes:</span>
          {(['cutaway', 'solid', 'transparent'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setWall3DMode(mode)}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                wall3DMode === mode
                  ? 'bg-sky-500 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              {mode === 'cutaway' && 'Sección baja'}
              {mode === 'solid' && 'Completas'}
              {mode === 'transparent' && 'Translúcidas'}
            </button>
          ))}
        </div>

        {/* Shadows Toggle */}
        <button
          onClick={() => setShowShadows3D(!showShadows3D)}
          className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
            showShadows3D ? 'bg-amber-600/80 text-white' : 'text-slate-400 hover:bg-slate-800'
          }`}
        >
          {showShadows3D ? 'Sombras ON' : 'Sombras OFF'}
        </button>
      </div>
    </div>
  );
};
