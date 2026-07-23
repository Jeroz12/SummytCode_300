/**
 * Validación TOPOLÓGICA de un rung (árbol RedContactos) ANTES de compilar.
 * --------------------------------------------------------------------------
 * No valida tipos de variable ni semántica IEC: solo la FORMA del árbol,
 * cosas que `redAExpresion`/`recolectarSalidas` (arbol_translator.ts) no
 * detectan porque simplemente producen `null` o una lista vacía en silencio.
 *
 * Checks implementados:
 *  1. Rung vacío (sin ningún elemento real, solo placeholders "vacio")   → error
 *  2. Ninguna salida (bobina/set/reset/TON/CTU) en todo el rung          → error
 *  3. Salida sin ningún contacto antes en su cadena de entrada           → error
 *  4. Salida ubicada dentro de una rama paralela (no al final del tronco) → warning
 *  5. Bifurcación ("paralelo") con un solo camino                        → warning
 *
 * Se llama una vez por rung, antes de `traducirArbolAAST`. Si hay algún
 * "error", el pipeline debe abortar la compilación de ese rung; los
 * "warning" no abortan.
 */

import { RedContactos, RungArbol, Ruta, esSalida } from "./network_tree";

export type NivelValidacion = "error" | "warning";

/** Un hallazgo de la validación topológica de un rung. */
export interface ErrorValidacion {
  nivel: NivelValidacion;
  mensaje: string;
  /** Ruta del nodo (dentro de `RungArbol.red`) al que se refiere, si aplica. */
  rutaNodo?: Ruta;
}

/** True si el árbol no contiene ningún elemento real (solo "vacio" en todas las hojas). */
function esRedVacia(red: RedContactos): boolean {
  switch (red.tipo) {
    case "vacio":
      return true;
    case "elemento":
      return false;
    case "serie":
      return red.elementos.every(esRedVacia);
    case "paralelo":
      return red.ramas.every(esRedVacia);
  }
}

/** Recolecta las rutas de todos los nodos de salida (bobina/set/reset/TON/CTU) del árbol. */
function recolectarRutasSalida(red: RedContactos, ruta: Ruta = [], acc: Ruta[] = []): Ruta[] {
  switch (red.tipo) {
    case "elemento":
      if (esSalida(red.elemento.tipo)) acc.push(ruta);
      break;
    case "serie":
      red.elementos.forEach((h, i) => recolectarRutasSalida(h, [...ruta, i], acc));
      break;
    case "paralelo":
      red.ramas.forEach((h, i) => recolectarRutasSalida(h, [...ruta, i], acc));
      break;
    case "vacio":
      break;
  }
  return acc;
}

/**
 * Check 3: cada salida debe tener al menos un contacto (NA/NC) antes de ella
 * en su cadena de entrada. Recorre en orden (serie = izquierda a derecha,
 * paralelo = cada rama independiente) llevando si ya se "vio" un contacto;
 * al cerrar un "paralelo" el resultado es el OR de sus ramas (si al menos
 * una rama aportó un contacto, la condición cuenta como satisfecha).
 */
function validarCondicionSalidas(red: RedContactos): ErrorValidacion[] {
  const errores: ErrorValidacion[] = [];

  function recorrer(nodo: RedContactos, ruta: Ruta, contactoPrevio: boolean): boolean {
    switch (nodo.tipo) {
      case "vacio":
        return contactoPrevio;

      case "elemento": {
        const t = nodo.elemento.tipo;
        if (t === "contacto_na" || t === "contacto_nc") return true;
        if (esSalida(t)) {
          if (!contactoPrevio) {
            errores.push({ nivel: "error", mensaje: "Salida sin condición", rutaNodo: ruta });
          }
          return contactoPrevio;
        }
        return contactoPrevio;
      }

      case "serie": {
        let visto = contactoPrevio;
        nodo.elementos.forEach((h, i) => {
          visto = recorrer(h, [...ruta, i], visto);
        });
        return visto;
      }

      case "paralelo": {
        const resultados = nodo.ramas.map((h, i) => recorrer(h, [...ruta, i], contactoPrevio));
        return resultados.some((v) => v);
      }
    }
  }

  recorrer(red, [], false);
  return errores;
}

/**
 * Checks 4 y 5: estructura de las bifurcaciones.
 *  - Una salida encontrada mientras se está dentro de una rama paralela
 *    (no en el tronco principal, después de cerrarse el paralelo) → warning.
 *  - Un nodo "paralelo" con una sola rama (bifurcación degenerada) → warning.
 */
function validarEstructuraParalela(red: RedContactos): ErrorValidacion[] {
  const errores: ErrorValidacion[] = [];

  function recorrer(nodo: RedContactos, ruta: Ruta, dentroDeParalelo: boolean): void {
    switch (nodo.tipo) {
      case "vacio":
        return;

      case "elemento":
        if (dentroDeParalelo && esSalida(nodo.elemento.tipo)) {
          errores.push({
            nivel: "warning",
            mensaje: "Salida dentro de una rama paralela (debería ir al final del tronco principal)",
            rutaNodo: ruta,
          });
        }
        return;

      case "serie":
        nodo.elementos.forEach((h, i) => recorrer(h, [...ruta, i], dentroDeParalelo));
        return;

      case "paralelo":
        if (nodo.ramas.length === 1) {
          errores.push({
            nivel: "warning",
            mensaje: "Bifurcación con un solo camino",
            rutaNodo: ruta,
          });
        }
        nodo.ramas.forEach((h, i) => recorrer(h, [...ruta, i], true));
        return;
    }
  }

  recorrer(red, [], false);
  return errores;
}

/**
 * Valida la topología de un rung ANTES de traducirlo a AST. Devuelve la lista
 * de errores/warnings encontrados (vacía si el rung está limpio). Si el rung
 * está vacío se corta ahí (los demás checks no aportan nada nuevo).
 */
export function validarRung(rung: RungArbol): ErrorValidacion[] {
  const errores: ErrorValidacion[] = [];

  if (esRedVacia(rung.red)) {
    errores.push({ nivel: "error", mensaje: "Rung vacío" });
    return errores;
  }

  const rutasSalida = recolectarRutasSalida(rung.red);
  if (rutasSalida.length === 0) {
    errores.push({ nivel: "error", mensaje: "Rung sin salida" });
  }

  errores.push(...validarCondicionSalidas(rung.red));
  errores.push(...validarEstructuraParalela(rung.red));

  return errores;
}
