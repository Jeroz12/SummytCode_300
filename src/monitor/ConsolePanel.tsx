import type { ConsoleMessage } from "../shared/types";

interface Props {
  messages: ConsoleMessage[];
  open: boolean;
  onToggle: () => void;
  onClear: () => void;
}

const ICONO: Record<ConsoleMessage["tipo"], string> = {
  success: "✔",
  info: "ℹ",
  warning: "⚠",
  error: "✖",
};

/**
 * Panel inferior de consola: lista de mensajes con timestamp, ícono y color por
 * tipo. Colapsable mediante el chevron de la barra.
 */
export function ConsolePanel({ messages, open, onToggle, onClear }: Props) {
  return (
    <div className={`console ${open ? "" : "console--collapsed"}`}>
      <div className="console__bar">
        <button
          className="icon-btn"
          onClick={onToggle}
          title={open ? "Colapsar consola" : "Expandir consola"}
          aria-label={open ? "Colapsar consola" : "Expandir consola"}
        >
          {open ? "▼" : "▲"}
        </button>
        <span className="console__title">Consola</span>
        <div className="console__actions">
          <button className="icon-btn" onClick={onClear} title="Limpiar consola">
            Limpiar
          </button>
        </div>
      </div>

      {open && (
        <div className="console__body">
          {messages.map((m) => (
            <div key={m.id} className={`console__row console__row--${m.tipo}`}>
              <span className="console__text">{ICONO[m.tipo]}</span>
              <span className="console__ts">[{m.timestamp}]</span>
              <span className="console__text">{m.texto}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
