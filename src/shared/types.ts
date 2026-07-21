/**
 * Contrato compartido entre el proceso main (Electron), el preload y el renderer.
 * Define la API expuesta en `window.plcAPI` y los tipos de datos que viajan por ella.
 */

// Tipo del AST reutilizado desde compiler-core (import type = se borra en runtime).
import type { Programa } from "../../compiler-core/src/ast/types";

export type { Programa };

/** Resultado de parsear código ST vía el compiler-core. */
export interface ParseResult {
  success: boolean;
  ast?: Programa;
  errors?: string[];
}

/** Definición mínima de una placa (subset del board definition file, §7.2). */
export interface BoardDefinition {
  board_id: string;
  nombre_visible: string;
}

/** Un mensaje de la consola inferior. */
export interface ConsoleMessage {
  id: string;
  timestamp: string;
  tipo: "info" | "warning" | "error" | "success";
  texto: string;
}

/** API segura expuesta al renderer a través del preload (contextBridge). */
export interface PlcAPI {
  /** Parsea código ST usando el STParser de compiler-core. */
  parseSTCode(code: string): Promise<ParseResult>;
  /** Placas disponibles (mock por ahora). */
  getBoards(): Promise<BoardDefinition[]>;
  /** Puertos serie disponibles (mock por ahora). */
  getSerialPorts(): Promise<string[]>;
}

declare global {
  interface Window {
    plcAPI: PlcAPI;
  }
}
