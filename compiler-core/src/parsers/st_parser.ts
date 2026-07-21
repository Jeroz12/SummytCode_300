/**
 * Parser de Structured Text (ST) → AST
 * ------------------------------------
 * Parser recursivo descendente escrito a mano (sin dependencias externas), por
 * ser más educativo y dar control total sobre los mensajes de error (§3: la
 * validación debe ser clara y pedagógica).
 *
 * MVP — soporta:
 *   - Bloques VAR / VAR_INPUT / VAR_OUTPUT ... END_VAR (con AT %IEC y := inicial opcionales)
 *   - Asignaciones:            variable := <expresion>;
 *   - IF <cond> THEN ... END_IF (se traduce a contacto + bobina/s)
 *   - Expresiones lógicas:     AND, OR, NOT, comparaciones (=, <>, <, >, <=, >=)
 *   - Bloques con estado:      TON(IN:=.., PT:=T#5s, Q=>..)  y  CTU(CU:=.., RESET:=.., PV:=.., Q=>..)
 *
 * NO soporta aún (fases futuras / §5.4): ELSE, ELSIF, TOF, TP, CTD, REAL, arrays, FBs de usuario.
 */

import {
  Asignacion,
  Comparacion,
  Ctu,
  Expresion,
  Network,
  Programa,
  TipoDato,
  Ton,
  VariableDeclaration,
  ClaseVariable,
} from "../ast/types";

type TokenTipo =
  | "IDENT"
  | "NUMBER"
  | "TIME"
  | "IEC_ADDR"
  | "KEYWORD"
  | "SYMBOL"
  | "EOF";

interface Token {
  tipo: TokenTipo;
  valor: string;
  linea: number;
  columna: number;
}

const PALABRAS_CLAVE = new Set<string>([
  "VAR",
  "VAR_INPUT",
  "VAR_OUTPUT",
  "END_VAR",
  "IF",
  "THEN",
  "ELSE",
  "END_IF",
  "AND",
  "OR",
  "NOT",
  "TRUE",
  "FALSE",
  "BOOL",
  "INT",
  "TIME",
  "TON",
  "CTU",
  "AT",
]);

const TIPOS_VALIDOS = new Set<string>(["BOOL", "INT", "TIME", "TON", "CTU"]);

const OPERADORES_COMPARACION: Record<string, Comparacion["operador"]> = {
  "=": "==",
  "<>": "!=",
  "<": "<",
  ">": ">",
  "<=": "<=",
  ">=": ">=",
};

/** Convierte un literal de tiempo IEC (T#5s, T#100ms, T#1m30s) a milisegundos. */
function tiempoAMilisegundos(literal: string): number {
  const cuerpo = literal.slice(2); // quita el "T#"
  const regex = /(\d+)(ms|s|m|h)/g;
  let match: RegExpExecArray | null;
  let total = 0;
  let encontrado = false;
  while ((match = regex.exec(cuerpo)) !== null) {
    encontrado = true;
    const n = parseInt(match[1], 10);
    switch (match[2]) {
      case "ms":
        total += n;
        break;
      case "s":
        total += n * 1000;
        break;
      case "m":
        total += n * 60_000;
        break;
      case "h":
        total += n * 3_600_000;
        break;
    }
  }
  if (!encontrado) {
    throw new Error(`Literal de tiempo inválido: '${literal}' (ej. válido: T#5s, T#100ms)`);
  }
  return total;
}

export class STParser {
  private tokens: Token[] = [];
  private current = 0;

  /** Punto de entrada: código ST en string → objeto Programa (AST). */
  parse(codigo: string): Programa {
    this.tokens = this.tokenize(codigo);
    this.current = 0;

    const variables: VariableDeclaration[] = [];
    const networks: Network[] = [];
    let siguienteId = 1;

    while (!this.estaAlFinal()) {
      if (
        this.coincide("VAR") ||
        this.coincide("VAR_INPUT") ||
        this.coincide("VAR_OUTPUT")
      ) {
        variables.push(...this.parseVariables());
      } else {
        networks.push(this.parseNetwork(siguienteId++));
      }
    }

    return { nombre: "Main", variables, networks, lenguaje_fuente: "st" };
  }

  // --- Tokenizer ---------------------------------------------------------

