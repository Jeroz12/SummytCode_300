/**
 * Capa de integración frontend ↔ backend (Tauri).
 * Punto único donde el frontend habla con el backend nativo (Rust) vía invoke().
 *
 * Decisión de arquitectura (Opción A): el parseo ST/Ladder es JS puro (sin I/O),
 * así que corre DIRECTO en el renderer importando compiler-core. Tauri (Rust) solo
 * se usa para lo que toca el sistema operativo: puertos serie, archivos, procesos.
 */
import { invoke } from "@tauri-apps/api/tauri";
import {
  CGenerator,
  STParser,
  avrAtmega328Target,
  traducirArbolAAST,
  validarRung,
} from "../../../compiler-core/src";

export { advertenciasArbol } from "../../../compiler-core/src";
import type { BoardJson, CodegenResult, Programa, ProgramaArbol } from "../../../compiler-core/src";
import type {
  BoardDefinition,
  BoardDefinitionFull,
  McuFamily,
  ParseResult,
  PlcProject,
  VariableDeclaration,
} from "../../shared/types";

/** Parsea código ST en el propio renderer (no pasa por Rust). */
export async function parseSTCode(code: string): Promise<ParseResult> {
  try {
    const parser = new STParser();
    const ast = parser.parse(code);
    return { success: true, ast };
  } catch (e) {
    return { success: false, errors: [e instanceof Error ? e.message : String(e)] };
  }
}

/**
 * Aplica las direcciones IEC elegidas en el panel de Variables (Parte 3, Opción B)
 * a las variables del AST, sin mutar el original. `mappings` es nombre de
 * variable → dirección IEC (ej. `{ Start: "%IX0.0" }`); una entrada ausente o
 * vacía conserva la `direccion_iec` que ya traía la variable (si la tenía).
 */
function aplicarIOMappings(ast: Programa, mappings: Record<string, string>): Programa {
  return {
    ...ast,
    variables: ast.variables.map((v) => ({
      ...v,
      direccion_iec: mappings[v.nombre] || v.direccion_iec,
    })),
  };
}

/**
 * Convierte un `BoardDefinitionFull` (boards/*.json, §7.2) al subset `BoardJson`
 * que espera `CGenerator` — el codegen no necesita campos como `electrico` o
 * `comunicacion`, solo direccion_iec/pin_fisico/etiqueta por canal.
 */
function convertirBoardABoardJson(board: BoardDefinitionFull): BoardJson {
  return {
    board_id: board.board_id,
    canales_io: board.canales_io.map((c) => ({
      direccion_iec: c.direccion_iec,
      tipo: c.tipo,
      modo: c.modo === "input_analog" ? "input" : c.modo,
      pin_fisico: c.pin_fisico,
      etiqueta_serigrafia: c.etiqueta_serigrafia,
    })),
  };
}

/**
 * Genera código C a partir del AST ya parseado, aplicando primero el mapeo de I/O
 * elegido en el panel de Variables y usando la placa seleccionada en la Toolbar
 * (ya no un `BoardJson` hardcodeado).
 * Corre en el renderer (Opción A), igual que `parseSTCode`: es JS puro, sin I/O.
 */
export function generarCodigoC(
  ast: Programa,
  ioMappings: Record<string, string>,
  board: BoardDefinitionFull
): CodegenResult {
  const programaConDirecciones = aplicarIOMappings(ast, ioMappings);
  const boardJson = convertirBoardABoardJson(board);
  return new CGenerator().generate(programaConDirecciones, boardJson, avrAtmega328Target);
}

/**
 * Genera código C desde el editor Ladder: traduce el ÁRBOL de rungs al mismo AST
 * que ST y reutiliza `generarCodigoC`. `variables` son las declaraciones IEC
 * (del panel) que el programa Ladder referencia.
 *
 * ANTES de traducir, valida la TOPOLOGÍA de cada rung (`validarRung`, en
 * compiler-core). Si algún rung tiene errores (rung vacío, sin salida, salida
 * sin condición) se ABORTA sin llamar a `traducirArbolAAST`: se devuelve
 * `success: false` con los mensajes formateados (❌/⚠️ + número de rung) en
 * `errors`/`warnings`, listos para loguearse en la Consola tal como ya hace
 * `App.tsx` con el resultado de `generarCodigoC`.
 */
export function generarCodigoCDesdeLadder(
  programaArbol: ProgramaArbol,
  variables: VariableDeclaration[],
  ioMappings: Record<string, string>,
  board: BoardDefinitionFull,
  nombre = "LadderProgram"
): CodegenResult {
  const erroresValidacion: string[] = [];
  const warningsValidacion: string[] = [];

  programaArbol.rungs.forEach((rung) => {
    for (const hallazgo of validarRung(rung)) {
      const linea = `Rung ${rung.id}: ${hallazgo.mensaje}`;
      if (hallazgo.nivel === "error") {
        erroresValidacion.push(`❌ ${linea}`);
      } else {
        warningsValidacion.push(`⚠️ ${linea}`);
      }
    }
  });

  if (erroresValidacion.length > 0) {
    return { success: false, files: [], errors: erroresValidacion, warnings: warningsValidacion };
  }

  const ast = traducirArbolAAST(programaArbol, variables, nombre);
  const resultado = generarCodigoC(ast, ioMappings, board);
  return { ...resultado, warnings: [...warningsValidacion, ...resultado.warnings] };
}

