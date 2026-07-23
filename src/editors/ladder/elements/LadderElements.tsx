/**
 * Símbolos SVG de los elementos Ladder.
 *
 * Cada elemento se dibuja dentro de una "caja de celda" cuyo origen (x, y) es la
 * esquina superior izquierda. El cable lógico atraviesa la caja por su centro
 * vertical (`y + h/2`). Los contactos/bobinas ocupan 1 celda; TON/CTU ocupan 2.
 *
 * Se agrupan en un único módulo (en vez de un archivo por símbolo) porque todos
 * comparten el mismo contrato de props y las mismas primitivas de dibujo.
 */
import type { TipoElemento } from "../types_canvas";
import { CELDA_H, CELDA_W } from "../types_canvas";

const TRAZO = "var(--ladder-wire)";
const TEXTO = "var(--ladder-text)";
const TEXTO_VAR = "var(--ladder-var)";

interface SimboloProps {
  /** Esquina superior izquierda de la caja del elemento (px absolutos en el SVG). */
  x: number;
  y: number;
  /** Ancho de la caja (CELDA_W o 2·CELDA_W para bloques). */
  w: number;
  /** Alto de la caja (CELDA_H en el tronco, BRANCH_H — más compacto — en una rama). */
  h: number;
  variable: string;
  ptMs?: number;
  pv?: number;
  etVar?: string;
  cvVar?: string;
  resetVar?: string;
  /**
   * Monitoreo en vivo: por este elemento circula corriente. Colorea sus
   * conductores de verde (--ladder-flujo). `undefined`/false = colores normales.
   */
  activo?: boolean;
}

/** Color de los conductores de un símbolo: verde si está energizado, si no el normal. */
function colorTrazo(activo?: boolean): string {
  return activo ? "var(--ladder-flujo)" : TRAZO;
}

/** Cable horizontal de borde a borde a la altura del centro. */
function CableBase({ x, y, w, h, stroke = TRAZO }: { x: number; y: number; w: number; h: number; stroke?: string }) {
  const midY = y + h / 2;
  return <line x1={x} y1={midY} x2={x + w} y2={midY} stroke={stroke} strokeWidth={2} />;
}

/** Etiqueta de la variable, centrada sobre el símbolo. */
function EtiquetaVar({ x, y, w, texto }: { x: number; y: number; w: number; texto: string }) {
  return (
    <text
      x={x + w / 2}
      y={y + 14}
      textAnchor="middle"
      fill={TEXTO_VAR}
      fontSize={11}
      fontFamily="'Cascadia Code','Consolas',monospace"
    >
      {texto || "?"}
    </text>
  );
}

function ContactoNA({ x, y, w, h, variable, activo }: SimboloProps) {
  const midY = y + h / 2;
  const cx = x + w / 2;
  const trazo = colorTrazo(activo);
  return (
    <>
      <CableBase x={x} y={y} w={w} h={h} stroke={trazo} />
      {/* dos barras verticales que forman el contacto abierto */}
      <line x1={cx - 8} y1={midY - 12} x2={cx - 8} y2={midY + 12} stroke={trazo} strokeWidth={2} />
      <line x1={cx + 8} y1={midY - 12} x2={cx + 8} y2={midY + 12} stroke={trazo} strokeWidth={2} />
      <EtiquetaVar x={x} y={y} w={w} texto={variable} />
    </>
  );
}

function ContactoNC({ x, y, w, h, variable, activo }: SimboloProps) {
  const midY = y + h / 2;
  const cx = x + w / 2;
  const trazo = colorTrazo(activo);
  return (
    <>
      <CableBase x={x} y={y} w={w} h={h} stroke={trazo} />
      <line x1={cx - 8} y1={midY - 12} x2={cx - 8} y2={midY + 12} stroke={trazo} strokeWidth={2} />
      <line x1={cx + 8} y1={midY - 12} x2={cx + 8} y2={midY + 12} stroke={trazo} strokeWidth={2} />
      {/* diagonal que marca "normalmente cerrado" */}
      <line x1={cx - 9} y1={midY + 12} x2={cx + 9} y2={midY - 12} stroke={trazo} strokeWidth={2} />
      <EtiquetaVar x={x} y={y} w={w} texto={variable} />
    </>
  );
}