  private tokenize(codigo: string): Token[] {
    const tokens: Token[] = [];
    const n = codigo.length;
    let i = 0;
    let linea = 1;
    let columna = 1;

    const avanzar = (count = 1): void => {
      for (let k = 0; k < count; k++) {
        if (codigo[i] === "\n") {
          linea++;
          columna = 1;
        } else {
          columna++;
        }
        i++;
      }
    };

    while (i < n) {
      const c = codigo[i];

      // Espacios en blanco (incluye saltos de línea).
      if (c === " " || c === "\t" || c === "\r" || c === "\n") {
        avanzar();
        continue;
      }
      // Comentario de línea //
      if (c === "/" && codigo[i + 1] === "/") {
        while (i < n && codigo[i] !== "\n") avanzar();
        continue;
      }
      // Comentario de bloque (* ... *)
      if (c === "(" && codigo[i + 1] === "*") {
        avanzar(2);
        while (i < n && !(codigo[i] === "*" && codigo[i + 1] === ")")) avanzar();
        if (i < n) avanzar(2);
        continue;
      }

      const linInicio = linea;
      const colInicio = columna;

      // Dirección IEC: %IX0.0, %QW0
      if (c === "%") {
        let val = "%";
        avanzar();
        while (i < n && /[A-Za-z0-9.]/.test(codigo[i])) {
          val += codigo[i];
          avanzar();
        }
        tokens.push({ tipo: "IEC_ADDR", valor: val, linea: linInicio, columna: colInicio });
        continue;
      }

      // Literal de tiempo: T#5s
      if ((c === "T" || c === "t") && codigo[i + 1] === "#") {
        let val = codigo[i] + "#";
        avanzar(2);
        while (i < n && /[0-9A-Za-z_]/.test(codigo[i])) {
          val += codigo[i];
          avanzar();
        }
        tokens.push({ tipo: "TIME", valor: val, linea: linInicio, columna: colInicio });
        continue;
      }

      // Identificador o palabra clave.
      if (/[A-Za-z_]/.test(c)) {
        let val = "";
        while (i < n && /[A-Za-z0-9_]/.test(codigo[i])) {
          val += codigo[i];
          avanzar();
        }
        const upper = val.toUpperCase();
        if (PALABRAS_CLAVE.has(upper)) {
          tokens.push({ tipo: "KEYWORD", valor: upper, linea: linInicio, columna: colInicio });
        } else {
          tokens.push({ tipo: "IDENT", valor: val, linea: linInicio, columna: colInicio });
        }
        continue;
      }

      // Número.
      if (/[0-9]/.test(c)) {
        let val = "";
        while (i < n && /[0-9.]/.test(codigo[i])) {
          val += codigo[i];
          avanzar();
        }
        tokens.push({ tipo: "NUMBER", valor: val, linea: linInicio, columna: colInicio });
        continue;
      }

      // Símbolos de dos caracteres.
      const dos = codigo.slice(i, i + 2);
      if (["<=", ">=", "<>", ":=", "=>"].includes(dos)) {
        avanzar(2);
        tokens.push({ tipo: "SYMBOL", valor: dos, linea: linInicio, columna: colInicio });
        continue;
      }

      // Símbolos de un caracter.
      if ("();:,=<>.".includes(c)) {
        avanzar();
        tokens.push({ tipo: "SYMBOL", valor: c, linea: linInicio, columna: colInicio });
        continue;
      }

      throw new Error(
        `[línea ${linInicio}, columna ${colInicio}] Símbolo inesperado: '${c}'`
      );
    }

    tokens.push({ tipo: "EOF", valor: "<EOF>", linea, columna });
    return tokens;
  }

  // --- Utilidades de navegación -----------------------------------------

  private peek(offset = 0): Token {
    const idx = this.current + offset;
    return this.tokens[idx] ?? this.tokens[this.tokens.length - 1];
  }

  private avanzar(): Token {
    return this.tokens[this.current++];
  }

  private estaAlFinal(): boolean {
    return this.peek().tipo === "EOF";
  }

  /** ¿El token actual es la palabra clave o el símbolo `valor`? (case-insensitive). */
  private coincide(valor: string): boolean {
    const t = this.peek();
    return (
      (t.tipo === "KEYWORD" || t.tipo === "SYMBOL") &&
      t.valor.toUpperCase() === valor.toUpperCase()
    );
  }

