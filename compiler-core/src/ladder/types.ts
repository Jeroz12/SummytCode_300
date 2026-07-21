/**
 * Representación intermedia de Ladder (el "rung dibujado")
 * --------------------------------------------------------
 * Ladder no se guarda como texto: el editor visual produce esta estructura de
 * datos, que describe contactos y bobinas conectados topológicamente dentro de
 * una red (rung). El traductor (`ladder_translator.ts`) la convierte al mismo
 * AST (`Programa`) que emite el parser de ST, de modo que ambos lenguajes
 * convergen en un único backend de codegen (ver §4 de la especificación).
 *
 * Modelo topológico:
 *   - Una RAMA es un conjunto de elementos en SERIE   → equivale a AND.
 *   - Un RUNG tiene varias ramas en PARALELO entre sí → equivale a OR.
 *   - Las SALIDAS del rung son sus bobinas / bloques con estado.
 */

import { VariableDeclaration } from "../ast/types";

/** Un elemento individual dibujado en el rung (contacto, bobina o bloque). */
export interface LadderElemento {
  id: string;
  tipo:
    | "contacto_na"
    | "contacto_nc"
    | "bobina"
    | "bobina_negada"
    | "bobina_set"
    | "bobina_reset"
    | "ton"
    | "ctu";
  variable: string;
  /**
   * Operandos adicionales para bloques con estado (TON/CTU).
   * Las CONDICIONES de entrada (IN de TON, CU de CTU) NO se declaran aquí: se
   * derivan de la lógica del rung que alimenta al bloque. `reset_var` es la única
   * condición que sigue siendo un nombre de variable a nivel de dibujo (MVP);
   * el traductor la envuelve en una expresión al construir el AST.
   */
  parametros?: {
    pt_ms?: number;
    pv?: number;
    q_var?: string;
    et_var?: string;
    cv_var?: string;
    reset_var?: string;
  };
  /** Posición topológica dentro del rung (fila = rama, columna = orden en serie). */
  posicion: { fila: number; columna: number };
}

/** Una rama: elementos en SERIE entre sí (se combinan con AND). */
export interface LadderRama {
  elementos: LadderElemento[];
}

/** Un rung: ramas en PARALELO (se combinan con OR) más sus bobinas de salida. */
export interface LadderRung {
  id: number;
  ramas: LadderRama[];
  salidas: LadderElemento[];
}

/** Programa Ladder completo. Reutiliza `VariableDeclaration` del AST. */
export interface LadderPrograma {
  nombre: string;
  variables: VariableDeclaration[];
  rungs: LadderRung[];
}
