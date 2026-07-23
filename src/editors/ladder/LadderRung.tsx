/**
 * Renderiza UN rung como SVG a partir de su ÁRBOL de contactos (RedContactos).
 * Todo el posicionamiento sale de `layoutRed` (layout.ts), que devuelve cada
 * nodo hoja con su RUTA — el hit-testing es "¿qué rectángulo contiene el click?".
 *
 *  - Rieles verticales (bus bars) izq/der; el árbol se dibuja entre ellos.
 *  - Cables: los segmentos que devuelve `layoutRed` (serie horizontal + los
 *    conectores verticales/horizontales de cada paralelo).
 *  - Nodos ● de apertura/cierre de cada paralelo; ✗ por camino; "+ Camino" al
 *    seleccionar el nodo de apertura de un paralelo en modo cursor.
 *  - Selección (modo cursor): clic resalta un elemento y muestra ✗; Delete o ✗
 *    lo eliminan. Doble clic edita la variable inline. TON/CTU: pines inline.
 */
import { useState } from "react";
import type { CampoBloqueId } from "./LadderEditor";
import type { ElementoLadder, RungArbol } from "./types_canvas";
import { RIEL_PAD, formatearTiempoMs, ocupaDosColumnas } from "./types_canvas";
import { layoutRed, medir } from "./layout";
import type { NodoPosicionado } from "./layout";
import { camposBloque, ElementoSVG } from "./elements/LadderElements";
import { InlineVarInput } from "./InlineControls";

const TOP_PAD = 18;

export type Herramienta =
  | "contacto_na"
  | "contacto_nc"
  | "bobina"
  | "bobina_negada"
  | "bobina_set"
  | "bobina_reset"
  | "ton"
  | "ctu"
  | "bifurcar"
  | null;

interface Props {
  rung: RungArbol;
  seleccionado: boolean;
  herramienta: Herramienta;
  /** Ruta seleccionada dentro de ESTE rung (o null). */
  seleccion: number[] | null;
  onSeleccionarRung: () => void;
  onSeleccionarNodo: (ruta: number[]) => void;
  onColocar: (ruta: number[]) => void;
  onBifurcar: (ruta: number[]) => void;
  onEditarVar: (ruta: number[]) => void;
  onCommitVar: (ruta: number[], valor: string) => void;
  onCancelVar: () => void;
  onEditarCampo: (ruta: number[], campo: CampoBloqueId) => void;
  onCommitCampo: (ruta: number[], campo: CampoBloqueId, valor: string) => void;
  onCancelCampo: () => void;
  onEliminar: (ruta: number[]) => void;
  onEliminarRung: () => void;
  onAgregarCamino: (rutaParalelo: number[]) => void;
  onEliminarCamino: (rutaParalelo: number[], indice: number) => void;
  editandoVar: number[] | null;
  editandoCampo: { ruta: number[]; campo: CampoBloqueId } | null;
}

const claveRuta = (r: number[]) => (r.length === 0 ? "raiz" : r.join("-"));
const rutaIgual = (a: number[] | null, b: number[] | null): boolean =>
  a != null && b != null && a.length === b.length && a.every((v, i) => v === b[i]);

/** Valor de texto actual de un campo de bloque, para precargar su input inline. */
function valorCampo(
  tipo: "ton" | "ctu",
  campo: CampoBloqueId,
  p: ElementoLadder["parametros"]
): string {
  const params = p ?? {};
  if (campo === "pt") return formatearTiempoMs(params.pt_ms ?? 1000);
  if (campo === "et") return params.et_var ?? "";
  if (campo === "pv") return String(params.pv ?? 1);
  if (campo === "cv") return params.cv_var ?? "";
  return params.reset_var ?? "";
}

