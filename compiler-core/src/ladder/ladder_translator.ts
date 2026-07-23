/**
 * Traductor de Ladder → AST
 * -------------------------
 * Convierte un `LadderPrograma` (representación del rung dibujado) en el mismo
 * `Programa` (AST) que produce el parser de ST. Reglas de mapeo (§4):
 *
 *   - Elementos en SERIE dentro de una rama      → AND anidado
 *   - Ramas en PARALELO dentro de un rung        → OR anidado
 *   - Contacto NA / NC                           → contacto_na / contacto_nc
 *   - Bobina —( )—                               → asignacion (lógica anidada en `valor`)
 *   - Bobina negada —(/)—                        → asignacion con NOT
 *   - Bobina SET —(S)— / RESET —(R)—             → bobina_s / bobina_r
 *   - TON / CTU                                  → nodos ton / ctu
 *
 * Gracias a esto, Ladder y ST desembocan en el mismo AST y comparten el codegen.
 */

import { Ctu, Expresion, Network, Programa, Ton } from "../ast/types";
import { LadderElemento, LadderPrograma, LadderRama } from "./types";

/** Combina dos expresiones en serie (AND). Anotado para fijar el tipo literal. */
const enSerie = (izq: Expresion, der: Expresion): Expresion => ({ tipo: "and", izq, der });

/** Combina dos expresiones en paralelo (OR). */
const enParalelo = (izq: Expresion, der: Expresion): Expresion => ({ tipo: "or", izq, der });

/** Un contacto sin lógica previa se energiza siempre (rung "cerrado"). */
export const SIEMPRE_VERDADERO: Expresion = { tipo: "literal", valor: true };

/** Condición que nunca se energiza (para un CTU sin Reset: "nunca resetea"). */
export const SIEMPRE_FALSO: Expresion = { tipo: "literal", valor: false };

/**
 * Forma mínima de una salida (bobina/bloque) para construir un Network: no
 * necesita `id`/`posicion`, solo tipo + variable + parámetros. Tanto el modelo
 * topológico `LadderElemento` como el `ElementoLadder` del árbol la satisfacen.
 */
export type SalidaAST = Pick<LadderElemento, "tipo" | "variable" | "parametros">;

/**
 * Traduce un programa Ladder completo al AST `Programa`.
 * Cada `LadderRung` produce un `Network`.
 */
export function traducirLadderAAST(programa: LadderPrograma): Programa {
  const networks = programa.rungs.map((rung) =>
    // 1. Lógica de entrada del rung: OR de ramas, cada rama es un AND de contactos.
    construirNetwork(rung.id, construirLogicaDeRamas(rung.ramas), rung.salidas)
  );

  return {
    nombre: programa.nombre,
    variables: programa.variables,
    networks,
    lenguaje_fuente: "ladder",
  };
}

/**
 * Construye UN `Network` a partir de la lógica de entrada ya calculada
 * (`logica`) y las salidas del rung. Es el punto común de los dos frontends de
 * Ladder: el modelo topológico (`LadderRung.ramas` → `construirLogicaDeRamas`) y
 * el modelo de árbol (`RedContactos` → `redAExpresion`). La lógica de conectar
 * cada bobina/bloque a la expresión de entrada es idéntica en ambos.
 */
export function construirNetwork(
  id: number,
  logica: Expresion | null,
  salidas: SalidaAST[]
): Network {
  const expresiones: Expresion[] = [];

  // Para bobinas SET/RESET (que en el AST no llevan condición propia), la
  // lógica se antepone una sola vez como expresión líder del network.
  let liderIncluido = false;
  const asegurarLider = (): void => {
    if (!liderIncluido && logica) {
      expresiones.unshift(logica);
      liderIncluido = true;
    }
  };

  // Conectar la lógica a cada salida.
  for (const salida of salidas) {
    switch (salida.tipo) {
      case "bobina":
        expresiones.push({
          tipo: "asignacion",
          variable: salida.variable,
          valor: logica ?? SIEMPRE_VERDADERO,
        });
        break;

      case "bobina_negada":
        expresiones.push({
          tipo: "asignacion",
          variable: salida.variable,
          valor: { tipo: "not", operando: logica ?? SIEMPRE_VERDADERO },
        });
        break;

      case "bobina_set":
        asegurarLider();
        expresiones.push({ tipo: "bobina_s", variable: salida.variable });
        break;

      case "bobina_reset":
        asegurarLider();
        expresiones.push({ tipo: "bobina_r", variable: salida.variable });
        break;

      case "ton":
        expresiones.push(construirTon(salida, logica));
        break;

      case "ctu":
        expresiones.push(construirCtu(salida, logica));
        break;

      default:
        throw new Error(
          `El elemento '${salida.tipo}' no es una salida válida de un rung (se esperaba bobina, bobina_negada, bobina_set, bobina_reset, ton o ctu)`
        );
    }
  }

  return { id, expresiones };
}

