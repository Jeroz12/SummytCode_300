import { useCallback, useEffect, useRef, useState } from "react";
import { appWindow } from "@tauri-apps/api/window";
import { CODIGO_EJEMPLO, STEditor } from "../editors/st/STEditor";
import { LadderEditor } from "../editors/ladder/LadderEditor";
import { programaArbolEjemplo, programaArbolInicial } from "../editors/ladder/types_canvas";
import type { RungArbol } from "../editors/ladder/types_canvas";
import { ProjectPanel } from "../project/ProjectPanel";
import { VariablesPanel } from "../components/VariablesPanel";
import { ConsolePanel } from "../monitor/ConsolePanel";
import { Toolbar } from "../components/Toolbar";
import { FileMenu } from "../components/FileMenu";
import { EditMenu } from "../components/EditMenu";
import { SyncWarningBanner } from "../components/SyncWarningBanner";
import type {
  BoardDefinitionFull,
  ConsoleMessage,
  McuFamily,
  ParseResult,
  PlcProject,
  ProgramaArbol,
  VariableDeclaration,
} from "../shared/types";
import { simpleHash, detectarDesincronizacion } from "../shared/syncUtils";
import {
  abrirProyecto,
  advertenciasArbol,
  compilarAvr,
  compilarPrograma,
  flashearAvr,
  generarCodigoC,
  generarCodigoCDesdeLadder,
  guardarProyecto,
  guardarProyectoEnRuta,
  salirApp,
  getSerialPorts,
  iniciarMonitoreo,
  detenerMonitoreo,
  escucharEstadoPlc,
} from "./api/tauriApi";

type Tab = "ladder" | "st" | "fbd";

// Familias de MCU con pipeline de compilación real hoy (solo AVR ATmega328P).
const FAMILIAS_SOPORTADAS = ["avr_atmega328"];

// Máximo de snapshots retenidos en el historial de undo del editor Ladder.
const LIMITE_HISTORIAL_LADDER = 50;

// Ítems del menú posteriores a "Archivo"/"Editar" (aún placeholders).
const MENU_ITEMS_RESTANTES = ["Ver", "Programa", "Comunicación", "Ayuda"];

/** Serializa el programa Ladder a string para hasheo. */
function serializarProgramaLadder(programa: ProgramaArbol): string {
  return JSON.stringify(programa);
}

/**
 * Obtiene el contenido del lenguaje especificado para hashear.
 * Para ST: el código texto; para Ladder: la serialización JSON.
 */
function obtenerContenidoParaHashear(
  lenguaje: "st" | "ladder",
  codigoSt: string,
  programaLadder: ProgramaArbol
): string {
  return lenguaje === "st" ? codigoSt : serializarProgramaLadder(programaLadder);
}

/**
 * Chequeo estructural de que un `ladder_canvas` cargado es un ÁRBOL válido
 * (`rungs[].red`), no una grilla vieja (`rungs[].celdas`). Sin migración: los
 * .plcproj de grilla se descartan (ver nota en shared/types.ts).
 */