  private consumir(valor: string, mensaje: string): Token {
    if (this.coincide(valor)) return this.avanzar();
    throw this.error(mensaje);
  }

  private expectIdent(mensaje: string): string {
    const t = this.peek();
    if (t.tipo !== "IDENT") throw this.error(mensaje);
    return this.avanzar().valor;
  }

  private error(mensaje: string): Error {
    const t = this.peek();
    return new Error(
      `[línea ${t.linea}, columna ${t.columna}] ${mensaje}. Símbolo encontrado: '${t.valor}'`
    );
  }

  // --- Declaración de variables -----------------------------------------

  private parseVariables(): VariableDeclaration[] {
    const clase = this.avanzar().valor as ClaseVariable; // VAR / VAR_INPUT / VAR_OUTPUT
    const decls: VariableDeclaration[] = [];

    while (!this.coincide("END_VAR") && !this.estaAlFinal()) {
      const nombre = this.expectIdent("Se esperaba el nombre de una variable");

      let direccion_iec: string | undefined;
      if (this.coincide("AT")) {
        this.avanzar();
        const addr = this.peek();
        if (addr.tipo !== "IEC_ADDR") {
          throw this.error("Se esperaba una dirección IEC (ej. %IX0.0) después de 'AT'");
        }
        direccion_iec = this.avanzar().valor;
      }

      this.consumir(":", "Se esperaba ':' antes del tipo de la variable");

      const tipoTok = this.peek();
      if (tipoTok.tipo !== "KEYWORD" || !TIPOS_VALIDOS.has(tipoTok.valor)) {
        throw this.error("Tipo de dato inválido (esperado BOOL, INT, TIME, TON o CTU)");
      }
      const tipo = this.avanzar().valor as TipoDato;

      let valor_inicial: boolean | number | undefined;
      if (this.coincide(":=")) {
        this.avanzar();
        valor_inicial = this.parseValorLiteral();
      }

      this.consumir(";", "Se esperaba ';' al final de la declaración de la variable");
      decls.push({ nombre, tipo, clase, direccion_iec, valor_inicial });
    }

    this.consumir("END_VAR", "Se esperaba 'END_VAR' para cerrar el bloque de variables");
    if (this.coincide(";")) this.avanzar(); // ';' final opcional
    return decls;
  }

  private parseValorLiteral(): boolean | number {
    const t = this.peek();
    if (this.coincide("TRUE")) {
      this.avanzar();
      return true;
    }
    if (this.coincide("FALSE")) {
      this.avanzar();
      return false;
    }
    if (t.tipo === "NUMBER") {
      this.avanzar();
      return Number(t.valor);
    }
    if (t.tipo === "TIME") {
      this.avanzar();
      return tiempoAMilisegundos(t.valor);
    }
    throw this.error("Se esperaba un valor literal (TRUE, FALSE, número o tiempo)");
  }

  // --- Networks / statements --------------------------------------------

  private parseNetwork(id: number): Network {
    return { id, expresiones: this.parseStatement() };
  }

  /** Un statement de nivel superior → una o más expresiones del AST. */
  private parseStatement(): Expresion[] {
    if (this.coincide("IF")) return this.parseIf();
    if (this.coincide("TON") || this.coincide("CTU")) return [this.parseLlamadaBloque()];
    if (this.peek().tipo === "IDENT") return [this.parseAsignacion()];
    throw this.error("Sentencia no reconocida");
  }

  private parseAsignacion(): Asignacion {
    const variable = this.expectIdent("Se esperaba el nombre de una variable");
    this.consumir(":=", "Se esperaba ':=' en la asignación");
    const valor = this.parseExpresion();
    this.consumir(";", "Se esperaba ';' al final de la asignación");
    return { tipo: "asignacion", variable, valor };
  }

  private parseIf(): Expresion[] {
    this.consumir("IF", "Se esperaba 'IF'");
    const condicion = this.parseExpresion();
    this.consumir("THEN", "Se esperaba 'THEN' después de la condición del IF");

    const cuerpo: Expresion[] = [];
    while (!this.coincide("END_IF") && !this.coincide("ELSE") && !this.estaAlFinal()) {
      for (const stmt of this.parseStatement()) {
        cuerpo.push(this.convertirACoil(stmt));
      }
    }

    if (this.coincide("ELSE")) {
      throw this.error("La cláusula 'ELSE' aún no está soportada en el MVP del parser");
    }

    this.consumir("END_IF", "Se esperaba 'END_IF' para cerrar el bloque IF");
    if (this.coincide(";")) this.avanzar(); // ';' final opcional
    return [condicion, ...cuerpo];
  }