/** Placas disponibles (comando Rust `get_boards`). */
export function getBoards(): Promise<BoardDefinition[]> {
  return invoke<BoardDefinition[]>("get_boards");
}

/** Puertos serie del sistema (comando Rust `get_serial_ports`). */
export function getSerialPorts(): Promise<string[]> {
  return invoke<string[]>("get_serial_ports");
}

/** Guarda un proyecto .plcproj en disco (comando Rust `save_project`). */
export function saveProject(path: string, content: string): Promise<void> {
  return invoke<void>("save_project", { path, content });
}

/** Carga un proyecto .plcproj desde disco (comando Rust `load_project`). */
export function loadProject(path: string): Promise<string> {
  return invoke<string>("load_project", { path });
}

/** Resultado de guardar el código C generado en disco. */
export interface GuardarCodigoResult {
  success: boolean;
  path?: string;
  error?: string;
}

/**
 * Guarda código C ya generado en la carpeta `generated/` del proyecto
 * (comando Rust `guardar_codigo_generado`).
 */
export async function compilarPrograma(
  codigoC: string,
  nombreArchivo: string = "plc_program.c"
): Promise<GuardarCodigoResult> {
  try {
    const path = await invoke<string>("guardar_codigo_generado", {
      nombreArchivo,
      contenido: codigoC,
    });
    return { success: true, path };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

/** Resultado de compilar el firmware AVR (avr-gcc). */
export interface CompilarAvrResult {
  success: boolean;
  hexPath?: string;
  output?: string;
  error?: string;
}

/**
 * Compila `generated/plc_program.c` + el runtime AVR a `.hex` con avr-gcc
 * (comando Rust `compilar_avr`). No requiere el Arduino conectado.
 */
export async function compilarAvr(puerto: string): Promise<CompilarAvrResult> {
  try {
    const hexPath = await invoke<string>("compilar_avr", { puerto });
    return { success: true, hexPath };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

/** Resultado de flashear el firmware al MCU (avrdude). */
export interface FlashearAvrResult {
  success: boolean;
  output?: string;
  error?: string;
}

/**
 * Flashea `generated/build/plc_firmware.hex` al Arduino Uno vía avrdude
 * (comando Rust `flashear_avr`). Requiere el Arduino conectado en `puerto`.
 */
export async function flashearAvr(puerto: string): Promise<FlashearAvrResult> {
  try {
    const output = await invoke<string>("flashear_avr", { puerto });
    return { success: true, output };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Proyectos .plcproj ──────────────────────────────────────────────────────

/**
 * Abre el diálogo "Guardar como" y escribe el proyecto en la ruta elegida.
 * Retorna la ruta guardada, o `null` si el usuario canceló.
 */
export async function guardarProyecto(proyecto: PlcProject): Promise<string | null> {
  const json = JSON.stringify(proyecto, null, 2);
  try {
    return await invoke<string | null>("dialogo_guardar_proyecto", { contenido: json });
  } catch (e) {
    throw new Error(`Error guardando proyecto: ${e}`);
  }
}

/** Escribe el proyecto directamente en una ruta ya conocida (sin diálogo). */
export async function guardarProyectoEnRuta(ruta: string, proyecto: PlcProject): Promise<void> {
  const json = JSON.stringify(proyecto, null, 2);
  try {
    await invoke<void>("guardar_proyecto_en_ruta", { ruta, contenido: json });
  } catch (e) {
    throw new Error(`Error guardando proyecto: ${e}`);
  }
}

/** Resultado de abrir un proyecto: el proyecto parseado + la ruta de donde se abrió. */
export interface AbrirProyectoResult {
  proyecto: PlcProject;
  ruta: string;
}

/**
 * Abre el diálogo "Abrir", lee el .plcproj elegido y lo parsea.
 * Retorna el proyecto + su ruta (para "Guardar" sin diálogo), o `null` si canceló.
 */
export async function abrirProyecto(): Promise<AbrirProyectoResult | null> {
  try {
    const res = await invoke<{ ruta: string; contenido: string } | null>("dialogo_abrir_proyecto");
    if (!res) return null;
    return { proyecto: JSON.parse(res.contenido) as PlcProject, ruta: res.ruta };
  } catch (e) {
    throw new Error(`Error abriendo proyecto: ${e}`);
  }
}

/** Cierra la aplicación (comando Rust `exit_app`). */
export async function salirApp(): Promise<void> {
  await invoke("exit_app");
}

// ── Boards / familias de MCU (§7.1, §7.2) ───────────────────────────────────

/**
 * Lee todas las placas reales de `boards/*.json` (comando Rust `listar_boards`).
 * Descarta entradas que no parsean como JSON válido y las plantillas (board_id
 * contiene "template", ej. `agrupacion_board_template.json`), que existen solo
 * como punto de partida para diseñar placas nuevas y no son seleccionables.
 */
export async function listarBoards(): Promise<BoardDefinitionFull[]> {
  const jsons = await invoke<string[]>("listar_boards");
  return jsons
    .map((json) => {
      try {
        return JSON.parse(json) as BoardDefinitionFull;
      } catch {
        return null;
      }
    })
    .filter((b): b is BoardDefinitionFull => b !== null)
    .filter((b) => !b.board_id.includes("template"));
}

/** Lee `mcu_families/{familiaId}.json` (comando Rust `leer_familia`). */
export async function leerFamilia(familiaId: string): Promise<McuFamily> {
  const json = await invoke<string>("leer_familia", { familiaId });
  return JSON.parse(json) as McuFamily;
}