// --- Helpers -------------------------------------------------------------

/** OR de todas las ramas; cada rama es el AND en serie de sus contactos. */
function construirLogicaDeRamas(ramas: LadderRama[]): Expresion | null {
  const exprRamas: Expresion[] = [];
  for (const rama of ramas) {
    const serie = construirSerie(rama.elementos);
    if (serie) exprRamas.push(serie);
  }
  if (exprRamas.length === 0) return null;
  // reduce sin valor inicial → OR anidado a la izquierda.
  return exprRamas.reduce((acc, e) => enParalelo(acc, e));
}

/** AND en serie de los contactos de una rama. */
function construirSerie(elementos: LadderElemento[]): Expresion | null {
  const contactos: Expresion[] = elementos.map(elementoAContacto);
  if (contactos.length === 0) return null;
  return contactos.reduce((acc, e) => enSerie(acc, e));
}

/** Un elemento de rama debe ser un contacto (los bloques/bobinas van en `salidas`). */
function elementoAContacto(el: LadderElemento): Expresion {
  switch (el.tipo) {
    case "contacto_na":
      return { tipo: "contacto_na", variable: el.variable };
    case "contacto_nc":
      return { tipo: "contacto_nc", variable: el.variable };
    default:
      throw new Error(
        `Dentro de una rama solo se permiten contactos; se encontró '${el.tipo}' (los bloques y bobinas van en 'salidas')`
      );
  }
}

/**
 * La entrada de un TON (`in`) es la lógica completa del rung que lo alimenta:
 * la misma expresión AND/OR que se usa para una bobina. Ya no hay caso especial
 * para "un solo contacto" — el AST acepta cualquier `Expresion`.
 */
function construirTon(el: SalidaAST, logica: Expresion | null): Ton {
  const p = el.parametros ?? {};
  if (p.pt_ms === undefined) {
    throw new Error(`El TON '${el.variable}' requiere 'parametros.pt_ms'`);
  }
  if (!p.q_var) {
    throw new Error(`El TON '${el.variable}' requiere 'parametros.q_var'`);
  }
  return {
    tipo: "ton",
    in: logica ?? SIEMPRE_VERDADERO,
    pt_ms: p.pt_ms,
    q_var: p.q_var,
    et_var: p.et_var,
  };
}

/**
 * `cu` (pulso de conteo) es la lógica completa del rung. `reset` sigue siendo,
 * a nivel de dibujo, un único nombre de variable (`parametros.reset_var`) que se
 * envuelve en un contacto NA para producir una `Expresion` del AST.
 */
function construirCtu(el: SalidaAST, logica: Expresion | null): Ctu {
  const p = el.parametros ?? {};
  if (p.pv === undefined) {
    throw new Error(`El CTU '${el.variable}' requiere 'parametros.pv'`);
  }
  if (!p.q_var) {
    throw new Error(`El CTU '${el.variable}' requiere 'parametros.q_var'`);
  }
  // Reset es OPCIONAL (v1: sin popover que fuerce a completarlo): si no se
  // definió, el CTU simplemente nunca se resetea (condición SIEMPRE_FALSO) en
  // vez de romper la compilación. `advertenciasCanvas` avisa de esto sin bloquear.
  return {
    tipo: "ctu",
    cu: logica ?? SIEMPRE_VERDADERO,
    reset: p.reset_var ? { tipo: "contacto_na", variable: p.reset_var } : SIEMPRE_FALSO,
    pv: p.pv,
    q_var: p.q_var,
    cv_var: p.cv_var,
  };
}
