/**
 * Tipos de datos compartidos por el frontend.
 * La integración con el backend vive en src/renderer/api/tauriApi.ts (Tauri).
 */

// Tipos del AST reutilizados desde compiler-core (import type = se borra en runtime).
import type { Programa, VariableDeclaration } from "../../compiler-core/src/ast/types";

export type { Programa, VariableDeclaration };

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

