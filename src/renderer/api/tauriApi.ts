/**
 * Capa de integración frontend ↔ backend (Tauri).
 * Punto único donde el frontend habla con el backend nativo (Rust) vía invoke().
 *
 * Decisión de arquitectura (Opción A): el parseo ST/Ladder es JS puro (sin I/O),
 * así que corre DIRECTO en el renderer importando compiler-core. Tauri (Rust) solo
 * se usa para lo que toca el sistema operativo: puertos serie, archivos, procesos.
 */
import { invoke } from "@tauri-apps/api/tauri";
import { CGenerator, STParser, avrAtmega328Target } from "../../../compiler-core/src";
import type { CodegenResult, Programa } from "../../../compiler-core/src";
import type { BoardDefinition, ParseResult } from "../../shared/types";
import { arduinoUnoBoard } from "../boards/arduinoUnoBoard";

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
 * Genera código C (target Arduino Uno) a partir del AST ya parseado, aplicando
 * primero el mapeo de I/O elegido en el panel de Variables.
 * Corre en el renderer (Opción A), igual que `parseSTCode`: es JS puro, sin I/O.
 */
export function generarCodigoC(
  ast: Programa,
  ioMappings: Record<string, string> = {}
): CodegenResult {
  const programaConDirecciones = aplicarIOMappings(ast, ioMappings);
  return new CGenerator().generate(programaConDirecciones, arduinoUnoBoard, avrAtmega328Target);
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
