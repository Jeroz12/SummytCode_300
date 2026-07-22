import { useEffect, useState } from "react";
import type { BoardDefinition } from "../shared/types";
import { getBoards, getSerialPorts } from "../renderer/api/tauriApi";

interface Props {
  /** Dispara el pipeline ST → AST → C → guardar en disco → avr-gcc. Recibe el puerto elegido. */
  onCompilar: (puerto: string) => void;
  /** True mientras la compilación (C + avr-gcc) está en curso. */
  compilando: boolean;
  /** Dispara el flasheo del .hex ya compilado vía avrdude. Recibe el puerto elegido. */
  onFlashear: (puerto: string) => void;
  /** True mientras avrdude está flasheando. */
  flasheando: boolean;
  /** True cuando ya existe un .hex compilado listo para flashear. */
  firmwareListo: boolean;
}

/**
 * Barra inferior de acciones. "Compilar" ejecuta el pipeline real (ST→AST→C→avr-gcc).
 * "Flashear" se habilita solo tras una compilación exitosa. "Monitorear" sigue
 * deshabilitado (fase futura).
 */
export function Toolbar({ onCompilar, compilando, onFlashear, flasheando, firmwareListo }: Props) {
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
        className={`btn btn--primary ${compilando || flasheando ? "btn--disabled" : ""}`}
        onClick={() => onCompilar(puerto)}
        disabled={compilando || flasheando}
        title={compilando ? "Compilando…" : "Genera el código C y compila el firmware con avr-gcc"}
      >
        {compilando ? "⏳ Compilando…" : "▶ Compilar"}
      </button>
      <button
        className={`btn ${firmwareListo && !flasheando && !compilando ? "" : "btn--disabled"}`}
        onClick={() => onFlashear(puerto)}
        disabled={!firmwareListo || flasheando || compilando}
        title={
          !firmwareListo
            ? "Compila primero para habilitar el flasheo"
            : flasheando
              ? "Flasheando…"
              : "Flashea el firmware compilado al Arduino Uno"
        }
      >
        {flasheando ? "⏳ Flasheando…" : "⬆ Flashear"}
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
