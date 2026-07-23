import type { Network, Programa, VariableDeclaration } from "../ast/types";
import type { BoardIOChannel, BoardJson, CodegenResult, EmitContext, TargetConfig } from "./types";
import { emitirExpresion, sanitizarNombre } from "./helpers/expression_emitter";

/** Sustituye marcadores {clave} de un template por sus valores. */
function aplicarTemplate(tpl: string, valores: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_m, clave: string) =>
    clave in valores ? valores[clave] : `{${clave}}`
  );
}

/** Parsea una dirección IEC: %IX0.0 → { direccion: "I", ancho: "X" }. */
function parseIec(addr: string): { direccion: "I" | "Q" | null; ancho: "X" | "W" | null } {
  const m = /^%([IQ])([XW])/.exec(addr);
  if (!m) return { direccion: null, ancho: null };
  return { direccion: m[1] as "I" | "Q", ancho: m[2] as "X" | "W" };
}

/** Indenta cada línea con 2 espacios (cuerpo de función). */
function bloque(lineas: string[]): string {
  return lineas.map((l) => "  " + l).join("\n");
}

/**
 * Generador de código C. Recibe un AST (`Programa`), el board definition file
 * (para el mapeo dirección IEC → pin físico) y la configuración del target.
 * Produce un único archivo `plc_program.c`.
 */
export class CGenerator {
  generate(programa: Programa, board: BoardJson, target: TargetConfig): CodegenResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const ctx: EmitContext = { target };

    // Índice dirección IEC → canal de la placa.
    const canalPorIec = new Map<string, BoardIOChannel>();
    for (const c of board.canales_io ?? []) canalPorIec.set(c.direccion_iec, c);

    // ── Variables e instancias ──────────────────────────────────────────
    const varLines: string[] = [];
    const instancias = new Map<string, "TON" | "CTU">();

    const registrarInstancia = (nombre: string, tipo: "TON" | "CTU"): void => {
      const s = sanitizarNombre(nombre);
      const previo = instancias.get(s);
      if (previo && previo !== tipo) {
        warnings.push(`La instancia '${s}' se usa como ${previo} y como ${tipo}.`);
        return;
      }
      instancias.set(s, tipo);
    };

    for (const v of programa.variables) {
      const nombre = sanitizarNombre(v.nombre);
      switch (v.tipo) {
        case "BOOL": {
          const init = v.valor_inicial === true ? 1 : 0;
          varLines.push(`${target.tipo_bool} ${nombre} = ${init};${comentarioIec(v, canalPorIec)}`);
          break;
        }
        case "INT": {
          const init = typeof v.valor_inicial === "number" ? v.valor_inicial : 0;
          varLines.push(`${target.tipo_int} ${nombre} = ${init};${comentarioIec(v, canalPorIec)}`);
          break;
        }
        case "TIME": {
          const init = typeof v.valor_inicial === "number" ? v.valor_inicial : 0;
          varLines.push(`${target.tipo_time_ms} ${nombre} = ${init}UL;`);
          break;
        }
        case "TON":
          registrarInstancia(v.nombre, "TON");
          break;
        case "CTU":
          registrarInstancia(v.nombre, "CTU");
          break;
      }
    }

    // Instancias referenciadas por nodos ton/ctu (auto-declaradas si no existen).
    for (const net of programa.networks) {
      for (const e of net.expresiones) {
        if (e.tipo === "ton") registrarInstancia(e.q_var, "TON");
        if (e.tipo === "ctu") registrarInstancia(e.q_var, "CTU");
      }
    }

    const instanceLines: string[] = [];
    for (const [nombre, tipo] of instancias) instanceLines.push(`${tipo}_t ${nombre};`);

    // ── I/O: init, read, write ──────────────────────────────────────────
    const ioInit: string[] = [];
    const readInputs: string[] = [];
    const writeOutputs: string[] = [];

    for (const v of programa.variables) {
      if (!v.direccion_iec) continue;
      const canal = canalPorIec.get(v.direccion_iec);
      if (!canal) {
        warnings.push(
          `La variable '${v.nombre}' tiene dirección ${v.direccion_iec} pero la placa no define ese canal; se omite del I/O.`
        );
        continue;
      }
      const pin = canal.pin_fisico;
      const nombre = sanitizarNombre(v.nombre);
      const { direccion, ancho } = parseIec(v.direccion_iec);
      const esInput = direccion === "I" || v.clase === "VAR_INPUT";

      ioInit.push(aplicarTemplate(esInput ? target.init_input : target.init_output, { pin }) + ";");

      if (esInput) {
        const tpl = ancho === "W" ? target.analog_read : target.digital_read;
        readInputs.push(`${nombre} = ${aplicarTemplate(tpl, { pin })};`);
      } else {
        writeOutputs.push(aplicarTemplate(target.digital_write, { pin, value: nombre }) + ";");
      }
    }

