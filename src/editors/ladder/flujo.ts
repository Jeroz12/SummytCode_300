/**
 * Propagación de flujo (power-flow) para el MONITOREO EN VIVO del canvas Ladder.
 * --------------------------------------------------------------------------
 * Dado el estado real de las variables (llegado por serial vía el evento
 * `plc_estado`), calcula por dónde "circula corriente" en un rung, para pintarlo.
 *
 * Es lógica de VISUALIZACIÓN, no de compilación: vive en el renderer, no en
 * compiler-core. Reutiliza el mismo modelo eléctrico que el traductor (serie =
 * AND, paralelo = OR, NC = negación), pero aquí sobre valores concretos en vez
 * de generar código. Funciones PURAS → testeables (ver compiler-core/tests/flujo.test.ts).
 */
import type { RedContactos } from "../../../compiler-core/src/ladder/network_tree";

/**
 * ¿Conduce esta red con el `estado` dado? (¿pasa corriente de izquierda a derecha
 * si le llega alimentación?). No considera lo que hay AGUAS ARRIBA: es la
 * conducción propia de la sub-red.
 *
 *  - "vacio"    → true (un hueco no bloquea).
 *  - "elemento" → contacto NA: valor de la variable; NC: su negación; las salidas
 *                 (bobinas / TON / CTU) no son condición y no bloquean → true.
 *  - "serie"    → AND de todos sus elementos.
 *  - "paralelo" → OR de todas sus ramas.
 */
export function propagarFlujo(red: RedContactos, estado: Record<string, boolean>): boolean {
  switch (red.tipo) {
    case "vacio":
      return true;
    case "elemento": {
      const el = red.elemento;
      switch (el.tipo) {
        case "contacto_na":
          return estado[el.variable] ?? false;
        case "contacto_nc":
          return !(estado[el.variable] ?? false);
        default:
          // bobina / bobina_negada / set / reset / ton / ctu: son SALIDAS, no
          // condiciones; para el flujo se comportan como un cable (no bloquean).
          return true;
      }
    }
    case "serie":
      return red.elementos.every((e) => propagarFlujo(e, estado));
    case "paralelo":
      return red.ramas.some((r) => propagarFlujo(r, estado));
  }
}

/** Clave de una ruta, alineada con `claveRuta` de LadderRung (`[]` → "raiz"). */
export function claveFlujo(ruta: number[]): string {
  return ruta.length === 0 ? "raiz" : ruta.join("-");
}

/**
 * Anota, para CADA nodo del árbol (indexado por su ruta), si por él circula
 * corriente de verdad = alimentación que le llega AGUAS ARRIBA **y** conducción
 * propia. Es lo que se pinta de verde: el camino energizado real.
 *
 * La raíz recibe alimentación (`entrada = true`, el riel izquierdo). En una serie
 * cada elemento recibe como entrada la salida del anterior (un contacto abierto
 * "corta" y todo lo que sigue queda sin energizar). En un paralelo cada rama
 * recibe la misma entrada y la salida del conjunto es el OR de las ramas.
 *
 * Se visita el árbol COMPLETO (sin cortocircuitar el OR/AND) para que todos los
 * nodos queden en el mapa, incluidos los de ramas que no conducen.
 */
export function anotarFlujo(
  red: RedContactos,
  estado: Record<string, boolean>
): Map<string, boolean> {
  const mapa = new Map<string, boolean>();

  const visitar = (nodo: RedContactos, ruta: number[], entrada: boolean): boolean => {
    let salida: boolean;
    switch (nodo.tipo) {
      case "vacio":
        salida = entrada;
        break;
      case "elemento":
        salida = entrada && propagarFlujo(nodo, estado);
        break;
      case "serie": {
        let f = entrada;
        nodo.elementos.forEach((e, i) => {
          f = visitar(e, [...ruta, i], f);
        });
        salida = f;
        break;
      }
      case "paralelo": {
        let alguna = false;
        nodo.ramas.forEach((r, i) => {
          // Sin cortocircuito: cada rama debe anotarse aunque otra ya conduzca.
          if (visitar(r, [...ruta, i], entrada)) alguna = true;
        });
        salida = alguna;
        break;
      }
    }
    mapa.set(claveFlujo(ruta), salida);
    return salida;
  };

  visitar(red, [], true);
  return mapa;
}
