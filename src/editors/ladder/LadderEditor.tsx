/**
 * Editor Ladder visual (canvas SVG), modelo de ÁRBOL recursivo.
 *
 * Componente CONTROLADO: el `ProgramaArbol` vive en App.tsx (para persistencia
 * .plcproj y compilación). Aquí solo vive el estado efímero de UI (herramienta
 * activa, nodo seleccionado por RUTA, edición inline) y el despacho de las 6
 * operaciones de edición del árbol (network_tree), todas puras e inmutables.
 *
 * Interacción:
 *  - CURSOR (herramienta = null): clic sobre un elemento lo selecciona (✗ para
 *    borrar; Delete también). Clic en el nodo ● de apertura de un paralelo lo
 *    selecciona y muestra "+ Camino paralelo". Doble clic = edición de variable.
 *  - Elemento activo: clic en una celda vacía lo COLOCA.
 *  - Bifurcar activo: clic en CUALQUIER nodo abre una rama paralela ahí.
 */
import { useEffect, useMemo, useState } from "react";
import type {
  ElementoLadder,
  ProgramaArbol,
  RedContactos,
  RungArbol,
  TipoElemento,
} from "./types_canvas";
import {
  agregarCaminoParalelo,
  bifurcar,
  colocarElemento,
  eliminarCamino,
  eliminarElemento,
  obtenerNodo,
  parsearEntero,
  parsearTiempoMs,
  rungArbolVacio,
} from "./types_canvas";
import { normalizarPrograma, normalizarRed } from "./normalize";
import { LadderToolbar } from "./LadderToolbar";
import { LadderCanvas } from "./LadderCanvas";
import type { RutaRef, CampoRef } from "./LadderCanvas";
import type { Herramienta } from "./LadderRung";
import type { VariableDeclaration } from "../../shared/types";

interface Props {
  programa: ProgramaArbol;
  onChange: (programa: ProgramaArbol) => void;
  /** Variables declaradas (panel), para autocomplete en la edición inline. */
  variables: VariableDeclaration[];
}

/** Campo editable de un bloque TON/CTU (los pines, no la variable/Q). */
export type CampoBloqueId = "pt" | "et" | "pv" | "cv" | "reset";

const esBloque = (t: TipoElemento) => t === "ton" || t === "ctu";

/** Crea el ElementoLadder por defecto al colocar una herramienta. */
function elementoPorDefecto(tipo: TipoElemento): ElementoLadder {
  if (tipo === "ton") return { tipo, variable: "", parametros: { pt_ms: 1000, q_var: "" } };
  if (tipo === "ctu") return { tipo, variable: "", parametros: { pv: 1, q_var: "", reset_var: "" } };
  return { tipo, variable: "" };
}

