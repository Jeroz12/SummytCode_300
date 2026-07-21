import type { Expresion } from "../../ast/types";
import type { EmitContext } from "../types";

/**
 * Sanitiza un nombre del AST para que sea un identificador C válido:
 * - Reemplaza cualquier caracter fuera de [A-Za-z0-9_] por '_'.
 * - Antepone '_' si empieza por dígito.
 * - Garantiza al menos un caracter.
 */
export function sanitizarNombre(nombre: string): string {
  let s = nombre.replace(/[^A-Za-z0-9_]/g, "_");
  if (s.length === 0) s = "_";
  if (/^[0-9]/.test(s)) s = "_" + s;
  return s;
}

/**
 * Traduce un nodo `Expresion` (de VALOR) a una expresión C equivalente.
 *
 * Los nodos de tipo statement (asignacion, bobina, bobina_s, bobina_r) NO se
 * emiten aquí: los maneja el generador (CGenerator) porque producen sentencias,
 * no valores. Para `ton`/`ctu` se emite su condición de entrada (in / cu), ya que
 * el bloque completo se emite como statement.
 */
export function emitirExpresion(expr: Expresion, ctx: EmitContext): string {
  switch (expr.tipo) {
    case "contacto_na":
      return sanitizarNombre(expr.variable);

    case "contacto_nc":
      return `(!${sanitizarNombre(expr.variable)})`;

    case "literal":
      return typeof expr.valor === "boolean" ? (expr.valor ? "1" : "0") : String(expr.valor);

    case "and":
      return `(${emitirExpresion(expr.izq, ctx)} && ${emitirExpresion(expr.der, ctx)})`;

    case "or":
      return `(${emitirExpresion(expr.izq, ctx)} || ${emitirExpresion(expr.der, ctx)})`;

    case "not":
      return `(!${emitirExpresion(expr.operando, ctx)})`;

    case "comparacion":
      // El operador del AST (==, !=, <, >, <=, >=) ya es válido en C.
      return `(${emitirExpresion(expr.izq, ctx)} ${expr.operador} ${emitirExpresion(expr.der, ctx)})`;

    case "ton":
      return emitirExpresion(expr.in, ctx);

    case "ctu":
      return emitirExpresion(expr.cu, ctx);

    case "asignacion":
    case "bobina":
    case "bobina_s":
    case "bobina_r":
      throw new Error(
        `El nodo '${expr.tipo}' es un statement, no una expresión de valor; debe emitirse desde CGenerator, no desde emitirExpresion().`
      );

    default: {
      // Chequeo de exhaustividad: si se agrega un nodo nuevo al AST, TS falla aquí.
      const _exhaustivo: never = expr;
      throw new Error(`Nodo de expresión no soportado: ${JSON.stringify(_exhaustivo)}`);
    }
  }
}
