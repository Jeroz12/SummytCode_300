# src/ — Frontend (React / TypeScript)

## Propósito
Interfaz de usuario de la IDE: los editores gráficos y textuales donde se programa el PLC, la gestión del proyecto y variables, y la vista de monitoreo en vivo. Corresponde a la capa "Editor/IDE" de la sección 2 de la especificación.

## Subcarpetas y archivos esperados

### `editors/ladder/`
Editor gráfico Ladder sobre canvas interactivo (React Flow o Konva.js, sección 2.1). Traduce la representación visual (contactos, bobinas, TON, CTU) al AST intermedio según las reglas de la sección 4 (serie = AND, paralelo = OR, NC = NOT, bobina = asignación).

Archivos esperados: `LadderCanvas.tsx`, `elements/` (Contacto, Bobina, TON, CTU), `ladderToAst.ts`.

### `editors/st/`
Editor de texto estructurado (Structured Text) usando Monaco Editor o CodeMirror, con resaltado de sintaxis y autocompletado (sección 2.1). El parseo real a AST ocurre en `compiler-core/parsers/st_parser`; este módulo solo maneja la UI del editor.

Archivos esperados: `StEditor.tsx`, `syntax/` (definición de gramática para el resaltador).

### `editors/fbd/`
Editor de Function Block Diagram — **fuera de alcance en v1**, planificado para Fase 6 (sección 11). Carpeta reservada para mantener la estructura desde el inicio.

### `project/`
Gestión de proyectos `.plcproj` (sección 6): creación, apertura, guardado, y edición de la tabla de variables (nombre, tipo, clase, dirección IEC).

Archivos esperados: `ProjectExplorer.tsx`, `VariableTable.tsx`, `ioMap.ts` (vinculación con `boards/`).

### `monitor/`
Vista de monitoreo en vivo de variables durante ejecución (Fase 3, sección 8), leyendo datos vía el backend Tauri por serial/Modbus.

Archivos esperados: `MonitorView.tsx`, `useLiveVariables.ts`.

## Notas técnicas
- El frontend nunca compila ni flashea directamente: todo pasa por comandos Tauri (`invoke(...)`) hacia `src-tauri/`.
- Los tres editores (Ladder, ST, FBD) deben converger en el mismo AST intermedio — ningún editor genera C directamente.
- `lenguaje_fuente` en el `.plcproj` determina qué editor abre cada POU (sección 6).
