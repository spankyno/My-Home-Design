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

---

# Tercera iteración

## Peticiones
- **Quitados** los botones "Trazar" (Habitación a medida y Pared individual) y "En pared" (Puertas y ventanas, queda solo "Colocar"). Se eliminó también el código de dibujo con ratón que quedaba inalcanzable (`draw_wall`, `draw_room_rect`, `draw_room_poly`).
- **Flechas del teclado** mueven la selección (muebles, habitaciones con sus muros, muros y aberturas a lo largo del muro): 10 mm, `Shift` = celda de rejilla, `Alt` = 1 mm. Ráfagas = un paso de deshacer.
- **"Cota manual" → "Medir"**: dos clics muestran la distancia (más ΔX/ΔY) y el resultado queda en pantalla; antes creaba una cota permanente.
- **Selección revisada** (ver abajo).
- **Desplazar** funciona.
- **Imán de objetos** al arrastrar y al colocar desde el catálogo: se pega a caras de muros y bordes/centros de otras piezas, con guías. Alcance de 8 px en pantalla, así que con más zoom se pueden acercar mucho más; `Alt` lo desactiva. La rejilla del cursor se afina con el zoom.

## Causas raíz encontradas
| Síntoma | Causa | Arreglo |
|---|---|---|
| "Desplazar" no hacía nada (y "Medir" tampoco medía) | `handleSelectTool` fijaba la herramienta y a continuación `setPendingFurnitureCatalogId(null)` la reseteaba a `select`: **ninguna herramienta de la barra se podía activar** | Semántica de herramientas en el store; la barra solo llama a `setActiveTool` |
| Al mover un objeto "se movía/seleccionaba otro" | (1) `initialRoomPoints`/`initialWallEndpoints` quedaban guardados tras clicar una habitación: **al arrastrar luego un mueble, la habitación y sus muros se movían con él**. (2) Las aberturas se detectaban con un disco de radio `ancho/2+100` mm que invadía la habitación. (3) Los elementos de capas ocultas seguían siendo seleccionables. (4) Con piezas solapadas se cambiaba de selección aunque agarraras la ya seleccionada; con varias seleccionadas, un clic perdía el grupo. (5) Muros/habitaciones: se elegía el primero que cumplía, no el más cercano/específico | Nuevo `hitTest.ts` (puro, con tests): rectángulo de la abertura sobre su muro, capas visibles, preferencia por lo seleccionado, habitación más pequeña, muro más cercano, tolerancias en píxeles. Las instantáneas de movimiento se limpian al terminar y al empezar cada gesto. El grupo se mantiene al arrastrar y se colapsa solo si fue un clic |
| "Colocar" ignoraba el tamaño del tipo de abertura (siempre 800/1200 mm) | Tamaños fijos en el canvas; los reales solo los usaba "En pared" | Catálogo compartido `OPENING_CATALOG` + `planOpeningPlacement` (también unifica la vista previa y la colocación, que estaban duplicadas) |

## Verificación
89 tests unitarios (nuevos: `hitTest`, imán, rejilla adaptable, herramientas, teclado) y 30 comprobaciones con ratón real en Chromium (botones, pan, medir, flechas, selección y regresión del bug de arrastre, colocación con tamaño real, imán a distintos zooms, `Alt`), sin errores de consola.

---

# Cuarta iteración: objetos nuevos y 3D con detalle

## Objetos añadidos (medidas en mm)
| Grupo | Objeto | Medidas |
|---|---|---|
| Salón | Mesa de Salón | 1600 × 900 (alto 750) |
| Salón | Silla de Salón | 400 × 400 (alto 900) |
| Salón | Puff Redondo | circular, Ø 600 (alto 400) |
| Dormitorio | Galán de Noche | 500 × 200 (alto 1100) |
| Dormitorio | Lámpara de Pie Dormitorio | circular, Ø 400 (alto 1600) |
| Cocina | Silla de Cocina | 400 × 400 (alto 900) |
| Cocina | Mesa de Cocina | 1500 × 700 (alto 750) |

Las alturas no estaban en la petición; son valores habituales y se pueden cambiar en el inspector.

**Piezas circulares** (nuevo `shape: 'circle'`): se dibujan como círculo en 2D, se seleccionan por su círculo (no por el cuadrado), se redimensionan con las asas manteniéndose redondas y el inspector muestra un único campo "Diámetro".

## 3D: de cubos a modelos con detalle
Causa: solo había modelos para sofás, camas, mesas y fregadero; **todo lo demás era un cubo** de un solo color liso, y al seleccionar una pieza se pintaba entera de azul.
- 40 modelos procedurales (uno por pieza del catálogo) en `furnitureModels.ts`; los muebles personalizados antiguos se resuelven por nombre.
- Materiales con textura procedural (madera, tela, metal cepillado, piedra) + acabados (cromo, latón, vidrio, cerámica, pantallas luminosas).
- Selección: contorno + tinte, sin perder el detalle.
- Armario paramétrico con **puertas reales** (antes quedaba abierto) y tiradores.
- En "Sección baja" de muros, puertas y ventanas se recortan a la altura del muro (los marcos sobresalían flotando).
- Catálogo → mueble en una sola función (`furnitureFromCatalog`); había copias duplicadas.

## Errores encontrados por el camino
- **Las cotas dinámicas se comprobaban antes que las asas y con un radio enorme**: si una cota quedaba junto a un asa, el clic abría el editor de cota en vez de redimensionar. Ahora van después de las asas y su zona es la de la propia etiqueta.
- La estantería salía con 83 000 triángulos y 150 mallas (cada libro era una caja redondeada): ahora libros fusionados por color, ~1 800 triángulos.
- Varios defectos geométricos cazados mirando la galería: pata flotante del sofá chaise, barra de horno y de galán en altura incorrecta (cilindros girados), ruedas de silla bajo el suelo, puntas de pata asomando por el asiento, largueros de escalera hundidos.

## Verificación
177 tests (nuevos: un test por pieza del catálogo que comprueba que tiene modelo propio, que cabe en su huella, altura correcta, está compuesta de varias partes y cumple presupuesto de triángulos/mallas); 14 + 30 comprobaciones de ratón anteriores sin regresiones; revisión visual de las 40 piezas en el navegador.
