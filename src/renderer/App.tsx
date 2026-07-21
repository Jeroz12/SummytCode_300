import { useCallback, useState } from "react";
import { STEditor } from "../editors/st/STEditor";
import { LadderEditor } from "../editors/ladder/LadderEditor";
import { ProjectPanel } from "../project/ProjectPanel";
import { VariablesPanel } from "../components/VariablesPanel";
import { ConsolePanel } from "../monitor/ConsolePanel";
import { Toolbar } from "../components/Toolbar";
import type { ConsoleMessage } from "../shared/types";

type Tab = "ladder" | "st" | "fbd";

const MENU_ITEMS = ["Archivo", "Editar", "Ver", "Programa", "Comunicación", "Ayuda"];

const MENSAJES_INICIALES: ConsoleMessage[] = [
  { id: "init-1", timestamp: "00:00:00", tipo: "success", texto: "PLC IDE iniciado correctamente" },
  { id: "init-2", timestamp: "00:00:00", tipo: "info", texto: "Target: Arduino Uno | Puerto: COM3" },
];

/** HH:MM:SS de la hora local actual. */
function horaActual(): string {
  return new Date().toLocaleTimeString("es", { hour12: false });
}

function nuevoId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function App() {
  const [tab, setTab] = useState<Tab>("st");
  const [messages, setMessages] = useState<ConsoleMessage[]>(MENSAJES_INICIALES);
  const [consoleOpen, setConsoleOpen] = useState(true);

  const log = useCallback((tipo: ConsoleMessage["tipo"], texto: string) => {
    setMessages((prev) => [...prev, { id: nuevoId(), timestamp: horaActual(), tipo, texto }]);
  }, []);

  const limpiarConsola = useCallback(() => setMessages([]), []);

  return (
    <div className="app">
      {/* Menubar */}
      <div className="menubar">
        {MENU_ITEMS.map((item) => (
          <div key={item} className="menubar__item">
            {item}
          </div>
        ))}
        <div className="menubar__brand">PLC IDE — Agrupación v0.1</div>
      </div>

      {/* Cuerpo: izquierda | centro | derecha */}
      <div className="body">
        <ProjectPanel />

        <section className="center">
          <div className="tabs">
            <button
              className={`tab ${tab === "ladder" ? "tab--active" : ""}`}
              onClick={() => setTab("ladder")}
            >
              Ladder
            </button>
            <button
              className={`tab ${tab === "st" ? "tab--active" : ""}`}
              onClick={() => setTab("st")}
            >
              ST
            </button>
            <button className="tab tab--disabled" title="Disponible próximamente" disabled>
              FBD
            </button>
          </div>

          <div className="editor-area">
            {tab === "st" && <STEditor onLog={log} />}
            {tab === "ladder" && <LadderEditor />}
          </div>
        </section>

        <VariablesPanel />
      </div>

      {/* Consola inferior (colapsable) */}
      <ConsolePanel
        messages={messages}
        open={consoleOpen}
        onToggle={() => setConsoleOpen((o) => !o)}
        onClear={limpiarConsola}
      />

      {/* Toolbar inferior */}
      <Toolbar />
    </div>
  );
}