function esProgramaArbol(x: unknown): x is ProgramaArbol {
  if (!x || typeof x !== "object" || !Array.isArray((x as ProgramaArbol).rungs)) return false;
  const rungs = (x as ProgramaArbol).rungs;
  // Un programa vacío (0 rungs) es válido; si hay rungs, el primero debe tener `red`.
  return rungs.length === 0 || (typeof rungs[0] === "object" && "red" in (rungs[0] as object));
}

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
  // Monitoreo serial en vivo (colorea el canvas Ladder). `estadoVivo` es el
  // último estado de variables recibido por el evento `plc_estado`.
  const [monitoreando, setMonitoreando] = useState(false);
  const [estadoVivo, setEstadoVivo] = useState<Record<string, boolean>>({});
  // True una vez que avr-gcc produjo generated/build/plc_firmware.hex con éxito.
  const [firmwareListoParaFlashear, setFirmwareListoParaFlashear] = useState(false);

  // Variables del último AST válido, mostradas en el panel derecho (Parte 3).
  const [variables, setVariables] = useState<VariableDeclaration[]>([]);
  // Variables agregadas a mano desde el panel: alimentan el codegen del editor
  // Ladder (ver handleCompilar, tab === "ladder"). Arrancan con las variables
  // del rung de ejemplo (programaArbolEjemplo) para que compile de inmediato,
  // igual que CODIGO_EJEMPLO ya se auto-declara sus propias VAR en el editor ST.
  const [variablesManuales, setVariablesManuales] = useState<VariableDeclaration[]>([
    { nombre: "Start", tipo: "BOOL", clase: "VAR_INPUT" },
    { nombre: "Sensor1", tipo: "BOOL", clase: "VAR_INPUT" },
    { nombre: "Motor", tipo: "BOOL", clase: "VAR_OUTPUT" },
  ]);
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
  // Estado del editor Ladder (árbol de rungs, controlado desde aquí igual que el
  // texto ST). Arranca con el rung de ejemplo (programaArbolEjemplo); "Nuevo
  // proyecto" y el fallback al abrir un .plcproj sin ladder usan
  // `programaArbolInicial()` (un rung vacío).
  const [programaCanvas, setProgramaCanvas] = useState<ProgramaArbol>(programaArbolEjemplo());
  // Undo/redo del editor Ladder: stacks de snapshots del array `rungs` (shallow;
  // el árbol ya es inmutable, así que basta guardar la referencia anterior). El
  // editor ST NO usa esto — tiene su propio undo nativo vía Monaco.
  const [historialLadder, setHistorialLadder] = useState<RungArbol[][]>([]);
  const [futuroLadder, setFuturoLadder] = useState<RungArbol[][]>([]);
  // Ruta del archivo abierto/guardado (para "Guardar" sin diálogo). null = nuevo.
  const [rutaProyecto, setRutaProyecto] = useState<string | null>(null);
  const [nombreProyecto, setNombreProyecto] = useState<string>("Nuevo proyecto");
  const [proyectoModificado, setProyectoModificado] = useState<boolean>(false);
  // Se incrementa para forzar el remontaje del editor al abrir/nuevo proyecto
  // (STEditor solo lee initialCode al montar).
  const [editorKey, setEditorKey] = useState<number>(0);
  // Hash del último contenido compilado exitosamente (para detectar desincronización).
  const [hashCompilado, setHashCompilado] = useState<{ lenguaje: "st" | "ladder"; hash: string } | undefined>();
  // Estado actual de desincronización (derivado).
  const [desincronizacion, setDesincronizacion] = useState(() =>
    detectarDesincronizacion("st", CODIGO_EJEMPLO)
  );

  // Actualizar desincronización cuando cambia el lenguaje, contenido o hashCompilado.
  useEffect(() => {
    const lenguajeActual = tab === "ladder" ? "ladder" : "st";
    const contenido = obtenerContenidoParaHashear(lenguajeActual, codigoActual, programaCanvas);
    setDesincronizacion(detectarDesincronizacion(lenguajeActual, contenido, hashCompilado));
  }, [tab, codigoActual, programaCanvas, hashCompilado]);

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

  // Wrapper de toda mutación del árbol Ladder: apila el estado ANTERIOR en el
  // historial (recortado a LIMITE_HISTORIAL_LADDER), limpia el futuro (una nueva
  // edición invalida cualquier redo pendiente) y aplica el nuevo estado.
  const handleLadderChange = useCallback(
    (programa: ProgramaArbol) => {
      setHistorialLadder((h) => {
        const next = [...h, programaCanvas.rungs];
        return next.length > LIMITE_HISTORIAL_LADDER
          ? next.slice(next.length - LIMITE_HISTORIAL_LADDER)
          : next;
      });
      setFuturoLadder([]);
      setProgramaCanvas(programa);
      setProyectoModificado(true);
    },
    [programaCanvas]
  );

  // Undo (Ctrl+Z): saca el último snapshot del historial y lo restaura, empujando
  // el estado actual al futuro para poder rehacerlo.
  const deshacerLadder = useCallback(() => {
    if (historialLadder.length === 0) return;
    const previo = historialLadder[historialLadder.length - 1];
    setHistorialLadder((h) => h.slice(0, -1));
    setFuturoLadder((f) => [...f, programaCanvas.rungs]);
    setProgramaCanvas({ rungs: previo });
    setProyectoModificado(true);
  }, [historialLadder, programaCanvas]);

  // Redo (Ctrl+Y / Ctrl+Shift+Z): saca el último snapshot del futuro y lo
  // restaura, devolviendo el estado actual al historial.
  const rehacerLadder = useCallback(() => {
    if (futuroLadder.length === 0) return;
    const siguiente = futuroLadder[futuroLadder.length - 1];
    setFuturoLadder((f) => f.slice(0, -1));
    setHistorialLadder((h) => {
      const next = [...h, programaCanvas.rungs];
      return next.length > LIMITE_HISTORIAL_LADDER
        ? next.slice(next.length - LIMITE_HISTORIAL_LADDER)
        : next;
    });
    setProgramaCanvas({ rungs: siguiente });
    setProyectoModificado(true);
  }, [futuroLadder, programaCanvas]);

  const handleVariableUpdate = useCallback((nombre: string, direccion: string) => {
    setIoMappings((prev) => ({ ...prev, [nombre]: direccion }));
    setProyectoModificado(true);
  }, []);

  const handleAgregarVariable = useCallback((variable: VariableDeclaration) => {
    setVariablesManuales((prev) => [...prev, variable]);
    setProyectoModificado(true);
  }, []);

  const handleEliminarVariable = useCallback((nombre: string) => {
    setVariablesManuales((prev) => prev.filter((v) => v.nombre !== nombre));
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
      programa: {
        lenguaje_fuente: tab === "ladder" ? "ladder" : "st",
        codigo_st: codigoActual,
        ladder_canvas: programaCanvas,
      },
      io_mappings: ioMappings,
      variables_manuales: variablesManuales,
      hashCompilado,
    }),
    [codigoActual, programaCanvas, tab, ioMappings, variablesManuales, hashCompilado]
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
    setProgramaCanvas(programaArbolInicial());
    setHistorialLadder([]);
    setFuturoLadder([]);
    setIoMappings({});
    setVariables([]);
    setVariablesManuales([]);
    setUltimoParseo(null);
    setFirmwareListoParaFlashear(false);
    setHashCompilado(undefined);
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
      // Ruptura de formato (migración a árbol): solo se aceptan .plcproj cuyo
      // ladder_canvas ya sea un árbol (rungs[].red). Un archivo viejo de grilla
      // se ignora y se arranca con un rung vacío (ver nota en shared/types.ts).
      setProgramaCanvas(esProgramaArbol(proyecto.programa.ladder_canvas) ? proyecto.programa.ladder_canvas! : programaArbolInicial());
      setHistorialLadder([]);
      setFuturoLadder([]);
      if (proyecto.programa.lenguaje_fuente === "ladder") setTab("ladder");
      setIoMappings(proyecto.io_mappings ?? {});
      setVariablesManuales(proyecto.variables_manuales ?? []);
      setHashCompilado(proyecto.hashCompilado);
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

  // Atajos de undo/redo del editor Ladder (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z).
  // Solo actúan con la pestaña Ladder activa y cuando el foco NO está en Monaco
  // (que tiene su propio undo nativo) ni en un input de texto (undo del navegador).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (tab !== "ladder" || !e.ctrlKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el?.closest(".monaco-editor")) return;
      const tag = (el?.tagName ?? "").toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        deshacerLadder();
      } else if (k === "y" || (k === "z" && e.shiftKey)) {
        e.preventDefault();
        rehacerLadder();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab, deshacerLadder, rehacerLadder]);

  const handleCompilar = useCallback(
    async (puerto: string) => {
      if (!boardSeleccionada) {
        log("error", "No se puede compilar: no hay ninguna placa real cargada (boards/*.json).");
        return;
      }
      if (!familiaSeleccionada || !FAMILIAS_SOPORTADAS.includes(familiaSeleccionada.familia_id)) {
        log(
          "error",
          `La familia "${familiaSeleccionada?.nombre_visible ?? "desconocida"}" no está soportada en esta versión. Solo AVR ATmega328P (Arduino Uno) está disponible actualmente.`
        );
        return;
      }

      // El codegen difiere según la pestaña activa: ST parte del AST parseado;
      // Ladder traduce el árbol de rungs → mismo AST → mismo backend.
      let codegen;
      let resumen: string;
      if (tab === "ladder") {
        if (programaCanvas.rungs.length === 0) {
          log("error", "No se puede compilar: el programa Ladder no tiene rungs.");
          return;
        }
        // Advertencias topológicas del árbol (ej. varias bobinas de salida).
        advertenciasArbol(programaCanvas).forEach((a) => log("warning", a));
        codegen = generarCodigoCDesdeLadder(
          programaCanvas,
          variablesManuales,
          ioMappings,
          boardSeleccionada,
          nombreProyecto
        );
        resumen = `${variablesManuales.length} variables, ${programaCanvas.rungs.length} rungs procesados`;
      } else {
        if (!ultimoParseo || !ultimoParseo.result.success || !ultimoParseo.result.ast) {
          log("error", "No se puede compilar: corrige los errores de sintaxis en el editor ST.");
          return;
        }
        const { ast } = ultimoParseo.result;
        codegen = generarCodigoC(ast, ioMappings, boardSeleccionada);
        resumen = `${ast.variables.length} variables, ${ast.networks.length} networks procesados`;
      }

      setCompilando(true);
      setFirmwareListoParaFlashear(false);
      try {
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
        log("info", resumen);
        codegen.warnings.forEach((w) => log("warning", w));

        // ST/Ladder → C ya está en disco; ahora avr-gcc lo compila a .hex.
        const compiladoAvr = await compilarAvr(puerto);
        if (compiladoAvr.success) {
          log("success", `Firmware compilado: ${compiladoAvr.hexPath}`);
          setFirmwareListoParaFlashear(true);
          // Guardar hash del contenido compilado para detectar futuros cambios.
          const lenguajeActual = tab === "ladder" ? "ladder" : "st";
          const contenido = obtenerContenidoParaHashear(lenguajeActual, codigoActual, programaCanvas);
          const hash = simpleHash(contenido);
          setHashCompilado({ lenguaje: lenguajeActual, hash });
        } else {
          log("error", `Error de compilación AVR: ${compiladoAvr.error}`);
        }
      } catch (e) {
        log("error", `Error de compilación: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setCompilando(false);
      }
    },
    [
      tab,
      codigoActual,
      programaCanvas,
      variablesManuales,
      nombreProyecto,
      ultimoParseo,
      ioMappings,
      boardSeleccionada,
      familiaSeleccionada,
      log,
    ]
  );

  // Wrapper para compilar desde el banner de desincronización (sin puerto
  // específico: usa el primero disponible, igual que la Toolbar al montar).
  const handleCompilarDesdeWarning = useCallback(async () => {
    try {
      const puertos = await getSerialPorts();
      if (puertos.length === 0) {
        log("error", "No hay puertos seriales disponibles. Conecta el Arduino Uno.");
        return;
      }
      void handleCompilar(puertos[0]);
    } catch (e) {
      log("error", e instanceof Error ? e.message : String(e));
    }
  }, [handleCompilar, log]);

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

  // ── Monitoreo serial en vivo ────────────────────────────────────────────
  // Suscripción al evento `plc_estado` (una sola vez): cada trama actualiza el
  // estado en vivo que colorea el canvas. La suscripción se mantiene todo el
  // ciclo de vida; solo llegan eventos mientras el backend esté monitoreando.
  useEffect(() => {
    const unlisten = escucharEstadoPlc(setEstadoVivo);
    return () => {
      void unlisten.then((f) => f());
    };
  }, []);

  // Ref al estado de monitoreo para el cleanup de desmontaje (evita recrear el
  // efecto de limpieza en cada toggle).
  const monitoreandoRef = useRef(false);
  useEffect(() => {
    monitoreandoRef.current = monitoreando;
  }, [monitoreando]);

  // Al desmontar la app: si quedaba monitoreo activo, cerrar el puerto en Rust.
  useEffect(() => {
    return () => {
      if (monitoreandoRef.current) void detenerMonitoreo();
    };
  }, []);

  // Toggle del botón "Monitorear" (recibe el puerto elegido en la Toolbar).
  const handleToggleMonitoreo = useCallback(
    async (puerto: string) => {
      if (monitoreando) {
        try {
          await detenerMonitoreo();
        } catch (e) {
          log("error", `Error al detener el monitoreo: ${e instanceof Error ? e.message : String(e)}`);
        }
        setMonitoreando(false);
        setEstadoVivo({}); // limpia el coloreo del canvas
        log("info", "Monitoreo detenido");
        return;
      }
      if (!puerto) {
        log("error", "No hay puerto seleccionado para monitorear.");
        return;
      }
      try {
        await iniciarMonitoreo(puerto, 9600);
        setMonitoreando(true);
        log("success", `Monitoreando ${puerto} a 9600 baud`);
      } catch (e) {
        // Puerto ocupado, inexistente, etc.: se informa y NO se activa el monitoreo.
        log("error", `No se pudo iniciar el monitoreo: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [monitoreando, log]
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
        <EditMenu
          onDeshacer={deshacerLadder}
          onRehacer={rehacerLadder}
          puedeDeshacer={tab === "ladder" && historialLadder.length > 0}
          puedeRehacer={tab === "ladder" && futuroLadder.length > 0}
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
            {tab === "ladder" && (
              <LadderEditor
                programa={programaCanvas}
                onChange={handleLadderChange}
                variables={variablesManuales}
                estadoVivo={monitoreando ? estadoVivo : {}}
              />
            )}
          </div>
        </section>

        <VariablesPanel
          variables={variables}
          variablesManuales={variablesManuales}
          ioMappings={ioMappings}
          onVariableUpdate={handleVariableUpdate}
          onAgregarVariable={handleAgregarVariable}
          onEliminarVariable={handleEliminarVariable}
        />
      </div>

      {/* Consola inferior (colapsable) */}
      <ConsolePanel
        messages={messages}
        open={consoleOpen}
        onToggle={() => setConsoleOpen((o) => !o)}
        onClear={limpiarConsola}
      />

      {/* Banner de advertencia de desincronización ST/Ladder (sobre la Toolbar) */}
      <SyncWarningBanner
        sincro={desincronizacion}
        onCompilar={handleCompilarDesdeWarning}
        compilando={compilando}
      />

      {/* Toolbar inferior */}
      <Toolbar
        onCompilar={handleCompilar}
        compilando={compilando}
        onFlashear={handleFlashear}
        flasheando={flasheando}
        firmwareListo={firmwareListoParaFlashear}
        onBoardChange={handleBoardChange}
        familiaSoportada={
          familiaSeleccionada !== null && FAMILIAS_SOPORTADAS.includes(familiaSeleccionada.familia_id)
        }
        monitoreando={monitoreando}
        onToggleMonitoreo={handleToggleMonitoreo}
        puedeMonitorearLenguaje={tab === "ladder"}
      />
    </div>
  );
}