export function LadderEditor({ programa, onChange, variables }: Props) {
  const [herramienta, setHerramienta] = useState<Herramienta>(null);
  const [rungSel, setRungSel] = useState<string | null>(programa.rungs[0]?.id ?? null);
  const [seleccion, setSeleccion] = useState<RutaRef>(null);
  const [editandoVar, setEditandoVar] = useState<RutaRef>(null);
  const [editandoCampo, setEditandoCampo] = useState<CampoRef>(null);

  // El árbol se normaliza (append-slots) para render Y para que las rutas del
  // layout coincidan con el árbol sobre el que operan las ediciones.
  const prog = useMemo(() => normalizarPrograma(programa), [programa]);

  /** Aplica una transformación pura a la red de un rung y emite el cambio (normalizado). */
  const actualizarRed = (rungId: string, fn: (red: RedContactos) => RedContactos) => {
    onChange({
      rungs: prog.rungs.map((r) =>
        r.id === rungId ? { ...r, red: normalizarRed(fn(r.red)) } : r
      ),
    });
  };

  const redDe = (rungId: string): RedContactos | null =>
    prog.rungs.find((r) => r.id === rungId)?.red ?? null;

  // ── Colocar / bifurcar ─────────────────────────────────────────────────────
  const handleColocar = (rungId: string, ruta: number[]) => {
    setRungSel(rungId);
    if (!herramienta || herramienta === "bifurcar") return;
    actualizarRed(rungId, (red) => colocarElemento(red, ruta, elementoPorDefecto(herramienta)));
    setEditandoCampo(null);
    setEditandoVar({ rungId, ruta }); // edición inline inmediata de la variable/Q
  };

  const handleBifurcar = (rungId: string, ruta: number[]) => {
    setRungSel(rungId);
    actualizarRed(rungId, (red) => bifurcar(red, ruta));
    setSeleccion(null);
  };

  // ── Selección ──────────────────────────────────────────────────────────────
  const handleSeleccionarNodo = (rungId: string, ruta: number[]) => {
    setRungSel(rungId);
    setSeleccion({ rungId, ruta });
  };

  // ── Edición inline de variable ─────────────────────────────────────────────
  const handleEditarVar = (rungId: string, ruta: number[]) => {
    setEditandoCampo(null);
    setEditandoVar({ rungId, ruta });
  };

  const handleCommitVar = (rungId: string, ruta: number[], valor: string) => {
    actualizarRed(rungId, (red) => {
      const nodo = obtenerNodo(red, ruta);
      if (nodo.tipo !== "elemento") return red;
      const el = nodo.elemento;
      // En bloques la variable inline es la salida Q; se refleja en parámetros.
      const parametros = esBloque(el.tipo) ? { ...el.parametros, q_var: valor } : el.parametros;
      return colocarElemento(red, ruta, { ...el, variable: valor, parametros });
    });
    setEditandoVar(null);
  };

  // ── Edición inline de pines de bloque (PT/ET/PV/CV/Reset) ───────────────────
  const handleEditarCampo = (rungId: string, ruta: number[], campo: CampoBloqueId) => {
    setEditandoVar(null);
    setEditandoCampo({ rungId, ruta, campo });
  };

  const handleCommitCampo = (rungId: string, ruta: number[], campo: CampoBloqueId, valor: string) => {
    actualizarRed(rungId, (red) => {
      const nodo = obtenerNodo(red, ruta);
      if (nodo.tipo !== "elemento") return red;
      const el = nodo.elemento;
      const p = el.parametros ?? {};
      const texto = valor.trim();
      const parametros =
        campo === "pt"
          ? { ...p, pt_ms: parsearTiempoMs(texto, p.pt_ms ?? 1000) }
          : campo === "et"
            ? { ...p, et_var: texto || undefined }
            : campo === "pv"
              ? { ...p, pv: parsearEntero(texto, p.pv ?? 1) }
              : campo === "cv"
                ? { ...p, cv_var: texto || undefined }
                : { ...p, reset_var: texto }; // "reset": opcional, puede quedar vacío
      return colocarElemento(red, ruta, { ...el, parametros });
    });
    setEditandoCampo(null);
  };

  // ── Eliminar elemento / camino ─────────────────────────────────────────────
  const handleEliminar = (rungId: string, ruta: number[]) => {
    actualizarRed(rungId, (red) => eliminarElemento(red, ruta));
    setSeleccion(null);
    setEditandoVar(null);
    setEditandoCampo(null);
  };

  const handleAgregarCamino = (rungId: string, rutaParalelo: number[]) => {
    actualizarRed(rungId, (red) => agregarCaminoParalelo(red, rutaParalelo));
  };

  const handleEliminarCamino = (rungId: string, rutaParalelo: number[], indice: number) => {
    // Confirmar si el camino tiene elementos colocados.
    const red = redDe(rungId);
    if (red) {
      try {
        const paralelo = obtenerNodo(red, rutaParalelo);
        if (paralelo.tipo === "paralelo") {
          const rama = paralelo.ramas[indice];
          if (rama && ramaTieneElementos(rama) && !window.confirm("¿Eliminar este camino paralelo?")) {
            return;
          }
        }
      } catch {
        /* ruta ya inválida: seguir */
      }
    }
    actualizarRed(rungId, (r) => eliminarCamino(r, rutaParalelo, indice));
    setSeleccion(null);
  };

  // Delete / Backspace elimina el elemento seleccionado (salvo mientras se edita
  // texto en un input).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (!seleccion || editandoVar || editandoCampo) return;
      const tag = (document.activeElement?.tagName ?? "").toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      // Solo borra si la ruta apunta a un elemento (no a un paralelo seleccionado).
      const red = redDe(seleccion.rungId);
      if (!red) return;
      try {
        if (obtenerNodo(red, seleccion.ruta).tipo !== "elemento") return;
      } catch {
        return;
      }
      e.preventDefault();
      handleEliminar(seleccion.rungId, seleccion.ruta);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seleccion, editandoVar, editandoCampo, prog]);

  // ── Rungs ──────────────────────────────────────────────────────────────────
  const handleAgregarRung = () => {
    const nums = prog.rungs.map((r) => Number(r.id)).filter((n) => Number.isInteger(n));
    const nuevoId = String((nums.length ? Math.max(...nums) : 0) + 1);
    onChange({ rungs: [...prog.rungs, rungArbolVacio(nuevoId)] });
    setRungSel(nuevoId);
  };

  const handleEliminarRung = (rungId: string) => {
    const rungs = prog.rungs.filter((r) => r.id !== rungId);
    onChange({ rungs });
    if (rungSel === rungId) setRungSel(rungs[0]?.id ?? null);
    if (seleccion?.rungId === rungId) setSeleccion(null);
  };

  return (
    <div className="ladder-editor">
      <LadderToolbar
        seleccionado={herramienta}
        onSeleccionar={setHerramienta}
        onAgregarRung={handleAgregarRung}
      />

      <div
        className={`ladder-editor__lienzo ${herramienta && herramienta !== "bifurcar" ? "ladder-editor__lienzo--colocando" : ""}`}
        onClick={(e) => {
          // Clic en el fondo del lienzo (no en un nodo) limpia la selección.
          if (e.target === e.currentTarget) setSeleccion(null);
        }}
      >
        <LadderCanvas
          programa={prog}
          rungSeleccionado={rungSel}
          herramienta={herramienta}
          seleccion={seleccion}
          editandoVar={editandoVar}
          editandoCampo={editandoCampo}
          onSeleccionarRung={setRungSel}
          onSeleccionarNodo={handleSeleccionarNodo}
          onColocar={handleColocar}
          onBifurcar={handleBifurcar}
          onEditarVar={handleEditarVar}
          onCommitVar={handleCommitVar}
          onCancelVar={() => setEditandoVar(null)}
          onEditarCampo={handleEditarCampo}
          onCommitCampo={handleCommitCampo}
          onCancelCampo={() => setEditandoCampo(null)}
          onEliminar={handleEliminar}
          onEliminarRung={handleEliminarRung}
          onAgregarRung={handleAgregarRung}
          onAgregarCamino={handleAgregarCamino}
          onEliminarCamino={handleEliminarCamino}
        />
      </div>

      {/* Autocompletado compartido para todos los inputs inline (variable / reset). */}
      <datalist id="ladder-vars">
        {variables.map((v) => (
          <option key={v.nombre} value={v.nombre} />
        ))}
      </datalist>
    </div>
  );
}

/** True si alguna hoja de la red es un elemento (para confirmar antes de borrar un camino). */
function ramaTieneElementos(red: RedContactos): boolean {
  if (red.tipo === "elemento") return true;
  if (red.tipo === "serie") return red.elementos.some(ramaTieneElementos);
  if (red.tipo === "paralelo") return red.ramas.some(ramaTieneElementos);
  return false;
}