/** Bobina genérica: dos arcos "( )" con una letra/marca opcional en el centro. */
function bobina(props: SimboloProps, marca?: string, slash?: boolean) {
  const { x, y, w, h, variable, activo } = props;
  const midY = y + h / 2;
  const cx = x + w / 2;
  const r = 12;
  const trazo = colorTrazo(activo);
  return (
    <>
      <line x1={x} y1={midY} x2={cx - r} y2={midY} stroke={trazo} strokeWidth={2} />
      <line x1={cx + r} y1={midY} x2={x + w} y2={midY} stroke={trazo} strokeWidth={2} />
      {/* arco izquierdo "(" */}
      <path
        d={`M ${cx - r} ${midY - 14} A ${r} 14 0 0 0 ${cx - r} ${midY + 14}`}
        fill="none"
        stroke={trazo}
        strokeWidth={2}
      />
      {/* arco derecho ")" */}
      <path
        d={`M ${cx + r} ${midY - 14} A ${r} 14 0 0 1 ${cx + r} ${midY + 14}`}
        fill="none"
        stroke={trazo}
        strokeWidth={2}
      />
      {marca && (
        <text x={cx} y={midY + 4} textAnchor="middle" fill={TEXTO} fontSize={11} fontWeight={700}>
          {marca}
        </text>
      )}
      {slash && (
        <line x1={cx - 9} y1={midY + 12} x2={cx + 9} y2={midY - 12} stroke={trazo} strokeWidth={2} />
      )}
      <EtiquetaVar x={x} y={y} w={w} texto={variable} />
    </>
  );
}

/** Iconito decorativo (reloj para TON, contador para CTU) centrado en la caja. */
function IconoBloque({ cx, cy, tipo }: { cx: number; cy: number; tipo: "ton" | "ctu" }) {
  if (tipo === "ton") {
    return (
      <g stroke="var(--ladder-text-dim)" strokeWidth={1} fill="none">
        <circle cx={cx} cy={cy} r={7} />
        <line x1={cx} y1={cy} x2={cx} y2={cy - 4} />
        <line x1={cx} y1={cy} x2={cx + 3} y2={cy + 2} />
      </g>
    );
  }
  return (
    <g stroke="var(--ladder-text-dim)" strokeWidth={1} fill="none">
      <path d={`M ${cx - 5} ${cy + 5} L ${cx - 5} ${cy - 5} L ${cx} ${cy + 5} L ${cx} ${cy - 5} L ${cx + 5} ${cy + 5} L ${cx + 5} ${cy - 5}`} />
    </g>
  );
}

