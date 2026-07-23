/**
 * Layout recursivo de una RedContactos → geometría SVG.
 * ------------------------------------------------------
 * Adapta el patrón de layout recursivo de un editor de referencia
 * (serie horizontal / paralelo vertical) devolviendo geometría SVG en vez de
 * nodos de React Flow. NO hay "fila global" ni Map indexado por número de fila:
 * cada llamada devuelve su propio ancho/alto, que su padre usa para acumular.
 * Un "paralelo" anidado dentro de otro simplemente funciona porque `layoutRed`
 * se llama recursivamente sin importar la profundidad.
 *
 * Cada nodo posicionado incluye su RUTA (`number[]`), así que el hit-testing del
 * canvas es directo: "¿qué rectángulo devuelto contiene el punto de click?".
 */
import type { RedContactos } from "./types_canvas";
import { CELDA_H, CELDA_W, NODO_W, RAMA_GAP, anchoElemento } from "./types_canvas";

/** Un nodo hoja posicionado (elemento o vacío), clickeable / hit-testeable. */
export interface NodoPosicionado {
  x: number;
  y: number;
  w: number;
  h: number;
  ref: RedContactos;
  ruta: number[];
}

/** Segmento de cable (línea SVG). */
export interface Segmento {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /**
   * Ruta del nodo del árbol al que pertenece el segmento (para el coloreo de
   * flujo en vivo): la celda "vacio" que dibuja, o la rama de un paralelo cuyos
   * conectores son. `undefined` = cable sin nodo asociado (no se colorea).
   */
  ruta?: number[];
}

/** Un camino individual dentro de un paralelo (para dibujar el ✗ de borrado). */
export interface CaminoInfo {
  indice: number;
  ruta: number[];
  xIzq: number;
  midY: number;
}

/** Metadatos de un nodo "paralelo" (nodos ● de apertura/cierre + sus caminos). */
export interface ParaleloInfo {
  ruta: number[];
  xAbrir: number;
  xCerrar: number;
  midY: number;
  caminos: CaminoInfo[];
}

/** Resultado del layout de una red: geometría lista para pintar. */
export interface LayoutRed {
  nodos: NodoPosicionado[];
  segmentos: Segmento[];
  paralelos: ParaleloInfo[];
  ancho: number;
  alto: number;
  /** Línea de flujo (cable) de entrada/salida de esta red, relativa al SVG. */
  midY: number;
}

/** Tamaño (ancho/alto) que ocupará una red, sin posicionar. */
export function medir(red: RedContactos): { ancho: number; alto: number } {
  switch (red.tipo) {
    case "vacio":
      return { ancho: CELDA_W, alto: CELDA_H };
    case "elemento":
      return { ancho: anchoElemento(red.elemento.tipo), alto: CELDA_H };
    case "serie": {
      if (red.elementos.length === 0) return { ancho: CELDA_W, alto: CELDA_H };
      let ancho = 0;
      let alto = 0;
      for (const hijo of red.elementos) {
        const m = medir(hijo);
        ancho += m.ancho;
        alto = Math.max(alto, m.alto);
      }
      return { ancho, alto };
    }
    case "paralelo": {
      if (red.ramas.length === 0) return { ancho: CELDA_W + 2 * NODO_W, alto: CELDA_H };
      let anchoInterno = 0;
      let alto = 0;
      red.ramas.forEach((rama, i) => {
        const m = medir(rama);
        anchoInterno = Math.max(anchoInterno, m.ancho);
        alto += m.alto + (i > 0 ? RAMA_GAP : 0);
      });
      return { ancho: anchoInterno + 2 * NODO_W, alto };
    }
  }
}

/**
 * Posiciona una red a partir de (x, y). Devuelve todos los nodos hoja, los
 * segmentos de cable y los metadatos de paralelos, ya en coordenadas absolutas.
 */
export function layoutRed(
  red: RedContactos,
  x: number,
  y: number,
  ruta: number[] = []
): LayoutRed {
  const { ancho, alto } = medir(red);
  const midY = y + alto / 2;

  switch (red.tipo) {
    case "vacio":
    case "elemento": {
      // Cable base horizontal a través de la celda (para elementos lo redibuja
      // ElementoSVG, pero para "vacio" es la única fuente del cable).
      const segmentos: Segmento[] =
        red.tipo === "vacio" ? [{ x1: x, y1: midY, x2: x + ancho, y2: midY, ruta }] : [];
      return {
        nodos: [{ x, y, w: ancho, h: alto, ref: red, ruta }],
        segmentos,
        paralelos: [],
        ancho,
        alto,
        midY,
      };
    }

    case "serie": {
      const hijos = red.elementos.length > 0 ? red.elementos : [{ tipo: "vacio" } as RedContactos];
      const nodos: NodoPosicionado[] = [];
      const segmentos: Segmento[] = [];
      const paralelos: ParaleloInfo[] = [];
      let cx = x;
      hijos.forEach((hijo, i) => {
        const m = medir(hijo);
        // Centrar cada hijo verticalmente en la línea de flujo de la serie.
        const hijoY = y + (alto - m.alto) / 2;
        const sub = layoutRed(hijo, cx, hijoY, [...ruta, i]);
        nodos.push(...sub.nodos);
        segmentos.push(...sub.segmentos);
        paralelos.push(...sub.paralelos);
        cx += m.ancho;
      });
      return { nodos, segmentos, paralelos, ancho, alto, midY };
    }

    case "paralelo": {
      const nodos: NodoPosicionado[] = [];
      const segmentos: Segmento[] = [];
      const paralelos: ParaleloInfo[] = [];
      const xAbrir = x;
      const xCerrar = x + ancho;
      const ramaX = x + NODO_W;
      const caminos: CaminoInfo[] = [];

      let cy = y;
      red.ramas.forEach((rama, i) => {
        if (i > 0) cy += RAMA_GAP;
        const m = medir(rama);
        const rutaRama = [...ruta, i];
        const sub = layoutRed(rama, ramaX, cy, rutaRama);
        const ramaMidY = sub.midY;
        nodos.push(...sub.nodos);
        segmentos.push(...sub.segmentos);
        paralelos.push(...sub.paralelos);

        // Conectores: apertura (vertical desde midY del paralelo a la rama +
        // stub horizontal hasta el inicio de la rama) y cierre (stub desde el
        // fin de la rama al nodo de cierre + vertical de vuelta a midY). Todos
        // se etiquetan con la ruta de SU rama, para que el coloreo de flujo los
        // encienda cuando esa rama conduce.
        segmentos.push({ x1: xAbrir, y1: midY, x2: xAbrir, y2: ramaMidY, ruta: rutaRama });
        segmentos.push({ x1: xAbrir, y1: ramaMidY, x2: ramaX, y2: ramaMidY, ruta: rutaRama });
        const ramaDer = ramaX + m.ancho;
        segmentos.push({ x1: ramaDer, y1: ramaMidY, x2: xCerrar, y2: ramaMidY, ruta: rutaRama });
        segmentos.push({ x1: xCerrar, y1: midY, x2: xCerrar, y2: ramaMidY, ruta: rutaRama });

        caminos.push({ indice: i, ruta: [...ruta, i], xIzq: xAbrir, midY: ramaMidY });
        cy += m.alto;
      });

      paralelos.push({ ruta, xAbrir, xCerrar, midY, caminos });
      return { nodos, segmentos, paralelos, ancho, alto, midY };
    }
  }
}
