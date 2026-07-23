/**
 * Modelo de datos de Ladder: ÁRBOL RECURSIVO de contactos (red serie/paralelo)
 * ---------------------------------------------------------------------------
 * Reemplaza el modelo previo de grilla plana (RungCanvas) + marcadores ⊢/⊣.
 *
 * En vez de "número de fila global" (una clave que dejaba de ser segura en
 * cuanto coexistían dos grupos de bifurcación), el cuerpo de un rung es UN
 * ÁRBOL: una rama paralela es un nodo anidado, no una entrada en una tabla.
 * Esto da ramas anidadas GRATIS y elimina toda la aritmética de filas/columnas.
 *
 * Semántica eléctrica:
 *   - "serie"    = elementos en AND lógico (dispuestos horizontalmente).
 *   - "paralelo" = ramas en OR lógico (dispuestas verticalmente); cada rama es
 *                  CUALQUIER RedContactos (incluida otra serie/paralelo anidado).
 *   - "elemento" = un contacto/bobina/TON/CTU concreto.
 *   - "vacio"    = placeholder clickeable (celda libre donde colocar).
 *
 * Todas las operaciones de edición son PURAS e INMUTABLES y ubican el nodo por
 * una RUTA (`number[]`): el camino de índices desde la raíz. En cada paso el
 * índice entra en el array de hijos del nodo (elementos si es "serie", ramas si
 * es "paralelo"). Ninguna operación necesita saber de "filas" ni "columnas".
 */

// ── Elementos dibujables (sin marcadores de rama: la topología es el árbol) ──

/** Tipos de elemento que el usuario puede colocar. */
export type TipoElemento =
  | "contacto_na"
  | "contacto_nc"
  | "bobina"
  | "bobina_negada"
  | "bobina_set"
  | "bobina_reset"
  | "ton"
  | "ctu";

/** Parámetros extra de bloques con estado (TON/CTU). Vacío para contactos/bobinas. */
export interface ParametrosLadder {
  pt_ms?: number;
  pv?: number;
  q_var?: string;
  et_var?: string;
  cv_var?: string;
  reset_var?: string;
}

/** Un elemento concreto. `variable` es el operando IEC principal (o la salida Q en bloques). */
export interface ElementoLadder {
  tipo: TipoElemento;
  variable: string;
  parametros?: ParametrosLadder;
}

// ── Árbol recursivo ──────────────────────────────────────────────────────────

/** Nodo del árbol de una red de contactos. */
export type RedContactos =
  | { tipo: "serie"; elementos: RedContactos[] }
  | { tipo: "paralelo"; ramas: RedContactos[] }
  | { tipo: "elemento"; elemento: ElementoLadder }
  | { tipo: "vacio" };

/** Un rung: su cuerpo completo es UN árbol de contactos. */
export interface RungArbol {
  id: string;
  comentario?: string;
  red: RedContactos;
}

/** Programa Ladder completo. */
export interface ProgramaArbol {
  rungs: RungArbol[];
}

/** Ruta de índices desde la raíz hasta un nodo (`[]` = la propia raíz). */
export type Ruta = number[];

// ── Salidas / bloques ────────────────────────────────────────────────────────

/** Tipos de elemento que actúan como SALIDA del rung (bobinas y bloques con estado). */
export const TIPOS_SALIDA: readonly TipoElemento[] = [
  "bobina",
  "bobina_negada",
  "bobina_set",
  "bobina_reset",
  "ton",
  "ctu",
];

/** True si el elemento es una salida (bobina o bloque con estado), no un contacto. */
export function esSalida(tipo: TipoElemento): boolean {
  return TIPOS_SALIDA.includes(tipo);
}

/** True si el bloque ocupa 2 unidades de ancho (TON/CTU). */
export function ocupaDosColumnas(tipo: TipoElemento): boolean {
  return tipo === "ton" || tipo === "ctu";
}

// ── Constructores ────────────────────────────────────────────────────────────