    // ── Lógica del programa ─────────────────────────────────────────────
    const progLines: string[] = [];
    for (const net of programa.networks) {
      progLines.push(...this.emitirNetwork(net, ctx));
    }

    // ── Telemetría serial ───────────────────────────────────────────────
    // Solo son monitoreables las variables BOOL (VAR / VAR_INPUT / VAR_OUTPUT).
    const monitorables = programa.variables.filter((v) => v.tipo === "BOOL");
    const serialLines = monitorables.length ? emitirSeccionSerial() : [];
    const reportLines = monitorables.length ? emitirReporteSerial(monitorables) : [];
    // La telemetría se inicializa una sola vez, junto al resto del I/O (setup()).
    if (monitorables.length) ioInit.unshift("plc_serial_init();");

    // ── Ensamblado del archivo ──────────────────────────────────────────
    const contenido = ensamblarArchivo(programa, target, {
      varLines,
      instanceLines,
      serialLines,
      ioInit,
      readInputs,
      writeOutputs,
      progLines,
      reportLines,
    });

    return {
      success: errors.length === 0,
      files: [{ nombre: "plc_program.c", contenido }],
      errors,
      warnings,
    };
  }

  /** Emite las sentencias C de un Network (rung). */
  private emitirNetwork(net: Network, ctx: EmitContext): string[] {
    const lineas: string[] = [`/* Network ${net.id} */`];
    // La "lógica del rung" acumulada por las expresiones de valor que preceden a una bobina.
    let condicion = "1";

    for (const e of net.expresiones) {
      switch (e.tipo) {
        // Expresiones de valor: fijan la lógica del rung para la(s) bobina(s) siguientes.
        case "contacto_na":
        case "contacto_nc":
        case "and":
        case "or":
        case "not":
        case "comparacion":
        case "literal":
          condicion = emitirExpresion(e, ctx);
          break;

        case "asignacion":
          lineas.push(`${sanitizarNombre(e.variable)} = ${emitirExpresion(e.valor, ctx)};`);
          break;

        case "bobina":
          lineas.push(
            `${sanitizarNombre(e.variable)} = ${e.negar ? `(!${condicion})` : `(${condicion})`};`
          );
          break;

        case "bobina_s":
          lineas.push(`if (${condicion}) { ${sanitizarNombre(e.variable)} = 1; }`);
          break;

        case "bobina_r":
          lineas.push(`if (${condicion}) { ${sanitizarNombre(e.variable)} = 0; }`);
          break;

        case "ton": {
          const inst = sanitizarNombre(e.q_var);
          lineas.push(`TON_update(&${inst}, ${emitirExpresion(e.in, ctx)}, ${e.pt_ms}UL);`);
          if (e.et_var) lineas.push(`${sanitizarNombre(e.et_var)} = ${inst}.ET;`);
          break;
        }

        case "ctu": {
          const inst = sanitizarNombre(e.q_var);
          lineas.push(
            `CTU_update(&${inst}, ${emitirExpresion(e.cu, ctx)}, ${emitirExpresion(e.reset, ctx)}, ${e.pv});`
          );
          if (e.cv_var) lineas.push(`${sanitizarNombre(e.cv_var)} = ${inst}.CV;`);
          break;
        }
      }
    }

    return lineas;
  }
}

/** Comentario ` /* %IX0.0 → D2 *​/` para variables con dirección IEC. */
function comentarioIec(
  v: VariableDeclaration,
  canalPorIec: Map<string, BoardIOChannel>
): string {
  if (!v.direccion_iec) return "";
  const canal = canalPorIec.get(v.direccion_iec);
  const etiqueta = canal ? canal.etiqueta_serigrafia ?? canal.pin_fisico : undefined;
  return `  /* ${v.direccion_iec}${etiqueta ? ` → ${etiqueta}` : ""} */`;
}

/**
 * Bloque de telemetría serial (USART0 nativo, sin core de Arduino).
 * Emite el mínimo de USART para volcar el estado de las variables por serial:
 * init a 9600 baud @ 16 MHz, envío de un carácter/cadena y la macro
 * `Serial_print_bool`. Todo `static`: si hay monitoreables, todo se usa.
 */
