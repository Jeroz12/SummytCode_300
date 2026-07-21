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
 * Genera código C (target Arduino Uno) a partir del AST ya parseado.
 * Corre en el renderer (Opción A), igual que `parseSTCode`: es JS puro, sin I/O.
 */
export function generarCodigoC(ast: Programa): CodegenResult {
  return new CGenerator().generate(ast, arduinoUnoBoard, avrAtmega328Target);
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