  /**
   * Dentro de un IF, una asignación a un literal booleano se modela como bobina:
   *   Motor := TRUE;   → bobina(Motor)
   *   Motor := FALSE;  → bobina(Motor, negar=true)
   * Cualquier otra asignación se conserva tal cual.
   */
  private convertirACoil(expr: Expresion): Expresion {
    if (
      expr.tipo === "asignacion" &&
      expr.valor.tipo === "literal" &&
      typeof expr.valor.valor === "boolean"
    ) {
      return { tipo: "bobina", variable: expr.variable, negar: expr.valor.valor === false };
    }
    return expr;
  }

  // --- Llamadas a bloques con estado (TON / CTU) ------------------------

  private parseLlamadaBloque(): Ton | Ctu {
    const nombreBloque = this.avanzar().valor; // "TON" | "CTU"
    this.consumir("(", `Se esperaba '(' después de '${nombreBloque}'`);

    // Los parámetros de condición (IN, CU, RESET) se parsean como expresiones
    // booleanas completas → permiten entradas compuestas (AND/OR/NOT/comparación).
    // Los presets (PT, PV) son literales; las salidas (Q, ET, CV) son variables.
    const p: {
      in?: Expresion;
      cu?: Expresion;
      reset?: Expresion;
      pt_ms?: number;
      pv?: number;
      q?: string;
      et?: string;
      cv?: string;
    } = {};

    while (!this.coincide(")") && !this.estaAlFinal()) {
      const nombreParam = this
        .expectIdent("Se esperaba el nombre de un parámetro (ej. IN, PT, Q)")
        .toUpperCase();
      if (this.coincide(":=") || this.coincide("=>")) {
        this.avanzar();
      } else {
        throw this.error("Se esperaba ':=' o '=>' después del nombre del parámetro");
      }

      switch (nombreParam) {
        case "IN":
          p.in = this.parseExpresion();
          break;
        case "CU":
          p.cu = this.parseExpresion();
          break;
        case "RESET":
          p.reset = this.parseExpresion();
          break;
        case "PT":
          p.pt_ms = this.parseTiempoLiteral();
          break;
        case "PV":
          p.pv = this.parseNumeroLiteral();
          break;
        case "Q":
          p.q = this.parseNombreSalida("Q");
          break;
        case "ET":
          p.et = this.parseNombreSalida("ET");
          break;
        case "CV":
          p.cv = this.parseNombreSalida("CV");
          break;
        default:
          throw this.error(
            `Parámetro '${nombreParam}' no reconocido para el bloque ${nombreBloque}`
          );
      }

      if (this.coincide(",")) this.avanzar();
    }

    this.consumir(")", `Se esperaba ')' para cerrar la llamada a '${nombreBloque}'`);
    this.consumir(";", "Se esperaba ';' al final de la llamada al bloque");

    if (nombreBloque === "TON") {
      if (p.in === undefined) throw new Error("El bloque TON requiere el parámetro 'IN'");
      if (p.pt_ms === undefined) throw new Error("El bloque TON requiere el parámetro 'PT'");
      if (p.q === undefined) throw new Error("El bloque TON requiere el parámetro 'Q'");
      return { tipo: "ton", in: p.in, pt_ms: p.pt_ms, q_var: p.q, et_var: p.et };
    }

    if (p.cu === undefined) throw new Error("El bloque CTU requiere el parámetro 'CU'");
    if (p.reset === undefined) throw new Error("El bloque CTU requiere el parámetro 'RESET'");
    if (p.pv === undefined) throw new Error("El bloque CTU requiere el parámetro 'PV'");
    if (p.q === undefined) throw new Error("El bloque CTU requiere el parámetro 'Q'");
    return { tipo: "ctu", cu: p.cu, reset: p.reset, pv: p.pv, q_var: p.q, cv_var: p.cv };
  }

  /** Parsea un literal para PT: tiempo (T#5s) o número en milisegundos. */
  private parseTiempoLiteral(): number {
    const t = this.peek();
    if (t.tipo === "TIME") {
      this.avanzar();
      return tiempoAMilisegundos(t.valor);
    }
    if (t.tipo === "NUMBER") {
      this.avanzar();
      return Number(t.valor);
    }
    throw this.error("Se esperaba un tiempo (ej. T#5s) o un número en ms para 'PT'");
  }

