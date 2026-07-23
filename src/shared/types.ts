/**
 * Tipos de datos compartidos por el frontend.
 * La integración con el backend vive en src/renderer/api/tauriApi.ts (Tauri).
 */

// Tipos del AST reutilizados desde compiler-core (import type = se borra en runtime).
import type { ClaseVariable, Programa, TipoDato, VariableDeclaration } from "../../compiler-core/src/ast/types";
import type { ProgramaArbol } from "../../compiler-core/src/ladder/network_tree";

export type { ClaseVariable, Programa, TipoDato, VariableDeclaration, ProgramaArbol };

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

/** Un canal de I/O de una placa (boards/*.json → canales_io, §7.2). */
export interface CanalIO {
  direccion_iec: string;
  tipo: "BOOL" | "INT";
  modo: "input" | "output" | "input_analog";
  pin_fisico: string;
  etiqueta_serigrafia: string;
  electrico?: Record<string, unknown>;
}

/** Board definition file completo (boards/*.json, §7.2). */
export interface BoardDefinitionFull {
  board_id: string;
  hereda_de: string;
  nombre_visible: string;
  descripcion?: string;
  imagen?: string;
  canales_io: CanalIO[];
  comunicacion: {
    programacion: string;
    monitoreo: string;
    notas?: string;
    futuro?: string[];
  };
}

/** MCU family definition file completo (mcu_families/*.json, §7.1). */
export interface McuFamily {
  familia_id: string;
  nombre_visible: string;
  arquitectura: string;
  toolchain: {
    compilador: string;
    flags_base: string[];
    flags_enlazado: string[];
    objcopy_formato: string;
  };
  metodo_flasheo: {
    herramienta: string;
    programador?: string;
    baudrate?: number;
    flags_extra?: string[];
  };
  capacidades: Record<string, unknown>;
  restricciones: Record<string, unknown>;
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
    /**
     * Estado del editor Ladder (árbol recursivo de rungs). Opcional; se persiste
     * solo cuando el proyecto se editó en modo Ladder.
     *
     * NOTA DE FORMATO: a partir de la migración al modelo de árbol (network_tree)
     * este campo YA NO es compatible con los .plcproj viejos basados en grilla
     * (RungCanvas + marcadores ⊢/⊣). No se incluye migración automática (uso
     * interno/educativo): un .plcproj antiguo con `ladder_canvas` de grilla se
     * ignora y se arranca con un rung vacío (ver App.openProject).
     */
    ladder_canvas?: ProgramaArbol;
  };
  io_mappings: Record<string, string>; // { "Start": "%IX0.0", ... }
  /**
   * Variables agregadas a mano desde el panel de Variables (no vienen del AST
   * parseado del código ST). Opcional para no romper la compatibilidad con
   * proyectos .plcproj guardados antes de que existiera esta funcionalidad.
   */
  variables_manuales?: VariableDeclaration[];
}

