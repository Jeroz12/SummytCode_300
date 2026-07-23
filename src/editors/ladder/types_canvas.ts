/**
 * Tipos y geometría del editor Ladder (lado renderer), modelo de ÁRBOL recursivo.
 *
 * Los TIPOS de datos (RedContactos, RungArbol, las 6 operaciones de edición) viven
 * en compiler-core (`network_tree.ts`) para que sean TS puro y testeable; aquí solo
 * se re-exportan más las constantes de dibujo (dimensiones de celda, etc.) y los
 * metadatos de UI (paleta de la toolbar, nombres) exclusivos del renderer SVG.
 */
export type {
  TipoElemento,
  ParametrosLadder,
  ElementoLadder,
  RedContactos,
  RungArbol,
  ProgramaArbol,
  Ruta,
} from "../../../compiler-core/src/ladder/network_tree";
export {
  esSalida,
  ocupaDosColumnas,
  TIPOS_SALIDA,
  redVacia,
  rungArbolVacio,
  obtenerNodo,
  colocarElemento,
  eliminarElemento,
  insertarSerieAntes,
  insertarSerieDespues,
  bifurcar,
  agregarCaminoParalelo,
  eliminarCamino,
} from "../../../compiler-core/src/ladder/network_tree";

import type {
  ElementoLadder,
  ProgramaArbol,
  RungArbol,
  TipoElemento,
} from "../../../compiler-core/src/ladder/network_tree";
import { rungArbolVacio as rungArbolVacioLocal } from "../../../compiler-core/src/ladder/network_tree";

// ── Geometría del dibujo (px) ────────────────────────────────────────────────
export const CELDA_W = 80; // ancho de una celda de contacto/bobina
export const CELDA_H = 56; // alto de una celda
export const NODO_W = 22; // reserva horizontal a cada lado de un paralelo (nodos ● + stubs)
export const RAMA_GAP = 12; // separación vertical entre ramas de un paralelo
export const RIEL_PAD = 24; // margen antes/después de los rieles

/** Programa inicial VACÍO (un solo rung con un placeholder). */
export function programaArbolInicial(): ProgramaArbol {
  return { rungs: [rungArbolVacioLocal("1")] };
}

/** Rung de ejemplo (self-hold): Motor = (Start || Motor). Un paralelo con dos
 *  caminos (Start y la realimentación de Motor) en serie con la bobina Motor. */
export function programaArbolEjemplo(): ProgramaArbol {
  const na = (v: string): ElementoLadder => ({ tipo: "contacto_na", variable: v });
  const rung: RungArbol = {
    id: "1",
    comentario: "Enclavamiento: Motor = Start OR Motor",
    red: {
      tipo: "serie",
      elementos: [
        {
          tipo: "paralelo",
          ramas: [
            { tipo: "serie", elementos: [{ tipo: "elemento", elemento: na("Start") }] },
            { tipo: "serie", elementos: [{ tipo: "elemento", elemento: na("Motor") }] },
          ],
        },
        { tipo: "elemento", elemento: { tipo: "bobina", variable: "Motor" } },
      ],
    },
  };
  return { rungs: [rung] };
}

// ── Anchos de elementos (unidades de layout × CELDA_W) ───────────────────────
/** Ancho en UNIDADES de cada tipo — puramente de presentación. TON/CTU son más
 *  anchos para que los pines PT/PV y ET/CV no queden recortados. */
export const ANCHO_ELEMENTO: Record<TipoElemento, number> = {
  contacto_na: 1,
  contacto_nc: 1,
  bobina: 1,
  bobina_negada: 1,
  bobina_set: 1,
  bobina_reset: 1,
  ton: 2.5,
  ctu: 2.5,
};

/** Ancho en px de un elemento. */
export function anchoElemento(tipo: TipoElemento): number {
  return ANCHO_ELEMENTO[tipo] * CELDA_W;
}

// ── Metadatos de UI ──────────────────────────────────────────────────────────
export interface MetaElemento {
  tipo: TipoElemento;
  simbolo: string;
  etiqueta: string;
}

export const ELEMENTOS_TOOLBAR: MetaElemento[] = [
  { tipo: "contacto_na", simbolo: "—| |—", etiqueta: "Contacto NA" },
  { tipo: "contacto_nc", simbolo: "—|/|—", etiqueta: "Contacto NC" },
  { tipo: "bobina", simbolo: "—( )—", etiqueta: "Bobina" },
  { tipo: "bobina_negada", simbolo: "—(/)—", etiqueta: "Bobina negada" },
  { tipo: "bobina_set", simbolo: "—(S)—", etiqueta: "Set" },
  { tipo: "bobina_reset", simbolo: "—(R)—", etiqueta: "Reset" },
  { tipo: "ton", simbolo: "TON", etiqueta: "Timer" },
  { tipo: "ctu", simbolo: "CTU", etiqueta: "Contador" },
];

export const NOMBRE_TIPO: Record<TipoElemento, string> = {
  contacto_na: "Contacto NA",
  contacto_nc: "Contacto NC",
  bobina: "Bobina",
  bobina_negada: "Bobina negada",
  bobina_set: "Bobina SET",
  bobina_reset: "Bobina RESET",
  ton: "Timer (TON)",
  ctu: "Contador (CTU)",
};

// ── Parsers tolerantes (inline TON/CTU) ──────────────────────────────────────
/** Interpreta un texto de tiempo tolerante ("5s", "5000ms", "T#5s") → ms. */
export function parsearTiempoMs(texto: string, anterior: number): number {
  const m = texto.trim().replace(/^T#/i, "").match(/^([\d.]+)\s*(ms|s)?$/i);
  if (!m) return anterior;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return anterior;
  const unidad = (m[2] ?? "ms").toLowerCase();
  return Math.round(unidad === "s" ? n * 1000 : n);
}

/** Formatea milisegundos como texto corto ("1000" → "1s"). */
export function formatearTiempoMs(ms: number): string {
  return ms % 1000 === 0 && ms >= 1000 ? `${ms / 1000}s` : `${ms}ms`;
}

/** Interpreta un entero positivo tolerante (PV de CTU); conserva el anterior si no es válido. */
export function parsearEntero(texto: string, anterior: number): number {
  const n = Number(texto.trim());
  return Number.isInteger(n) && n > 0 ? n : anterior;
}
