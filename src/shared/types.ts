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

/**
 * Formato de archivo de proyecto `.plcproj` (§6 de la especificación).
 *
 * Variante MVP: en vez de serializar el AST (variables/networks) como en el
 * ejemplo de la §6, se guarda el TEXTO ST completo (`codigo_st`) y se reparsea al
 * abrir. Es más simple, versiona mejor en Git y evita desincronización entre el
 * texto del editor y un AST guardado. El mapeo de I/O sí se persiste aquí
 * (`io_mappings`) porque hoy lo asigna el usuario en la UI (Opción B), aún sin
 * archivos de placa reales.
 */
export interface PlcProject {
  proyecto: {
    nombre: string;
    target: string; // "arduino_uno" por ahora
    version_formato: string; // "1.0"
    fecha_modificacion: string; // ISO 8601
  };
  programa: {
    lenguaje_fuente: "st" | "ladder";
    codigo_st: string; // el texto completo del editor ST
  };
  io_mappings: Record<string, string>; // { "Start": "%IX0.0", ... }
}

