# My Home Design

**My Home Design** es una aplicación web profesional de diseño de interiores y planificación de espacios en 2D y 3D, inspirada en las herramientas avanzadas de arquitectura y CAD (como Floor Plan Creator), construida con TypeScript, React, Vite, Three.js y Tailwind CSS.

Funciona de manera completamente **offline y sin registro de usuario**, almacenando los proyectos de forma segura en el navegador mediante **IndexedDB (Dexie.js)**. Es 100% compatible para su despliegue en **Cloudflare Pages** sin coste ni dependencia de servidores de pago.

---

## Características Principales

1. **Sistema de Coordenadas y Medidas Reales**:
   - Todas las dimensiones se almacenan en milímetros (`mm`) en punto flotante de alta precisión.
   - Conversión y visualización automática en metros (`m`), centímetros (`cm`) o milímetros (`mm`).
   - Rejilla configurable (50, 100, 200, 500, 1000 mm) con ajuste magnético (*Snap*) inteligente a rejilla y esquinas.

2. **Editor de Planos en 2D**:
   - Creación de habitaciones rectangulares (arrastrando o mediante clic en dos esquinas) con cálculo automático de 4 paredes y suelo (ej. 4000 × 3000 mm = 12 m² útiles, 14 m de perímetro).
   - Botón directo de **Habitación 4×3 m Rápida** con un solo clic.
   - Dibujo continuo de paredes con cotas en tiempo real y grosor configurable (100, 150, 200, 300 mm).
   - Cálculo automático de superficies construidas, superficies útiles y perímetros.
   - Puertas batientes con previsualización dinámica acoplada a pared y arco de apertura abatible, puertas dobles, correderas, ventanas con antepecho y balconeras.

3. **Selector Avanzado de Materiales y Texturas Procedurales PBR (Mejora 2)**:
   - **Suelos:** Parquet en espiga (*herringbone*), tarima de roble nórdico, nogal americano, mosaico hidráulico artesanal mediterráneo, mármol blanco Carrara con vetas, mármol negro Marquina, porcelánico 60×60, microcemento continuo, terrazo veneciano y moqueta textil.
   - **Paredes:** Pintura blanca mate RAL 9003, gris cálido arena, verde salvia escandinavo, azul marino profundo, gris antracita, ladrillo visto rústico, azulejo metro biselado blanco, revestimiento cerámico mármol y hormigón arquitectónico visto.
   - Texturas generadas proceduralmente en código (`CanvasTexture` con espacio de color `SRGBColorSpace` y anisotropía máxima) sin dependencias de red ni enlaces rotos.
   - Tramado arquitectónico en 2D adaptado a cada acabado y renderizado PBR con rugosidad y brillos en 3D.

4. **Cotas Dinámicas Inteligentes**:
   - Visualización en tiempo real de separaciones entre muebles y paredes circundantes.
   - Edición directa por cota: haz clic en cualquier cota e introduce la separación deseada para recolocar el objeto automáticamente.
   - Herramienta de cota manual permanente entre cualquier par de puntos.

4. **Diseñador de Mobiliario Paramétrico (Módulo Especializado)**:
   - Taller para diseñar armarios, vestidores, muebles de cocina, estanterías y cómodas a medida.
   - Visualización simultánea en 4 vistas técnicas: Alzado frontal, Planta superior, Perfil lateral y Axonometría 3D.
   - Configuración milimétrica de tableros, zócalos, baldas interiores y cajoneras.
   - Generación de lista de corte / despiece de tableros para carpintería.
   - Validación geométrica de colisiones y holguras.

5. **Visualización 3D Interactiva con Three.js**:
   - Huecos y vanos arquitectónicos reales en paredes (dintel, antepecho y marco).
   - Renderizado con iluminación de estudio PBR (`RoomEnvironment`), sombras suaves y tonalidades realistas.
   - Modos de visualización: Muros completos (`solid`), Sección baja tipo maqueta (`cutaway`) y Translúcidos (`transparent`).
   - Selección interactiva mediante Raycasting: selecciona muebles o paredes en 3D para editar sus propiedades.
   - Presets de cámara: Órbita libre, Planta superior, Alzado frontal y Perfil lateral.

6. **Catálogo Completo de Mobiliario**:
   - Salón, Dormitorio, Cocina, Baño, Comedor, Oficina, Almacenaje y Arquitectura (escaleras).
   - Bounding boxes paramétricas para modelado genérico de cualquier volumen.
   - Manipuladores interactivos en 2D: arrastre, escalado numérico y rotación.

