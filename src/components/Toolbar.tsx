import { useEffect, useState } from "react";
import type { BoardDefinition } from "../shared/types";
import { getBoards, getSerialPorts } from "../renderer/api/tauriApi";

interface Props {
  /** Dispara el pipeline ST → AST → C → guardar en disco. */
  onCompilar: () => void;
  /** True mientras la compilación está en curso (deshabilita el botón). */
  compilando: boolean;
}

/**
 * Barra inferior de acciones. "Compilar" ejecuta el pipeline real (ST→AST→C→disco).
 * "Flashear" y "Monitorear" siguen deshabilitados hasta que exista esa fase.
 */
export function Toolbar({ onCompilar, compilando }: Props) {
  const [puertos, setPuertos] = useState<string[]>([]);
  const [puerto, setPuerto] = useState<string>("");
  const [placas, setPlacas] = useState<BoardDefinition[]>([]);
  const [placa, setPlaca] = useState<string>("");

  useEffect(() => {
    let activo = true;
    void (async () => {
      const [ports, boards] = await Promise.all([getSerialPorts(), getBoards()]);
      if (!activo) return;
      setPuertos(ports);
      setPuerto(ports[0] ?? "");
      setPlacas(boards);
      setPlaca(boards[0]?.board_id ?? "");
    })();
    return () => {
      activo = false;
    };
  }, []);

  return (
    <div className="toolbar">
      <button
        className={`btn btn--primary ${compilando ? "btn--disabled" : ""}`}
        onClick={onCompilar}
        disabled={compilando}
        title={compilando ? "Compilando…" : "Genera el código C a partir del programa actual"}
      >
        {compilando ? "⏳ Compilando…" : "▶ Compilar"}
      </button>
      <button className="btn btn--disabled" title="Disponible próximamente" disabled>
        ⬆ Flashear
      </button>
      <button className="btn btn--disabled" title="Disponible próximamente" disabled>
        📡 Monitorear
      </button>

      <div className="toolbar__spacer" />

      <label className="field">
        Puerto:
        <select className="select" value={puerto} onChange={(e) => setPuerto(e.target.value)}>
          {puertos.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        Placa:
        <select className="select" value={placa} onChange={(e) => setPlaca(e.target.value)}>
          {placas.map((b) => (
            <option key={b.board_id} value={b.board_id}>
              {b.nombre_visible}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
