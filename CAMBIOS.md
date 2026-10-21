# Revisión del código — My Home Design

Verificado: `tsc --noEmit` (strict + noUnusedLocals/Parameters), 44 tests (antes 12) y `vite build`.

## Errores corregidos
| Área | Problema | Solución |
|---|---|---|
| Instalación | `npm install` fallaba (peer `esbuild ^0.25` vs Vite 8) | Eliminadas 8 dependencias sin uso (`esbuild`, `express`, `dotenv`, `tsx`, `autoprefixer`, `@google/genai`, `motion`, `@types/express`) |
| Deshacer/rehacer | Mezcla de snapshots pre/post-mutación: undo saltaba 2 pasos y redo nunca restauraba | Modelo único `edit`/`commit`; sin pasos vacíos; undo descarta primero ediciones del inspector; la unidad/rejilla/capas no se revierten |
| Cotas dinámicas | Al fijar una distancia el mueble se movía en sentido contrario (4 direcciones) | Signo corregido |
| 3D | Suelos invisibles desde arriba (back-face culling) | `DoubleSide` |
| 3D | Editar un muro reiniciaba la cámara | Efecto de cámara ya no depende de los muros |
| 3D | `wall.height` ignorada (fijo 2600/1200) | Se usa la altura real |
| 3D | Marcos de puertas/ventanas inexistentes (variables sin usar) | Marcos reales |
| 3D | Huecos fuera del muro → ancho negativo | Se ignoran |
| 3D | Selección al empezar a orbitar; clic en vacío no deseleccionaba | Selección en *clic*; deselecciona |
| 3D | Fuga de contexto WebGL / entorno sin liberar; no seguía cambios de layout | `dispose` + `forceContextLoss` + `ResizeObserver` |
| Exportar SVG | CSS de clase anulaba grosor, color de suelo y tamaño de texto; nombres con `&`/`<` generaban XML inválido | Atributos de presentación + escape XML |
| Exportar CSV | Comillas sin escapar; inyección de fórmulas | `csvCell` |
| Exportar PNG | Capturaba el canvas visible (en 3D salía vacío) | Rasteriza el plano completo desde el SVG |
| Exportar GLB | Cajas en mm (×1000 en Blender), sin suelos ni huecos | Mismo modelo que el visor 3D, escalado a metros |
| Persistencia | Duplicar un proyecto lo convertía en "último abierto" | `saveProject` ya no marca el activo |
| Persistencia | Borrar el proyecto abierto lo "resucitaba" al recargar/autoguardar | Limpieza del puntero y reemplazo inmediato |
| Persistencia | Cambiar de proyecto perdía ediciones pendientes del autoguardado | `openProject` guarda antes |
| Persistencia | Fallo total de guardado se mostraba como "guardado" | `saveProject` lanza error |
| Persistencia | JSON/proyectos antiguos sin `layers`/`openings`… rompían la app | `normalizeProject` |
| Autoguardado | No era debounce real | Debounce + guardado al ocultar la pestaña |
| Arrastre 2D | Deltas incrementales con redondeo y `project` obsoleto | Posición absoluta desde el inicio del arrastre |
| 2D | Rueda: `preventDefault` en listener pasivo | Listener nativo no pasivo |
| Paramétrico | Cajones autogenerados superaban la altura interior (`round`) | `floor` |
| Paramétrico | Despiece usaba la altura del primer cajón para todos | Agrupa por altura |
| Geometría | Centroide = media de vértices (mal en L) | Centroide ponderado por área |
| Geometría | `formatMeasurement(…, precision)` ignoraba `precision` | Respetado |
| IDs | `Date.now()` colisionaba (4 muros de una habitación…) | `newId()` |

## Redundancias eliminadas
- Lógica de "muros de una habitación" y "remapeo de muros" duplicada en el store → helpers compartidos.
- Creación de habitación rectangular copiada 3 veces → `buildRectRoom`.
- Constructores 3D duplicados entre visor y exportación → `editor3d/sceneBuilders.ts`.
- Estado derivado `activeDynamicDims` (estado + efecto) → `useMemo`.
- Copia doble del proyecto en localStorage → solo como respaldo si falla IndexedDB.
- ~40 imports/variables muertos; `strict`, `noUnusedLocals` activados; alias `@` y opciones de tsconfig sin uso eliminados; metadatos de Gemini retirados.
- Rendimiento: los 11 componentes usaban `useEditorStore()` sin selector (toda la UI se re-renderizaba en cada `mousemove`) → `useShallow`.

## Pendiente / recomendaciones (no modificado)
- `isLocked` existe en el modelo pero ningún código lo respeta.
- La biblioteca personal guarda objetos pero no hay UI para listarlos/borrarlos.
- El 3D del armario paramétrico no dibuja las puertas (`doors`).
- Las ediciones del inspector se agrupan en el siguiente paso de historial (sin un paso por campo).
- El bundle supera 500 kB: valorar `import()` dinámico para el visor 3D.
- `bun.lock` eliminado por desfasado; se incluye `package-lock.json`.

---

# Segunda iteración: edición directa de habitaciones y objetos

Antes solo se podían **mover** muebles, muros y habitaciones; el redimensionado existía solo en el panel de propiedades (las asas de esquina se dibujaban pero no respondían) y las aberturas ni se arrastraban.

## Novedades
- **Redimensionar con el ratón**: muebles (8 asas, también girados), habitaciones rectangulares (8 asas), vértices de habitaciones irregulares, extremos de muros y ancho de puertas/ventanas.
- **Desplazar puertas/ventanas** arrastrándolas a lo largo de su muro.
- Asas de tamaño constante en pantalla (antes 4 px a zoom normal), cursores de redimensionado según la orientación, medidas en vivo, y cartel de ayuda contextual.
- Cada gesto = un único paso de deshacer; un clic simple ya no desplaza el objeto (antes saltaba hasta 50 mm por el ajuste a rejilla).
- El agarre se compensa (la pieza no "salta" al coger el asa) y el imán de rejilla/vértices se congela al empezar para no pegarse a la propia esquina.
- Soltar el ratón fuera del lienzo ya no deja el arrastre "atascado".
- Las asas de habitaciones y muros se dibujan en capa superior (los muros las tapaban).
- El pomo de rotación pasa a la esquina NE (la cota superior lo tapaba).

## Correcciones asociadas
- Redimensionar un mueble **paramétrico** (por ratón o inspector) ahora actualiza su `parametricConfig`, de la que depende el 3D.
- Acortar un muro o redimensionar una habitación recoloca las aberturas dentro de su muro.

## Verificación
Lógica pura en `src/editor2d/manipulation.ts` con 25 tests; además, 14 comprobaciones con ratón real en Chromium (clic, asas, mover, girar, deshacer, aberturas, salir del lienzo) sin errores de consola. Total: 71 tests, `tsc` estricto y build correctos.