7. **Persistencia y Exportación**:
   - Guardado local y autoguardado en IndexedDB con soporte para múltiples proyectos.
   - Exportación vectorial a **SVG**.
   - Exportación en imagen de alta definición **PNG**.
   - Exportación de mediciones y desglose de habitaciones a **CSV** (compatible con Excel).
   - Exportación del proyecto serializable en **JSON** con importación directa.
   - Exportación del modelo tridimensional completo en formato binario **GLB** (compatible con Blender, SketchUp, Unity).

---

### Edición directa en el plano 2D
Selecciona cualquier elemento con un clic y manipúlalo con el ratón (el panel de propiedades sigue disponible para valores exactos):

| Elemento | Mover | Cambiar tamaño / forma |
|---|---|---|
| Mueble | Arrastrar el cuerpo | 8 asas (esquinas y lados, también girado). En esquinas respeta "bloquear proporciones"; **Shift** lo invierte. Pomo ● para girar |
| Habitación rectangular | Arrastrar el cuerpo | 8 asas: el lado opuesto queda fijo y los muros siguen. Se muestran las medidas en vivo |
| Habitación irregular | Arrastrar el cuerpo | Arrastrar un vértice |
| Muro | Arrastrar el cuerpo | Arrastrar un extremo (las puertas/ventanas se recolocan dentro del muro) |
| Puerta / ventana | Arrastrar: se desliza por su muro | Asas laterales para cambiar el ancho |

Cada gesto es **un único paso** de deshacer. Un simple clic nunca desplaza el objeto (hay un umbral de arrastre de 4 px).

## Estructura del Código

```text
src/
├── catalog/          # Catálogo de muebles y definiciones arquitectónicas
├── components/       # Componentes de interfaz (Header, Sidebar, Inspector, Modales)
│   ├── DimensionEditModal.tsx  # Editor de separación exacta por cotas
│   ├── ExportModal.tsx         # Generadores de SVG, PNG, CSV, JSON y GLB
│   ├── Header.tsx              # Barra superior y herramientas globales
│   ├── ParametricModal.tsx     # Taller de diseño de muebles paramétricos (4 vistas)
│   ├── ProjectsModal.tsx       # Gestor de proyectos locales
│   ├── PropertyInspector.tsx   # Panel de propiedades numéricas
│   ├── StatusBar.tsx           # Coordenadas, superficies totales y snap
│   └── ToolSidebar.tsx         # Herramientas de dibujo y catálogo
├── editor2d/         # Motor de renderizado en Canvas 2D
│   └── EditorCanvas2D.tsx
├── editor3d/         # Motor de renderizado tridimensional con Three.js
│   └── EditorCanvas3D.tsx
├── geometry/         # Motor geométrico puro (vectores, polígonos, cotas, snap)
│   └── index.ts
├── parametric/       # Reglas paramétricas, validación y despiece de tableros
│   └── index.ts
├── state/            # Estado global con Zustand y pila de historial Undo/Redo
│   └── useEditorStore.ts
├── storage/          # Persistencia en IndexedDB con Dexie.js y proyecto de ejemplo
│   └── index.ts
├── tests/            # Pruebas unitarias con Vitest
│   ├── geometry.test.ts
│   └── parametric.test.ts
└── types/            # Definiciones de tipos TypeScript del modelo CAD
    └── index.ts
```

---

## Desarrollo Local y Pruebas

### 1. Requisitos
- Node.js versión 18 o superior.
- Gestor de paquetes `npm`.

### 2. Instalación de dependencias
```bash
npm install
```

### 3. Ejecución en desarrollo
```bash
npm run dev
```
La aplicación se abrirá en `http://localhost:3000`.

### 4. Ejecución de pruebas unitarias
```bash
npm run test
```
Verifica las conversiones de unidades, fórmulas de superficie y perímetro, algoritmos de proyección y las reglas paramétricas.

### 5. Compilación para producción
```bash
npm run build
```
Generará la carpeta `dist/` optimizada.

---

## Despliegue en Cloudflare Pages

1. Conecta tu repositorio de GitHub / GitLab en el panel de **Cloudflare Pages**.
2. Parámetros de compilación:
   - **Framework preset**: `Vite`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
3. Haz clic en **Deploy**. La aplicación se publicará de inmediato en tu subdominio gratuito `*.pages.dev` sin requerir servidor ni base de datos externa.