/** Una red vacía nueva: una serie con un único placeholder clickeable. */
export function redVacia(): RedContactos {
  return { tipo: "serie", elementos: [{ tipo: "vacio" }] };
}

/** Un rung vacío nuevo. */
export function rungArbolVacio(id: string): RungArbol {
  return { id, red: redVacia() };
}

// ── Navegación por RUTA (inmutable) ──────────────────────────────────────────

/** Hijos navegables de un nodo (elementos/ramas), o `null` si es una hoja. */
function hijos(red: RedContactos): RedContactos[] | null {
  if (red.tipo === "serie") return red.elementos;
  if (red.tipo === "paralelo") return red.ramas;
  return null;
}

/** Reconstruye un nodo contenedor con un nuevo array de hijos (misma variante). */
function conHijos(red: RedContactos, nuevos: RedContactos[]): RedContactos {
  if (red.tipo === "serie") return { tipo: "serie", elementos: nuevos };
  if (red.tipo === "paralelo") return { tipo: "paralelo", ramas: nuevos };
  return red; // hoja: no debería llamarse
}

/** Devuelve el nodo ubicado en `ruta` (o lanza si la ruta es inválida). */
export function obtenerNodo(red: RedContactos, ruta: Ruta): RedContactos {
  if (ruta.length === 0) return red;
  const [i, ...resto] = ruta;
  const hs = hijos(red);
  if (!hs || i < 0 || i >= hs.length) {
    throw new Error(`Ruta inválida: no existe el hijo ${i} en un nodo '${red.tipo}'`);
  }
  return obtenerNodo(hs[i], resto);
}

/**
 * Devuelve una copia de `red` con el nodo en `ruta` reemplazado por `fn(nodo)`.
 * Es la primitiva sobre la que se construyen todas las operaciones de edición.
 */
export function transformarEn(
  red: RedContactos,
  ruta: Ruta,
  fn: (nodo: RedContactos) => RedContactos
): RedContactos {
  if (ruta.length === 0) return fn(red);
  const [i, ...resto] = ruta;
  const hs = hijos(red);
  if (!hs || i < 0 || i >= hs.length) {
    throw new Error(`Ruta inválida: no existe el hijo ${i} en un nodo '${red.tipo}'`);
  }
  const nuevos = hs.slice();
  nuevos[i] = transformarEn(hs[i], resto, fn);
  return conHijos(red, nuevos);
}

// ── Las 6 operaciones de edición (puras, inmutables) ─────────────────────────

/**
 * (1) Coloca un elemento en `ruta`: reemplaza el nodo ahí (típicamente "vacio")
 * por `{ tipo: "elemento", elemento }`.
 */
export function colocarElemento(
  red: RedContactos,
  ruta: Ruta,
  elemento: ElementoLadder
): RedContactos {
  return transformarEn(red, ruta, () => ({ tipo: "elemento", elemento }));
}

/**
 * (2) Elimina el elemento en `ruta`. Si su padre es una "serie" con más de un
 * hijo, se hace splice del índice (la celda desaparece, lo natural al borrar de
 * una fila). Si era el único hijo de la serie, queda un placeholder "vacio". Si
 * el padre es un "paralelo", esa rama se reemplaza por una serie vacía (para
 * quitar la rama COMPLETA se usa `eliminarCamino`).
 */
export function eliminarElemento(red: RedContactos, ruta: Ruta): RedContactos {
  if (ruta.length === 0) return redVacia();
  const rutaPadre = ruta.slice(0, -1);
  const idx = ruta[ruta.length - 1];
  return transformarEn(red, rutaPadre, (padre) => {
    if (padre.tipo === "serie") {
      if (padre.elementos.length > 1) {
        return { tipo: "serie", elementos: padre.elementos.filter((_, i) => i !== idx) };
      }
      return { tipo: "serie", elementos: [{ tipo: "vacio" }] };
    }
    if (padre.tipo === "paralelo") {
      const nuevas = padre.ramas.slice();
      nuevas[idx] = redVacia();
      return { tipo: "paralelo", ramas: nuevas };
    }
    return padre;
  });
}

