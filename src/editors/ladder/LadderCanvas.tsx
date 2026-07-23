/**
 * Lienzo Ladder: apila los rungs del programa (árbol). Cada rung se dibuja con
 * LadderRung. El estado vive en LadderEditor (componente controlado); este
 * componente reparte props y "acota" selección/edición al rung dueño.
 */
import type { ProgramaArbol } from "./types_canvas";
import type { CampoBloqueId } from "./LadderEditor";
import type { Herramienta } from "./LadderRung";
import { LadderRung } from "./LadderRung";

/** Referencia a un nodo (ruta) dentro de un rung concreto. */
export type RutaRef = { rungId: string; ruta: number[] } | null;
export type CampoRef = { rungId: string; ruta: number[]; campo: CampoBloqueId } | null;

interface Props {
  programa: ProgramaArbol;
  rungSeleccionado: string | null;
  herramienta: Herramienta;
  seleccion: RutaRef;
  editandoVar: RutaRef;
  editandoCampo: CampoRef;
  onSeleccionarRung: (id: string) => void;
  onSeleccionarNodo: (rungId: string, ruta: number[]) => void;
  onColocar: (rungId: string, ruta: number[]) => void;
  onBifurcar: (rungId: string, ruta: number[]) => void;
  onEditarVar: (rungId: string, ruta: number[]) => void;
  onCommitVar: (rungId: string, ruta: number[], valor: string) => void;
  onCancelVar: () => void;
  onEditarCampo: (rungId: string, ruta: number[], campo: CampoBloqueId) => void;
  onCommitCampo: (rungId: string, ruta: number[], campo: CampoBloqueId, valor: string) => void;
  onCancelCampo: () => void;
  onEliminar: (rungId: string, ruta: number[]) => void;
  onEliminarRung: (rungId: string) => void;
  onAgregarRung: () => void;
  onAgregarCamino: (rungId: string, rutaParalelo: number[]) => void;
  onEliminarCamino: (rungId: string, rutaParalelo: number[], indice: number) => void;
}

export function LadderCanvas({
  programa,
  rungSeleccionado,
  herramienta,
  seleccion,
  editandoVar,
  editandoCampo,
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
  onAgregarRung,
  onAgregarCamino,
  onEliminarCamino,
}: Props) {
  const rutaScope = (ref: RutaRef, rungId: string) => (ref && ref.rungId === rungId ? ref.ruta : null);
  const campoScope = (rungId: string) =>
    editandoCampo && editandoCampo.rungId === rungId
      ? { ruta: editandoCampo.ruta, campo: editandoCampo.campo }
      : null;

  return (
    <div className="ladder-canvas">
      {programa.rungs.length === 0 && (
        <div className="ladder-canvas__vacio">
          Sin rungs. Usa <strong>+ Rung</strong> para agregar el primero.
        </div>
      )}

      {programa.rungs.map((rung) => (
        <LadderRung
          key={rung.id}
          rung={rung}
          seleccionado={rungSeleccionado === rung.id}
          herramienta={herramienta}
          seleccion={rutaScope(seleccion, rung.id)}
          editandoVar={rutaScope(editandoVar, rung.id)}
          editandoCampo={campoScope(rung.id)}
          onSeleccionarRung={() => onSeleccionarRung(rung.id)}
          onSeleccionarNodo={(ruta) => onSeleccionarNodo(rung.id, ruta)}
          onColocar={(ruta) => onColocar(rung.id, ruta)}
          onBifurcar={(ruta) => onBifurcar(rung.id, ruta)}
          onEditarVar={(ruta) => onEditarVar(rung.id, ruta)}
          onCommitVar={(ruta, valor) => onCommitVar(rung.id, ruta, valor)}
          onCancelVar={onCancelVar}
          onEditarCampo={(ruta, campo) => onEditarCampo(rung.id, ruta, campo)}
          onCommitCampo={(ruta, campo, valor) => onCommitCampo(rung.id, ruta, campo, valor)}
          onCancelCampo={onCancelCampo}
          onEliminar={(ruta) => onEliminar(rung.id, ruta)}
          onEliminarRung={() => onEliminarRung(rung.id)}
          onAgregarCamino={(ruta) => onAgregarCamino(rung.id, ruta)}
          onEliminarCamino={(ruta, indice) => onEliminarCamino(rung.id, ruta, indice)}
        />
      ))}

      <button className="btn-ghost ladder-canvas__add" onClick={onAgregarRung}>
        + Agregar Rung
      </button>
    </div>
  );
}
