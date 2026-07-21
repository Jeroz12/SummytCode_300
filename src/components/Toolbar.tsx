import { useEffect, useState } from "react";
import type { BoardDefinition } from "../shared/types";
import { getBoards, getSerialPorts } from "../renderer/api/tauriApi";

/**
 * Barra inferior de acciones. Los botones Compilar/Flashear/Monitorear están
 * deshabilitados visualmente hasta que exista el pipeline de compilación/flasheo.
 */
export function Toolbar() {
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
      <button className="btn btn--primary btn--disabled" title="Disponible próximamente" disabled>
        ▶ Compilar
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