/**
 * (3) Inserta un elemento en serie junto al nodo de `ruta`, dentro de su misma
 * serie padre (`despues` = a la derecha, si no a la izquierda). Si el nodo no
 * está dentro de una serie (p.ej. es una rama directa de un paralelo, o la
 * raíz), se envuelve el nodo objetivo en una nueva serie de dos elementos.
 */
function insertarEnSerie(
  red: RedContactos,
  ruta: Ruta,
  elemento: ElementoLadder,
  despues: boolean
): RedContactos {
  const nuevo: RedContactos = { tipo: "elemento", elemento };
  if (ruta.length > 0) {
    const rutaPadre = ruta.slice(0, -1);
    const idx = ruta[ruta.length - 1];
    const padre = obtenerNodo(red, rutaPadre);
    if (padre.tipo === "serie") {
      return transformarEn(red, rutaPadre, (p) => {
        if (p.tipo !== "serie") return p;
        const nuevos = p.elementos.slice();
        nuevos.splice(despues ? idx + 1 : idx, 0, nuevo);
        return { tipo: "serie", elementos: nuevos };
      });
    }
  }
  // Padre no-serie (o raíz): envolver el nodo objetivo en una nueva serie.
  return transformarEn(red, ruta, (nodo) => ({
    tipo: "serie",
    elementos: despues ? [nodo, nuevo] : [nuevo, nodo],
  }));
}

export function insertarSerieAntes(
  red: RedContactos,
  ruta: Ruta,
  elemento: ElementoLadder
): RedContactos {
  return insertarEnSerie(red, ruta, elemento, false);
}

export function insertarSerieDespues(
  red: RedContactos,
  ruta: Ruta,
  elemento: ElementoLadder
): RedContactos {
  return insertarEnSerie(red, ruta, elemento, true);
}

/**
 * (4) Bifurca el nodo de `ruta`: lo reemplaza por un "paralelo" cuyo camino 0 es
 * el nodo original y cuyo camino 1 es una serie vacía nueva. Esto es "abrir una
 * rama": el contenido existente pasa a ser el primer camino, y aparece un
 * segundo camino vacío al lado. Funciona sobre CUALQUIER nodo (elemento o
 * vacío), a cualquier profundidad → ramas anidadas gratis.
 */
export function bifurcar(red: RedContactos, ruta: Ruta): RedContactos {
  return transformarEn(red, ruta, (nodo) => ({
    tipo: "paralelo",
    ramas: [nodo, redVacia()],
  }));
}

/**
 * (5) Agrega un N-ésimo camino a un nodo "paralelo" ya existente (ruta apunta al
 * paralelo). Sin ninguna restricción de filas globales.
 */
export function agregarCaminoParalelo(red: RedContactos, ruta: Ruta): RedContactos {
  return transformarEn(red, ruta, (nodo) => {
    if (nodo.tipo !== "paralelo") {
      throw new Error(`agregarCaminoParalelo requiere un nodo 'paralelo', no '${nodo.tipo}'`);
    }
    return { tipo: "paralelo", ramas: [...nodo.ramas, redVacia()] };
  });
}

/**
 * (6) Elimina el camino `indiceRama` de un nodo "paralelo" (ruta apunta al
 * paralelo). Si tras el splice queda una sola rama, DESENVUELVE el paralelo:
 * lo reemplaza por su única rama restante (colapsa la bifurcación). Si no
 * quedara ninguna, deja una red vacía.
 */
export function eliminarCamino(
  red: RedContactos,
  ruta: Ruta,
  indiceRama: number
): RedContactos {
  return transformarEn(red, ruta, (nodo) => {
    if (nodo.tipo !== "paralelo") {
      throw new Error(`eliminarCamino requiere un nodo 'paralelo', no '${nodo.tipo}'`);
    }
    const ramas = nodo.ramas.filter((_, i) => i !== indiceRama);
    if (ramas.length === 0) return redVacia();
    if (ramas.length === 1) return ramas[0]; // colapsar
    return { tipo: "paralelo", ramas };
  });
}