function emitirSeccionSerial(): string[] {
  return [
    "/* USART0 @ 9600 baud, F_CPU = 16 MHz → UBRR = 16000000/(16*9600) - 1 = 103 */",
    "static void plc_serial_init(void) {",
    "  UBRR0H = 0;",
    "  UBRR0L = 103;",
    "  UCSR0B = (1 << TXEN0);                    /* habilita transmisor */",
    "  UCSR0C = (1 << UCSZ01) | (1 << UCSZ00);   /* 8 bits de datos, 1 stop */",
    "}",
    "",
    "static void plc_serial_putc(char c) {",
    "  while (!(UCSR0A & (1 << UDRE0))) { }       /* espera buffer de TX libre */",
    "  UDR0 = (uint8_t)c;",
    "}",
    "",
    "static void plc_serial_print(const char* s) {",
    "  while (*s) plc_serial_putc(*s++);",
    "}",
    "",
    "#define Serial_print(s) plc_serial_print(s)",
    "#define Serial_print_bool(name, val) do { \\",
    "    plc_serial_print(name); \\",
    "    plc_serial_putc('='); \\",
    "    plc_serial_putc((val) ? '1' : '0'); \\",
    "  } while (0)",
  ];
}

/**
 * Trama de reporte emitida al final de cada ciclo PLC:
 *   "VAR:Start=1,Stop=0,Motor=1\n"
 * Las comas separan (no terminan): la última variable no lleva coma. A 9600 baud
 * con <20 booleanas cabe holgadamente en un ciclo de scan sin bloquear.
 */
function emitirReporteSerial(monitorables: VariableDeclaration[]): string[] {
  const lineas: string[] = ['Serial_print("VAR:");'];
  monitorables.forEach((v, i) => {
    const nombre = sanitizarNombre(v.nombre);
    lineas.push(`Serial_print_bool("${nombre}", ${nombre});`);
    if (i < monitorables.length - 1) lineas.push('Serial_print(",");');
  });
  lineas.push('Serial_print("\\n");');
  return lineas;
}

interface Secciones {
  varLines: string[];
  instanceLines: string[];
  serialLines: string[];
  ioInit: string[];
  readInputs: string[];
  writeOutputs: string[];
  progLines: string[];
  reportLines: string[];
}

/** Une todas las secciones en el texto final de plc_program.c. */
function ensamblarArchivo(programa: Programa, target: TargetConfig, s: Secciones): string {
  const L: string[] = [];

  L.push("/* Generado automáticamente por PLC IDE — Agrupación */");
  L.push(`/* Programa: ${programa.nombre} | Target: ${target.familia} */`);
  L.push("/* NO EDITAR MANUALMENTE */");
  L.push("");
  L.push('#include "plc_runtime.h"');
  for (const inc of target.include_hal) L.push(`#include ${inc}`);
  L.push("");

  L.push("/* ── VARIABLES DEL PROGRAMA ── */");
  L.push(...(s.varLines.length ? s.varLines : ["/* (sin variables) */"]));
  L.push("");

  L.push("/* ── INSTANCIAS DE TIMERS/CONTADORES ── */");
  L.push(...(s.instanceLines.length ? s.instanceLines : ["/* (sin timers ni contadores) */"]));
  L.push("");

  if (s.serialLines.length) {
    L.push("/* ── TELEMETRÍA SERIAL ── */");
    L.push(...s.serialLines);
    L.push("");
  }

  L.push("/* ── INICIALIZACIÓN DE I/O ── */");
  L.push("void plc_io_init(void) {");
  if (s.ioInit.length) L.push(bloque(s.ioInit));
  L.push("}");
  L.push("");

  L.push("/* ── LECTURA DE ENTRADAS ── */");
  L.push("void plc_read_inputs(void) {");
  if (s.readInputs.length) L.push(bloque(s.readInputs));
  L.push("}");
  L.push("");

  L.push("/* ── ESCRITURA DE SALIDAS ── */");
  L.push("void plc_write_outputs(void) {");
  if (s.writeOutputs.length) L.push(bloque(s.writeOutputs));
  L.push("}");
  L.push("");

  L.push("/* ── LÓGICA DEL PROGRAMA ── */");
  L.push("void plc_program(void) {");
  if (s.progLines.length) L.push(bloque(s.progLines));
  if (s.reportLines.length) {
    if (s.progLines.length) L.push("");
    L.push(bloque(["/* Reporte de estado por serial (una trama por ciclo). */"]));
    L.push(bloque(s.reportLines));
  }
  L.push("}");
  L.push("");

  return L.join("\n");
}
