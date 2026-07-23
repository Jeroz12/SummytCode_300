/**
 * Traductor Árbol (RedContactos) → AST
 * ------------------------------------
 * Convierte el árbol recursivo de un rung (`RungArbol.red`) directamente en el
 * mismo `Programa` (AST) que produce el parser de ST, reutilizando el codegen.
 *
 * A diferencia del traductor de grilla anterior (canvas_translator), aquí NO hay
 * distribución manual de "lo que va antes/después de un grupo": el anidamiento
 * del árbol YA representa la topología correcta.
 *
 *   redAExpresion(serie)    → AND de sus hijos   (contactos en serie)
 *   redAExpresion(paralelo) → OR de sus ramas    (caminos en paralelo)
 *
 * Un "paralelo" anidado dentro de una "serie" produce, sin cálculo extra, la
 * expresión `AND(..., OR(...), ...)` — la ley distributiva sale gratis del
 * anidamiento, incluso con ramas anidadas a cualquier profundidad.
 *
 * Las SALIDAS (bobinas/TON/CTU) se recolectan aparte del árbol y se conectan a la
 * lógica de entrada mediante `construirNetwork` (compartido con ladder_translator).
 */

import { Expresion, Network, Programa, VariableDeclaration } from "../ast/types";
import { SalidaAST, construirNetwork } from "./ladder_translator";
import { ProgramaArbol, RedContactos, TipoElemento, esSalida } from "./network_tree";

/** Tipos de bobina (salida sin estado). TON/CTU no cuentan como "bobina". */
const TIPOS_BOBINA: readonly TipoElemento[] = [
  "bobina",
  "bobina_negada",
  "bobina_set",
  "bobina_reset",
];

/**
 * Traduce el árbol de una red a la expresión booleana de ENTRADA del rung.
 * Los nodos de salida (bobina/TON/CTU) NO forman parte de la lógica de entrada:
 * se tratan como identidad (null) y se recolectan aparte (ver `recolectarSalidas`).
 * Un nodo "vacio" también es identidad. `null` = "sin restricción" (rung cerrado).
 */
export function redAExpresion(red: RedContactos): Expresion | null {
  switch (red.tipo) {
    case "vacio":
      return null;

    case "elemento": {
      const el = red.elemento;
      if (el.tipo === "contacto_na") return { tipo: "contacto_na", variable: el.variable };
      if (el.tipo === "contacto_nc") return { tipo: "contacto_nc", variable: el.variable };
      // Salidas (bobinas/bloques): no aportan a la lógica de entrada.
      return null;
    }

    case "serie":
      return combinar(red.elementos.map(redAExpresion), "and");

    case "paralelo":
      return combinar(red.ramas.map(redAExpresion), "or");
  }
}

/** Combina una lista de expresiones (ignorando los null) con AND u OR, asociando
 *  a la izquierda (igual que el traductor topológico). null si no queda ninguna. */
function combinar(exprs: (Expresion | null)[], op: "and" | "or"): Expresion | null {
  const noNulos = exprs.filter((e): e is Expresion => e !== null);
  if (noNulos.length === 0) return null;
  return noNulos.reduce((izq, der) => ({ tipo: op, izq, der }));
}

/** Recolecta, en orden de aparición, todas las salidas (bobinas/bloques) del árbol. */
export function recolectarSalidas(red: RedContactos, acc: SalidaAST[] = []): SalidaAST[] {
  switch (red.tipo) {
    case "elemento":
      if (esSalida(red.elemento.tipo)) {
        acc.push({
          tipo: red.elemento.tipo,
          variable: red.elemento.variable,
          parametros: red.elemento.parametros,
        });
      }
      break;
    case "serie":
      red.elementos.forEach((h) => recolectarSalidas(h, acc));
      break;
    case "paralelo":
      red.ramas.forEach((h) => recolectarSalidas(h, acc));
      break;
    case "vacio":
      break;
  }
  return acc;
}

/** Id numérico del network: usa el id del rung si es entero, si no su posición. */
function idNetwork(rungId: string, indice: number): number {
  const n = Number(rungId);
  return Number.isInteger(n) ? n : indice + 1;
}

/**
 * Traduce un `ProgramaArbol` completo al AST `Programa`. Cada rung → un Network.
 * `variables` son las declaraciones IEC (del panel de Variables) que el AST necesita.
 */
export function traducirArbolAAST(
  programa: ProgramaArbol,
  variables: VariableDeclaration[],
  nombre = "LadderProgram"
): Programa {
  const networks: Network[] = programa.rungs.map((rung, i) =>
    construirNetwork(idNetwork(rung.id, i), redAExpresion(rung.red), recolectarSalidas(rung.red))
  );

  return { nombre, variables, networks, lenguaje_fuente: "ladder" };
}

/**
 * Advertencias no bloqueantes sobre la topología del árbol (para mostrar en
 * consola al compilar):
 *  - Más de una bobina de salida en un rung: las ramas paralelas forman un OR de
 *    ENTRADA (enclavamiento), no salidas múltiples; la bobina debe ser única.
 *  - CTU sin Reset: no es error (nunca se resetea), pero suele ser un olvido.
 */
export function advertenciasArbol(programa: ProgramaArbol): string[] {
  const avisos: string[] = [];
  for (const rung of programa.rungs) {
    const salidas = recolectarSalidas(rung.red);
    const bobinas = salidas.filter((s) => TIPOS_BOBINA.includes(s.tipo));
    if (bobinas.length > 1) {
      avisos.push(
        `Rung ${rung.id}: hay ${bobinas.length} bobinas de salida. ` +
          `Un rung debe tener una sola bobina; las ramas paralelas forman un OR de entrada (enclavamiento), no salidas múltiples.`
      );
    }
    for (const ctu of salidas.filter((s) => s.tipo === "ctu")) {
      if (!ctu.parametros?.reset_var) {
        avisos.push(
          `Rung ${rung.id}: el CTU '${ctu.variable || "?"}' no tiene Reset definido; nunca se reiniciará.`
        );
      }
    }
  }
  return avisos;
}
