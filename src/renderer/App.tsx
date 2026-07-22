import { useCallback, useEffect, useState } from "react";
import { appWindow } from "@tauri-apps/api/window";
import { CODIGO_EJEMPLO, STEditor } from "../editors/st/STEditor";
import { LadderEditor } from "../editors/ladder/LadderEditor";
import { ProjectPanel } from "../project/ProjectPanel";
import { VariablesPanel } from "../components/VariablesPanel";
import { ConsolePanel } from "../monitor/ConsolePanel";
import { Toolbar } from "../components/Toolbar";
import { FileMenu } from "../components/FileMenu";
import type {
  BoardDefinitionFull,
  ConsoleMessage,
  McuFamily,
  ParseResult,
  PlcProject,
  VariableDeclaration,
} from "../shared/types";
import {
  abrirProyecto,
  compilarAvr,
  compilarPrograma,
  flashearAvr,
  generarCodigoC,
  guardarProyecto,
  guardarProyectoEnRuta,
  salirApp,
} from "./api/tauriApi";

type Tab = "ladder" | "st" | "fbd";

// Ítems del menú posteriores a "Archivo" (aún placeholders).
const MENU_ITEMS_RESTANTES = ["Editar", "Ver", "Programa", "Comunicación", "Ayuda"];

/** Deriva un nombre legible de proyecto desde la ruta del archivo .plcproj. */
function nombreDesdeRuta(ruta: string): string {
  const base = ruta.split(/[\\/]/).pop() ?? ruta;
  return base.replace(/\.plcproj$/i, "");
}

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

  // Placa seleccionada en la Toolbar (boards/*.json real) + su familia de MCU
  // (mcu_families/*.json). null hasta que Toolbar termina de cargarlas.
  const [boardSeleccionada, setBoardSeleccionada] = useState<BoardDefinitionFull | null>(null);
  const [familiaSeleccionada, setFamiliaSeleccionada] = useState<McuFamily | null>(null);

  const handleBoardChange = useCallback((board: BoardDefinitionFull, familia: McuFamily) => {
    setBoardSeleccionada(board);
    setFamiliaSeleccionada(familia);
  }, []);

  // ── Estado del proyecto (.plcproj) ──
  // Texto ST actual (fresco, sin debounce) — lo que se guardaría al proyecto.
  const [codigoActual, setCodigoActual] = useState<string>(CODIGO_EJEMPLO);
  // Ruta del archivo abierto/guardado (para "Guardar" sin diálogo). null = nuevo.
  const [rutaProyecto, setRutaProyecto] = useState<string | null>(null);
  const [nombreProyecto, setNombreProyecto] = useState<string>("Nuevo proyecto");
  const [proyectoModificado, setProyectoModificado] = useState<boolean>(false);
  // Se incrementa para forzar el remontaje del editor al abrir/nuevo proyecto
  // (STEditor solo lee initialCode al montar).
  const [editorKey, setEditorKey] = useState<number>(0);

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

  // Cada edición del texto ST: guarda el código fresco y marca "sin guardar".
  const handleChangeImmediate = useCallback((code: string) => {
    setCodigoActual(code);
    setProyectoModificado(true);
  }, []);

  const handleVariableUpdate = useCallback((nombre: string, direccion: string) => {
    setIoMappings((prev) => ({ ...prev, [nombre]: direccion }));
    setProyectoModificado(true);
  }, []);

  // Actualiza el título de la ventana (nombre + "*" si hay cambios sin guardar).
  const actualizarTitulo = useCallback((nombre: string, modificado: boolean) => {
    void appWindow.setTitle(`PLC IDE — ${nombre}${modificado ? " *" : ""}`);
  }, []);

  // Refleja el estado "modificado" en el título cuando cambia.
  useEffect(() => {
    actualizarTitulo(nombreProyecto, proyectoModificado);
  }, [nombreProyecto, proyectoModificado, actualizarTitulo]);

  /** Construye el objeto PlcProject con el estado actual. */
  const construirProyecto = useCallback(
    (nombre: string): PlcProject => ({
      proyecto: {
        nombre,
        target: "arduino_uno",
        version_formato: "1.0",
        fecha_modificacion: new Date().toISOString(),
      },
      programa: { lenguaje_fuente: "st", codigo_st: codigoActual },
      io_mappings: ioMappings,
    }),
    [codigoActual, ioMappings]
  );

  const handleGuardarComoProyecto = useCallback(async () => {
    try {
      const ruta = await guardarProyecto(construirProyecto(nombreProyecto));
      if (!ruta) return; // usuario canceló
      const nombre = nombreDesdeRuta(ruta);
      // Reescribe con el nombre correcto derivado del archivo elegido, para que
      // el `proyecto.nombre` interno coincida con el nombre del archivo.
      await guardarProyectoEnRuta(ruta, construirProyecto(nombre));
      setRutaProyecto(ruta);
      setNombreProyecto(nombre);
      setProyectoModificado(false);
      log("success", `Proyecto guardado: ${ruta}`);
    } catch (e) {
      log("error", e instanceof Error ? e.message : String(e));
    }
  }, [construirProyecto, nombreProyecto, log]);

  const handleGuardarProyecto = useCallback(async () => {
    if (!rutaProyecto) {
      // Nunca se guardó: cae a "Guardar como".
      await handleGuardarComoProyecto();
      return;
    }
    try {
      await guardarProyectoEnRuta(rutaProyecto, construirProyecto(nombreProyecto));
      setProyectoModificado(false);
      log("success", `Proyecto guardado: ${rutaProyecto}`);
    } catch (e) {
      log("error", e instanceof Error ? e.message : String(e));
    }
  }, [rutaProyecto, nombreProyecto, construirProyecto, handleGuardarComoProyecto, log]);

  const handleNuevoProyecto = useCallback(() => {
    if (
      proyectoModificado &&
      !window.confirm("Hay cambios sin guardar que se perderán. ¿Continuar con un proyecto nuevo?")
    ) {
      return;
    }
    setCodigoActual("");
    setIoMappings({});
    setVariables([]);
    setUltimoParseo(null);
    setFirmwareListoParaFlashear(false);
    setRutaProyecto(null);
    setNombreProyecto("Nuevo proyecto");
    setProyectoModificado(false);
    setEditorKey((k) => k + 1); // remonta el editor vacío
    log("info", "Nuevo proyecto");
  }, [proyectoModificado, log]);

  const handleAbrirProyecto = useCallback(async () => {
    if (
      proyectoModificado &&
      !window.confirm("Hay cambios sin guardar que se perderán. ¿Abrir otro proyecto?")
    ) {
      return;
    }
    try {
      const abierto = await abrirProyecto();
      if (!abierto) return; // usuario canceló
      const { proyecto, ruta } = abierto;
      setCodigoActual(proyecto.programa.codigo_st);
      setIoMappings(proyecto.io_mappings ?? {});
      setFirmwareListoParaFlashear(false);
      setEditorKey((k) => k + 1); // remonta el editor con el código cargado
      setRutaProyecto(ruta);
      setNombreProyecto(proyecto.proyecto.nombre || nombreDesdeRuta(ruta));
      setProyectoModificado(false);
      log("success", `Proyecto abierto: ${ruta}`);
    } catch (e) {
      log("error", e instanceof Error ? e.message : String(e));
    }
  }, [proyectoModificado, log]);

  const handleSalir = useCallback(() => {
    if (
      proyectoModificado &&
      !window.confirm("Hay cambios sin guardar que se perderán. ¿Salir de todas formas?")
    ) {
      return;
    }
    void salirApp();
  }, [proyectoModificado]);

  // Atajos de teclado: Ctrl+N/O/S y Ctrl+Shift+S.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      const k = e.key.toLowerCase();
      if (k === "n") {
        e.preventDefault();
        handleNuevoProyecto();
      } else if (k === "o") {
        e.preventDefault();
        void handleAbrirProyecto();
      } else if (k === "s" && e.shiftKey) {
        e.preventDefault();
        void handleGuardarComoProyecto();
      } else if (k === "s") {
        e.preventDefault();
        void handleGuardarProyecto();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleNuevoProyecto, handleAbrirProyecto, handleGuardarProyecto, handleGuardarComoProyecto]);

  const handleCompilar = useCallback(
    async (puerto: string) => {
      if (!ultimoParseo || !ultimoParseo.result.success || !ultimoParseo.result.ast) {
        log("error", "No se puede compilar: corrige los errores de sintaxis en el editor ST.");
        return;
      }
      if (!boardSeleccionada) {
        log("error", "No se puede compilar: no hay ninguna placa real cargada (boards/*.json).");
        return;
      }
      const { ast } = ultimoParseo.result;

      setCompilando(true);
      setFirmwareListoParaFlashear(false);
      try {
        const codegen = generarCodigoC(ast, ioMappings, boardSeleccionada);
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
    [ultimoParseo, ioMappings, boardSeleccionada, log]
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
        <FileMenu
          onNuevo={handleNuevoProyecto}
          onAbrir={handleAbrirProyecto}
          onGuardar={handleGuardarProyecto}
          onGuardarComo={handleGuardarComoProyecto}
          onSalir={handleSalir}
        />
        {MENU_ITEMS_RESTANTES.map((item) => (
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
            {tab === "st" && (
              <STEditor
                key={editorKey}
                initialCode={codigoActual}
                onLog={log}
                onParsed={handleParsed}
                onChangeImmediate={handleChangeImmediate}
              />
            )}
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
        onBoardChange={handleBoardChange}
      />
    </div>
  );
}
