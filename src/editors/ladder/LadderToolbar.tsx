/**
 * Toolbar del editor Ladder: modo cursor + paleta de elementos + Bifurcar.
 *
 * El modo CURSOR es el modo por defecto: con él activo, los clicks SELECCIONAN
 * elementos (para resaltar/eliminar). Al elegir un elemento, los clicks en celdas
 * vacías lo COLOCAN. La herramienta "Bifurcar" abre una rama paralela sobre
 * CUALQUIER nodo (elemento o celda) donde se haga clic.
 */
import type { TipoElemento } from "./types_canvas";
import { ELEMENTOS_TOOLBAR } from "./types_canvas";
import type { Herramienta } from "./LadderRung";

interface Props {
  seleccionado: Herramienta;
  onSeleccionar: (h: Herramienta) => void;
  onAgregarRung: () => void;
}

export function LadderToolbar({ seleccionado, onSeleccionar, onAgregarRung }: Props) {
  const toggle = (t: Herramienta) => onSeleccionar(seleccionado === t ? null : t);
  return (
    <div className="ladder-toolbar">
      <div className="ladder-toolbar__group">
        {/* Modo cursor = deseleccionar la herramienta (null): clics = selección. */}
        <button
          className={`ladder-tool ${seleccionado === null ? "ladder-tool--active" : ""}`}
          title="Cursor (seleccionar / eliminar)"
          onClick={() => onSeleccionar(null)}
        >
          <span className="ladder-tool__simbolo">➤</span>
          <span className="ladder-tool__etiqueta">Cursor</span>
        </button>

        <div className="ladder-toolbar__sep" />

        {ELEMENTOS_TOOLBAR.map((meta) => (
          <button
            key={meta.tipo}
            className={`ladder-tool ${seleccionado === meta.tipo ? "ladder-tool--active" : ""}`}
            title={meta.etiqueta}
            onClick={() => toggle(meta.tipo as TipoElemento)}
          >
            <span className="ladder-tool__simbolo">{meta.simbolo}</span>
            <span className="ladder-tool__etiqueta">{meta.etiqueta}</span>
          </button>
        ))}

        <div className="ladder-toolbar__sep" />

        {/* Bifurcar: abre una rama paralela sobre el nodo clickeado. */}
        <button
          className={`ladder-tool ${seleccionado === "bifurcar" ? "ladder-tool--active" : ""}`}
          title="Bifurcar (abrir rama paralela)"
          onClick={() => toggle("bifurcar")}
        >
          <span className="ladder-tool__simbolo">⑃</span>
          <span className="ladder-tool__etiqueta">Bifurcar</span>
        </button>
      </div>

      <div className="ladder-toolbar__spacer" />

      <div className="ladder-toolbar__group">
        <button className="btn" onClick={onAgregarRung} title="Agregar un rung al final">
          + Rung
        </button>
      </div>
    </div>
  );
}
