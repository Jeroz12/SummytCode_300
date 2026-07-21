/**
 * Tipos propios del generador de código C.
 * El codegen es una biblioteca pura: recibe un AST (`Programa`) + configuración de
 * target y devuelve strings de C. No conoce el editor, Electron ni el filesystem.
 */

/** Un archivo de C generado (nombre + contenido completo). */
export interface GeneratedFile {
  nombre: string;
  contenido: string;
}

/** Resultado de una generación. Puede producir más de un archivo. */
export interface CodegenResult {
  success: boolean;
  files: GeneratedFile[];
  errors: string[];
  warnings: string[];
}

/**
 * Configuración específica del target (lo que varía por familia de MCU).
 * Los templates usan `{pin}` y `{value}` como marcadores a sustituir.
 */
export interface TargetConfig {
  familia: string;
  include_hal: string[];
  tipo_bool: string;
  tipo_int: string;
  tipo_time_ms: string;
  get_time_ms: string;
  digital_read: string;
  digital_write: string;
  analog_read: string;
  init_input: string;
  init_output: string;
}

/** Un canal de I/O de la placa (subset de boards/*.json → canales_io, §7.2). */
export interface BoardIOChannel {
  direccion_iec: string;
  tipo?: string;
  modo?: "input" | "output";
  pin_fisico: string;
  etiqueta_serigrafia?: string;
}

/** Contenido relevante del board definition file (solo lo que el codegen necesita). */
export interface BoardJson {
  board_id?: string;
  canales_io: BoardIOChannel[];
}

/** Contexto de emisión pasado al expression emitter. */
export interface EmitContext {
  target: TargetConfig;
}
