import { useCallback, useState } from "react";
import { STEditor } from "../editors/st/STEditor";
import { LadderEditor } from "../editors/ladder/LadderEditor";
import { ProjectPanel } from "../project/ProjectPanel";
import { VariablesPanel } from "../components/VariablesPanel";
import { ConsolePanel } from "../monitor/ConsolePanel";
import { Toolbar } from "../components/Toolbar";
import type { ConsoleMessage, ParseResult, VariableDeclaration } from "../shared/types";
import { compilarAvr, compilarPrograma, flashearAvr, generarCodigoC } from "./api/tauriApi";

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

  // Último parseo del editor ST: código + resultado (AST o errores). Permite
  // compilar sin volver a parsear — STEditor lo reporta vía onParsed.
  const [ultimoParseo, setUltimoParseo] = useState<{ code: string; result: ParseResult } | null>(
    null
  );
  const [compilando, setCompilando] = useState(false);
  const [flasheando, setFlasheando] = useState(false);
  // True una vez que avr-gcc produjo generated/build/plc_firmware.hex con éxito.
  const [firmwareListoParaFlashear, setFirmwareListoParaFlashear] = useState(false);

  // Variables del último AST válido, mostradas en el panel derecho (Parte 3).
  const [variables, setVariables] = useState<VariableDeclaration[]>([]);
  // Direcciones IEC asignadas desde el panel de Variables: nombre → "%IX0.0".
  const [ioMappings, setIoMappings] = useState<Record<string, string>>({});

  const log = useCallback((tipo: ConsoleMessage["tipo"], texto: string) => {
    setMessages((prev) => [...prev, { id: nuevoId(), timestamp: horaActual(), tipo, texto }]);
  }, []);

  const limpiarConsola = useCallback(() => setMessages([]), []);

  const handleParsed = useCallback((code: string, result: ParseResult) => {
    setUltimoParseo({ code, result });
    if (result.success && result.ast) {
      setVariables(result.ast.variables);
    }
  }, []);

  const handleVariableUpdate = useCallback((nombre: string, direccion: string) => {
    setIoMappings((prev) => ({ ...prev, [nombre]: direccion }));
  }, []);

  const handleCompilar = useCallback(
    async (puerto: string) => {
      if (!ultimoParseo || !ultimoParseo.result.success || !ultimoParseo.result.ast) {
        log("error", "No se puede compilar: corrige los errores de sintaxis en el editor ST.");
        return;
      }
      const { ast } = ultimoParseo.result;

      setCompilando(true);
      setFirmwareListoParaFlashear(false);
      try {
        const codegen = generarCodigoC(ast, ioMappings);
        if (!codegen.success || codegen.files.length === 0) {
          codegen.errors.forEach((e) => log("error", `Error de compilación: ${e}`));
          return;
        }

        const archivo = codegen.files[0];
        const guardado = await compilarPrograma(archivo.contenido, archivo.nombre);
        if (!guardado.success) {
          log("error", `Error de compilación: ${guardado.error}`);
          return;
        }
        log("success", `Código C generado: ${guardado.path}`);
        log("info", `${ast.variables.length} variables, ${ast.networks.length} networks procesados`);
        codegen.warnings.forEach((w) => log("warning", w));

        // ST/Ladder → C ya está en disco; ahora avr-gcc lo compila a .hex.
        const compiladoAvr = await compilarAvr(puerto);
        if (compiladoAvr.success) {
          log("success", `Firmware compilado: ${compiladoAvr.hexPath}`);
          setFirmwareListoParaFlashear(true);
        } else {
          log("error", `Error de compilación AVR: ${compiladoAvr.error}`);
        }
      } catch (e) {
        log("error", `Error de compilación: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setCompilando(false);
      }
    },
    [ultimoParseo, ioMappings, log]
  );

  const handleFlashear = useCallback(
    async (puerto: string) => {
      setFlasheando(true);
      try {
        const resultado = await flashearAvr(puerto);
        if (resultado.success) {
          log("success", "Firmware flasheado correctamente al Arduino Uno");
          if (resultado.output) log("info", resultado.output);
        } else {
          log("error", `Error al flashear: ${resultado.error}`);
        }
      } finally {
        setFlasheando(false);
      }
    },
    [log]
  );

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
            {tab === "st" && <STEditor onLog={log} onParsed={handleParsed} />}
            {tab === "ladder" && <LadderEditor />}
          </div>
        </section>

        <VariablesPanel
          variables={variables}
          ioMappings={ioMappings}
          onVariableUpdate={handleVariableUpdate}
        />
      </div>

      {/* Consola inferior (colapsable) */}
      <ConsolePanel
        messages={messages}
        open={consoleOpen}
        onToggle={() => setConsoleOpen((o) => !o)}
        onClear={limpiarConsola}
      />

      {/* Toolbar inferior */}
      <Toolbar
        onCompilar={handleCompilar}
        compilando={compilando}
        onFlashear={handleFlashear}
        flasheando={flasheando}
        firmwareListo={firmwareListoParaFlashear}
      />
    </div>
  );
}