export function LadderRung({
  rung,
  seleccionado,
  herramienta,
  seleccion,
  onSeleccionarRung,
  onSeleccionarNodo,
  onColocar,
  onBifurcar,
  onEditarVar,
  onCommitVar,
  onCancelVar,
  onEditarCampo,
  onCommitCampo,
  onCancelCampo,
  onEliminar,
  onEliminarRung,
  onAgregarCamino,
  onEliminarCamino,
  editandoVar,
  editandoCampo,
}: Props) {
  const [colapsado, setColapsado] = useState(false);

  const { ancho, alto } = medir(rung.red);
  const layout = layoutRed(rung.red, RIEL_PAD, TOP_PAD);
  const leftRailX = RIEL_PAD;
  const rightRailX = RIEL_PAD + ancho;
  const svgW = rightRailX + RIEL_PAD;
  const svgH = TOP_PAD * 2 + alto;
  const railTop = TOP_PAD;
  const railBottom = TOP_PAD + alto;

  const herramientaActiva = herramienta !== null;
  const colocando = herramientaActiva && herramienta !== "bifurcar";

  // Conteos para el resumen colapsado.
  const nElementos = layout.nodos.filter((n) => n.ref.tipo === "elemento").length;
  const nParalelos = layout.paralelos.length;

  /** Click sobre un nodo hoja: coloca / bifurca / selecciona según la herramienta. */
  const clickNodo = (n: NodoPosicionado, e: React.MouseEvent) => {
    e.stopPropagation();
    if (herramienta === "bifurcar") {
      onBifurcar(n.ruta);
      return;
    }
    if (colocando) {
      if (n.ref.tipo === "vacio") onColocar(n.ruta);
      return;
    }
    // Cursor: seleccionar si es un elemento; sobre una celda vacía, nada.
    if (n.ref.tipo === "elemento") onSeleccionarNodo(n.ruta);
  };

  /** ✗ flotante centrado sobre un elemento seleccionado. */
  const BotonBorrar = ({ cx, cy, ruta }: { cx: number; cy: number; ruta: number[] }) => (
    <g
      className="ladder-del-flotante"
      onClick={(e) => {
        e.stopPropagation();
        onEliminar(ruta);
      }}
    >
      <circle cx={cx} cy={cy} r={9} />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize={12}>
        ✗
      </text>
    </g>
  );

  /** Overlay clicable + input inline para un pin de bloque (PT/ET/PV/CV/Reset). */
  const CampoInline = ({
    caja,
    ruta,
    campo,
    valorActual,
  }: {
    caja: { x: number; y: number; w: number; h: number };
    ruta: number[];
    campo: CampoBloqueId;
    valorActual: string;
  }) => {
    const editando = editandoCampo != null && rutaIgual(editandoCampo.ruta, ruta) && editandoCampo.campo === campo;
    return (
      <>
        <rect
          x={caja.x}
          y={caja.y}
          width={caja.w}
          height={caja.h}
          fill="transparent"
          className="ladder-campo-hit"
          onClick={(e) => {
            e.stopPropagation();
            if (herramientaActiva) return;
            onEditarCampo(ruta, campo);
          }}
        />
        {editando && (
          <foreignObject x={caja.x} y={caja.y} width={caja.w} height={caja.h}>
            <InlineVarInput
              valor={valorActual}
              onCommit={(valor) => onCommitCampo(ruta, campo, valor)}
              onCancel={onCancelCampo}
            />
          </foreignObject>
        )}
      </>
    );
  };

  return (
    <div
      className={`ladder-rung ${seleccionado ? "ladder-rung--sel" : ""}`}
      onMouseDown={onSeleccionarRung}
    >
      <div className="ladder-rung__header">
        <button
          className="ladder-rung__toggle"
          onClick={(e) => {
            e.stopPropagation();
            setColapsado(!colapsado);
          }}
          title={colapsado ? "Expandir rung" : "Colapsar rung"}
        >
          {colapsado ? "▸" : "▾"}
        </button>
        <span className="ladder-rung__id">Rung {rung.id}</span>
        {rung.comentario && <span className="ladder-rung__comentario">{rung.comentario}</span>}
        {colapsado && (
          <span className="ladder-rung__resumen">
            {nElementos} elemento{nElementos === 1 ? "" : "s"}, {nParalelos} bifurcaci
            {nParalelos === 1 ? "ón" : "ones"}
          </span>
        )}
        <div className="ladder-rung__acciones">
          {!colapsado && (
            <span className="ladder-rung__hint">
              {herramienta === "bifurcar"
                ? "Clic en un elemento/celda para abrir una rama paralela"
                : "Coloca elementos; usa Bifurcar para ramas paralelas"}
            </span>
          )}
          <button className="btn btn--sm" onClick={onEliminarRung} title="Eliminar este rung">
            ✗ Rung
          </button>
        </div>
      </div>

      {!colapsado && (
        <div className="ladder-rung__scroll">
          <svg width={svgW} height={svgH} className="ladder-rung__svg">
            {/* Rieles verticales (bus bars) */}
            <line x1={leftRailX} y1={railTop} x2={leftRailX} y2={railBottom} stroke="var(--ladder-rail)" strokeWidth={3} />
            <line x1={rightRailX} y1={railTop} x2={rightRailX} y2={railBottom} stroke="var(--ladder-rail)" strokeWidth={3} />

            {/* Cables (segmentos calculados por layoutRed) */}
            {layout.segmentos.map((s, i) => (
              <line
                key={`seg-${i}`}
                x1={s.x1}
                y1={s.y1}
                x2={s.x2}
                y2={s.y2}
                stroke="var(--ladder-wire)"
                strokeWidth={2}
              />
            ))}

            {/* Nodos ● de apertura/cierre de cada paralelo */}
            {layout.paralelos.map((p) => {
              const sel = rutaIgual(seleccion, p.ruta);
              return (
                <g key={`par-${claveRuta(p.ruta)}`}>
                  <circle cx={p.xAbrir} cy={p.midY} r={4} className="ladder-nodo" />
                  <circle cx={p.xCerrar} cy={p.midY} r={4} className="ladder-nodo" />
                  {/* Hit-target sobre el nodo de apertura: selecciona el paralelo
                      (modo cursor) para mostrar "+ Camino paralelo". */}
                  <rect
                    x={p.xAbrir - 8}
                    y={p.midY - 10}
                    width={16}
                    height={20}
                    fill="transparent"
                    className="ladder-par-hit"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!herramientaActiva) onSeleccionarNodo(p.ruta);
                    }}
                  />
                  {sel && (
                    <rect
                      className="ladder-sel-box"
                      x={p.xAbrir - 10}
                      y={p.midY - 12}
                      width={20}
                      height={24}
                      rx={4}
                    />
                  )}
                </g>
              );
            })}

            {/* ✗ por camino de cada paralelo (elimina solo ese camino / colapsa) */}
            {layout.paralelos.flatMap((p) =>
              p.caminos.map((c) => {
                const cx = Math.max(p.xAbrir - 14, leftRailX + 10);
                return (
                  <g
                    key={`del-${claveRuta(c.ruta)}`}
                    className="ladder-del-camino"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEliminarCamino(p.ruta, c.indice);
                    }}
                  >
                    <circle cx={cx} cy={c.midY} r={7} />
                    <text x={cx} y={c.midY + 3} textAnchor="middle" fontSize={10}>
                      ✗
                    </text>
                  </g>
                );
              })
            )}

            {/* Nodos hoja: elementos y celdas vacías */}
            {layout.nodos.map((n) => {
              const x = n.x;
              const y = n.y;
              const w = n.w;
              const h = n.h;

              if (n.ref.tipo === "vacio") {
                return (
                  <g
                    key={`n-${claveRuta(n.ruta)}`}
                    className="ladder-cell ladder-cell--vacia"
                    onClick={(e) => clickNodo(n, e)}
                  >
                    <rect x={x} y={y} width={w} height={h} fill="transparent" />
                    <rect
                      x={x + 6}
                      y={y + 6}
                      width={w - 12}
                      height={h - 12}
                      rx={4}
                      className="ladder-cell__placeholder"
                    />
                  </g>
                );
              }

              if (n.ref.tipo !== "elemento") return null; // layout solo emite vacio/elemento
              const el = n.ref.elemento;
              const bloque = ocupaDosColumnas(el.tipo);
              const editando = rutaIgual(editandoVar, n.ruta);
              const sel = rutaIgual(seleccion, n.ruta);
              const campos = bloque ? camposBloque(el.tipo as "ton" | "ctu", x, y, w, h) : null;

              return (
                <g
                  key={`n-${claveRuta(n.ruta)}`}
                  className="ladder-cell ladder-cell--ocupada"
                  onClick={(e) => clickNodo(n, e)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    onEditarVar(n.ruta);
                  }}
                >
                  {sel && (
                    <rect className="ladder-sel-box" x={x + 3} y={y + 6} width={w - 6} height={h - 12} rx={4} />
                  )}
                  <rect x={x} y={y} width={w} height={h} fill="transparent" />
                  <ElementoSVG
                    tipo={el.tipo}
                    x={x}
                    y={y}
                    w={w}
                    h={h}
                    variable={el.variable}
                    ptMs={el.parametros?.pt_ms}
                    pv={el.parametros?.pv}
                    etVar={el.parametros?.et_var}
                    cvVar={el.parametros?.cv_var}
                    resetVar={el.parametros?.reset_var}
                  />
                  {editando && (
                    <foreignObject x={x + 3} y={y + 1} width={w - 6} height={18}>
                      <InlineVarInput
                        valor={el.variable}
                        onCommit={(valor) => onCommitVar(n.ruta, valor)}
                        onCancel={onCancelVar}
                      />
                    </foreignObject>
                  )}
                  {sel && !editando && <BotonBorrar cx={x + w / 2} cy={y + 4} ruta={n.ruta} />}

                  {bloque && campos && (
                    <>
                      <CampoInline
                        caja={campos.izq}
                        ruta={n.ruta}
                        campo={el.tipo === "ton" ? "pt" : "pv"}
                        valorActual={valorCampo(el.tipo as "ton" | "ctu", el.tipo === "ton" ? "pt" : "pv", el.parametros)}
                      />
                      <CampoInline
                        caja={campos.der}
                        ruta={n.ruta}
                        campo={el.tipo === "ton" ? "et" : "cv"}
                        valorActual={valorCampo(el.tipo as "ton" | "ctu", el.tipo === "ton" ? "et" : "cv", el.parametros)}
                      />
                      {campos.reset && (
                        <CampoInline
                          caja={campos.reset}
                          ruta={n.ruta}
                          campo="reset"
                          valorActual={valorCampo("ctu", "reset", el.parametros)}
                        />
                      )}
                    </>
                  )}
                </g>
              );
            })}

            {/* "+ Camino paralelo" al seleccionar el nodo de apertura de un paralelo */}
            {layout.paralelos
              .filter((p) => rutaIgual(seleccion, p.ruta))
              .map((p) => {
                const boxX = Math.max(p.xAbrir - 70, leftRailX + 4);
                return (
                  <foreignObject
                    key={`add-${claveRuta(p.ruta)}`}
                    x={boxX}
                    y={railBottom - 2}
                    width={150}
                    height={28}
                  >
                    <button
                      className="ladder-btn-camino"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAgregarCamino(p.ruta);
                      }}
                    >
                      + Camino paralelo
                    </button>
                  </foreignObject>
                );
              })}
          </svg>
        </div>
      )}
    </div>
  );
}