/** Caja (px absolutos) de un pin editable inline, para posicionar su overlay. */
export interface CampoBloque {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Geometría de los pines editables (PT/PV izq., ET/CV der., Reset solo CTU) de
 *  un bloque TON/CTU. DEBE coincidir con las coordenadas que usa `bloque()` al
 *  dibujar sus valores, para que el input inline (foreignObject) quede exactamente
 *  sobre el texto que reemplaza. Se exporta para que LadderRung.tsx pueda dibujar
 *  las áreas clicables + overlays de edición sin duplicar el layout del bloque. */
export function camposBloque(tipo: "ton" | "ctu", x: number, y: number, w: number, h: number = CELDA_H): {
  izq: CampoBloque;
  der: CampoBloque;
  reset?: CampoBloque;
} {
  const bx = x + 26;
  const bw = w - 46;
  const by = y + 16;
  const bh = h - 20;
  const bxr = bx + bw;
  const yPin = by + bh - 8;

  const izq: CampoBloque = { x, y: yPin - 12, w: bx - x - 2, h: 15 };
  const der: CampoBloque = { x: bxr + 9, y: yPin - 12, w: x + w - (bxr + 9), h: 15 };
  if (tipo !== "ctu") return { izq, der };

  const cx = (bx + bxr) / 2;
  const reset: CampoBloque = { x: cx - 24, y: by + bh + 1, w: 48, h: 14 };
  return { izq, der, reset };
}

/**
 * Bloque funcional con estado (TON/CTU) estilo CODESYS. Ocupa 2 columnas.
 *  - Nombre de instancia (variable/Q) arriba, editable inline (EtiquetaVar).
 *  - IN a la izquierda y Q a la derecha, sobre la línea de flujo (midY) → conectan
 *    directo a los rieles/contactos vecinos sin espacio muerto.
 *  - PT/PV como pin inferior IZQUIERDO con su valor; ET/CV como pin inferior DERECHO.
 *  - Reset (solo CTU) como pin inferior central.
 *  Todos los valores son editables inline (ver `camposBloque` + overlays en
 *  LadderRung.tsx); aquí solo se dibuja el texto estático cuando NO se edita.
 */
function bloque(props: SimboloProps, tipo: "ton" | "ctu") {
  const { x, y, w, h, variable } = props;
  const midY = y + h / 2; // línea de flujo IN→Q (coincide con el cable del riel)
  const bx = x + 26;
  const bw = w - 46;
  const by = y + 16;
  const bh = h - 20;
  const bxr = bx + bw;
  const titulo = tipo === "ton" ? "TON" : "CTU";
  const paramIzq = tipo === "ton" ? "PT" : "PV";
  const salDer = tipo === "ton" ? "ET" : "CV";
  const valorIzq =
    tipo === "ton"
      ? props.ptMs != null
        ? `${props.ptMs}ms`
        : "?"
      : props.pv != null
        ? String(props.pv)
        : "?";
  const valorDer = (tipo === "ton" ? props.etVar : props.cvVar) || "";
  const yPin = by + bh - 8; // altura de los pines PT/ET (parte baja de la caja)
  const trazo = colorTrazo(props.activo);

  return (
    <>
      {/* Flujo principal IN→Q sobre la línea del riel */}
      <line x1={x} y1={midY} x2={bx} y2={midY} stroke={trazo} strokeWidth={2} />
      <line x1={bxr} y1={midY} x2={x + w} y2={midY} stroke={trazo} strokeWidth={2} />
      <rect x={bx} y={by} width={bw} height={bh} rx={4} fill="var(--ladder-block)" stroke={trazo} strokeWidth={2} />

      {/* Nombre de instancia arriba (editable inline) */}
      <EtiquetaVar x={x} y={y} w={w} texto={variable} />

      {/* Tipo + pines IN/Q */}
      <text x={bx + 4} y={by + 12} fill={TEXTO} fontSize={10} fontWeight={700}>
        {titulo}
      </text>
      <text x={bx + 4} y={midY + 3} fill="var(--ladder-text-dim)" fontSize={9}>
        IN
      </text>
      <text x={bxr - 4} y={midY + 3} textAnchor="end" fill="var(--ladder-text-dim)" fontSize={9}>
        Q
      </text>

      <IconoBloque cx={(bx + bxr) / 2} cy={midY + 2} tipo={tipo} />

      {/* Pin PT/PV (inferior izquierdo) con su valor y stub de entrada */}
      <line x1={bx - 10} y1={yPin} x2={bx} y2={yPin} stroke={TRAZO} strokeWidth={1.5} />
      <text x={bx + 3} y={yPin + 3} fill="var(--ladder-text-dim)" fontSize={8}>
        {paramIzq}
      </text>
      <text x={x + 2} y={yPin - 3} fill={TEXTO_VAR} fontSize={9} fontFamily="'Cascadia Code','Consolas',monospace">
        {valorIzq}
      </text>

      {/* Pin ET/CV (inferior derecho) con su variable y stub de salida */}
      <line x1={bxr} y1={yPin} x2={bxr + 10} y2={yPin} stroke={TRAZO} strokeWidth={1.5} />
      <text x={bxr - 3} y={yPin + 3} textAnchor="end" fill="var(--ladder-text-dim)" fontSize={8}>
        {salDer}
      </text>
      {valorDer && (
        <text x={bxr + 12} y={yPin - 3} fill={TEXTO_VAR} fontSize={9} fontFamily="'Cascadia Code','Consolas',monospace">
          {valorDer}
        </text>
      )}

      {/* Pin Reset (solo CTU), inferior central. Opcional: vacío = sin reset. */}
      {tipo === "ctu" && (
        <>
          <line x1={(bx + bxr) / 2} y1={by + bh} x2={(bx + bxr) / 2} y2={by + bh + 6} stroke={TRAZO} strokeWidth={1.5} />
          <text x={(bx + bxr) / 2 - 26} y={by + bh + 6} fill="var(--ladder-text-dim)" fontSize={8}>
            R
          </text>
          <text
            x={(bx + bxr) / 2}
            y={by + bh + 13}
            textAnchor="middle"
            fill={props.resetVar ? TEXTO_VAR : "var(--ladder-text-dim)"}
            fontSize={9}
            fontFamily="'Cascadia Code','Consolas',monospace"
          >
            {props.resetVar || "—"}
          </text>
        </>
      )}
    </>
  );
}

/** Despacha el símbolo SVG correcto para un tipo de elemento. */
export function ElementoSVG(props: SimboloProps & { tipo: TipoElemento }) {
  switch (props.tipo) {
    case "contacto_na":
      return <ContactoNA {...props} />;
    case "contacto_nc":
      return <ContactoNC {...props} />;
    case "bobina":
      return bobina(props);
    case "bobina_negada":
      return bobina(props, undefined, true);
    case "bobina_set":
      return bobina(props, "S");
    case "bobina_reset":
      return bobina(props, "R");
    case "ton":
      return bloque(props, "ton");
    case "ctu":
      return bloque(props, "ctu");
    default:
      return null;
  }
}

export { CELDA_W, CELDA_H };
