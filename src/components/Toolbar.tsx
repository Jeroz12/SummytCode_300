import { useEffect, useState } from "react";
import type { BoardDefinition, BoardDefinitionFull, McuFamily } from "../shared/types";
import { getBoards, getSerialPorts, leerFamilia, listarBoards } from "../renderer/api/tauriApi";

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
  /**
   * Se dispara cuando el usuario elige una placa cuyo JSON real (boards/*.json)
   * se pudo cargar y su familia (mcu_families/*.json) se pudo leer. No se llama
   * si solo hay placas mock disponibles (fallback), ya que esas no traen
   * `canales_io` reales con los que generar C.
   */
  onBoardChange?: (board: BoardDefinitionFull, familia: McuFamily) => void;
  /**
   * True si la familia de la placa seleccionada tiene pipeline de compilación
   * real hoy (solo AVR). El botón "Compilar" no se deshabilita cuando es
   * `false` — se deja intentar a propósito para que el usuario vea el error
   * educativo en consola en vez de encontrarse un botón muerto sin explicación.
   */
  familiaSoportada?: boolean;
}

/**
 * Barra inferior de acciones. "Compilar" ejecuta el pipeline real (ST→AST→C→avr-gcc).
 * "Flashear" se habilita solo tras una compilación exitosa. "Monitorear" sigue
 * deshabilitado (fase futura).
 */
export function Toolbar({
  onCompilar,
  compilando,
  onFlashear,
  flasheando,
  firmwareListo,
  onBoardChange,
  familiaSoportada = true,
}: Props) {
  const [puertos, setPuertos] = useState<string[]>([]);
  const [puerto, setPuerto] = useState<string>("");
  // Placas reales leídas de boards/*.json (vacío si aún no cargaron o falló la lectura).
  const [placasReales, setPlacasReales] = useState<BoardDefinitionFull[]>([]);
  // Fallback mock (comando `get_boards`) — solo se usa si `placasReales` queda vacío.
  const [placasMock, setPlacasMock] = useState<BoardDefinition[]>([]);
  const [placa, setPlaca] = useState<string>("");

  const placas: { board_id: string; nombre_visible: string }[] =
    placasReales.length > 0 ? placasReales : placasMock;

  useEffect(() => {
    let activo = true;
    void (async () => {
      const [ports, boardsMock, boardsReales] = await Promise.all([
        getSerialPorts(),
        getBoards(),
        listarBoards().catch(() => []),
      ]);
      if (!activo) return;
      setPuertos(ports);
      setPuerto(ports[0] ?? "");
      setPlacasMock(boardsMock);
      setPlacasReales(boardsReales);

      const lista = boardsReales.length > 0 ? boardsReales : boardsMock;
      // Arduino Uno como selección por defecto si está disponible.
      const porDefecto = lista.find((b) => b.board_id === "arduino_uno") ?? lista[0];
      setPlaca(porDefecto?.board_id ?? "");

      if (boardsReales.length > 0 && porDefecto) {
        const board = boardsReales.find((b) => b.board_id === porDefecto.board_id);
        if (board) {
          try {
            const familia = await leerFamilia(board.hereda_de);
            if (activo) onBoardChange?.(board, familia);
          } catch {
            // Sin familia legible: se deja sin seleccionar boards reales (compilar fallará con mensaje claro).
          }
        }
      }
    })();
    return () => {
      activo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCambiarPlaca = async (boardId: string) => {
    setPlaca(boardId);
    const board = placasReales.find((b) => b.board_id === boardId);
    if (!board) return; // solo hay mock disponible: nada que emitir
    try {
      const familia = await leerFamilia(board.hereda_de);
      onBoardChange?.(board, familia);
    } catch {
      // familia no encontrada: se ignora, el usuario verá el error real al compilar
    }
  };

  return (
    <div className="toolbar">
      <button
        className={`btn btn--primary ${compilando || flasheando ? "btn--disabled" : ""}`}
        onClick={() => onCompilar(puerto)}
        disabled={compilando || flasheando}
        title={
          compilando
            ? "Compilando…"
            : !familiaSoportada
              ? "Esta familia de MCU no está disponible aún"
              : "Genera el código C y compila el firmware con avr-gcc"
        }
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
        <select
          className="select"
          value={placa}
          onChange={(e) => void handleCambiarPlaca(e.target.value)}
        >
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
