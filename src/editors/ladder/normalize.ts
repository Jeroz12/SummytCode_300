/**
 * Normalización del árbol para la EDICIÓN (convención de celdas "append-slot").
 *
 * El modelo de datos puro (network_tree) no necesita celdas vacías sobrantes,
 * pero el editor sí: para poder "seguir colocando a la derecha" cada serie
 * mantiene exactamente UN placeholder `vacio` al final… salvo que la serie
 * termine en una SALIDA (bobina/TON/CTU), en cuyo caso el rung ya está "cerrado"
 * y la bobina toca el riel derecho (sin celda extra).
 *
 * Es idempotente: normalizar dos veces da el mismo árbol. Se aplica tras cada
 * edición y al renderizar, de modo que las rutas del layout siempre coinciden
 * con el árbol almacenado. Los `vacio` extra son inocuos para el codegen
 * (redAExpresion los trata como identidad).
 */
import type { ProgramaArbol, RedContactos } from "./types_canvas";
import { esSalida } from "./types_canvas";

const VACIO: RedContactos = { tipo: "vacio" };

/** Normaliza cualquier nodo (recursivo). */
function normalizarNodo(red: RedContactos): RedContactos {
  if (red.tipo === "paralelo") {
    // Cada rama de un paralelo es, a efectos de edición, una serie con su slot.
    return { tipo: "paralelo", ramas: red.ramas.map((r) => asegurarSerie(r)) };
  }
  if (red.tipo === "serie") return asegurarSerie(red);
  return red; // hoja (elemento/vacio)
}

/** Convierte el nodo en una serie normalizada con su placeholder final. */
function asegurarSerie(red: RedContactos): RedContactos {
  const bruto = (red.tipo === "serie" ? red.elementos : [red]).map(normalizarNodo);
  // Quitar vacios finales (se recomponen según corresponda).
  let fin = bruto.length;
  while (fin > 0 && bruto[fin - 1].tipo === "vacio") fin--;
  const base = bruto.slice(0, fin);
  const ultimo = base[base.length - 1];
  const cierraConSalida =
    ultimo != null && ultimo.tipo === "elemento" && esSalida(ultimo.elemento.tipo);
  if (!cierraConSalida) base.push(VACIO);
  return { tipo: "serie", elementos: base };
}

/** Normaliza el árbol de un rung (su raíz siempre es una serie con append-slot). */
export function normalizarRed(red: RedContactos): RedContactos {
  return asegurarSerie(red);
}

/** Normaliza todos los rungs de un programa. */
export function normalizarPrograma(programa: ProgramaArbol): ProgramaArbol {
  return { rungs: programa.rungs.map((r) => ({ ...r, red: normalizarRed(r.red) })) };
}