  /**
   * Parsea el nombre de una variable de salida de TON/CTU (Q, ET, CV), aceptando
   * notación de punto opcional al estilo IEC 61131-3: "Timer1.Q" además de "Timer1".
   *
   * En nuestro modelo el campo tras el punto es azúcar sintáctica: la instancia
   * (struct TON_t/CTU_t del runtime) ya expone t.Q/t.ET/t.CV directamente, así
   * que "Q => Timer1.Q" y "Q => Timer1" producen el mismo AST (q_var: "Timer1").
   * Si el campo mencionado no coincide con el parámetro, es un error de parseo.
   */
  private parseNombreSalida(nombreParam: string): string {
    const instancia = this.expectIdent(
      `Se esperaba una variable de salida para '${nombreParam}'`
    );

    if (this.coincide(".")) {
      this.avanzar();
      const campoTok = this.peek();
      const campo = this.expectIdent(
        `Se esperaba un campo (ej. '${nombreParam}') después de '.'`
      );
      if (campo.toUpperCase() !== nombreParam.toUpperCase()) {
        throw new Error(
          `[línea ${campoTok.linea}, columna ${campoTok.columna}] Campo '${campo}' inesperado para el parámetro ${nombreParam} en ${instancia}. Símbolo encontrado: '${campo}'`
        );
      }
    }

    return instancia;
  }

  /** Parsea un literal numérico para PV. */
  private parseNumeroLiteral(): number {
    const t = this.peek();
    if (t.tipo === "NUMBER") {
      this.avanzar();
      return Number(t.valor);
    }
    throw this.error("Se esperaba un número para 'PV'");
  }

  // --- Expresiones (precedencia: OR < AND < comparación < NOT < primario) ---

  private parseExpresion(): Expresion {
    return this.parseOr();
  }

  private parseOr(): Expresion {
    let izq = this.parseAnd();
    while (this.coincide("OR")) {
      this.avanzar();
      izq = { tipo: "or", izq, der: this.parseAnd() };
    }
    return izq;
  }

  private parseAnd(): Expresion {
    let izq = this.parseComparacion();
    while (this.coincide("AND")) {
      this.avanzar();
      izq = { tipo: "and", izq, der: this.parseComparacion() };
    }
    return izq;
  }

  private parseComparacion(): Expresion {
    const izq = this.parseUnario();
    const t = this.peek();
    if (t.tipo === "SYMBOL" && OPERADORES_COMPARACION[t.valor]) {
      const operador = OPERADORES_COMPARACION[t.valor];
      this.avanzar();
      return { tipo: "comparacion", operador, izq, der: this.parseUnario() };
    }
    return izq;
  }

  private parseUnario(): Expresion {
    if (this.coincide("NOT")) {
      this.avanzar();
      const operando = this.parseUnario();
      // NOT sobre una lectura de variable = contacto normalmente cerrado.
      if (operando.tipo === "contacto_na") {
        return { tipo: "contacto_nc", variable: operando.variable };
      }
      return { tipo: "not", operando };
    }
    return this.parsePrimario();
  }

  private parsePrimario(): Expresion {
    const t = this.peek();

    if (this.coincide("TRUE")) {
      this.avanzar();
      return { tipo: "literal", valor: true };
    }
    if (this.coincide("FALSE")) {
      this.avanzar();
      return { tipo: "literal", valor: false };
    }
    if (t.tipo === "NUMBER") {
      this.avanzar();
      return { tipo: "literal", valor: Number(t.valor) };
    }
    if (t.tipo === "TIME") {
      this.avanzar();
      return { tipo: "literal", valor: tiempoAMilisegundos(t.valor) };
    }
    if (this.coincide("(")) {
      this.avanzar();
      const e = this.parseExpresion();
      this.consumir(")", "Se esperaba ')' para cerrar la expresión");
      return e;
    }
    if (t.tipo === "IDENT") {
      this.avanzar();
      // Una lectura de variable en una expresión se modela como contacto NA.
      return { tipo: "contacto_na", variable: t.valor };
    }

    throw this.error("Se esperaba una expresión");
  }
}
