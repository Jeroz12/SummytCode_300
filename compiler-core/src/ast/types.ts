/**
 * Tipos del AST intermedio (compiler-core)
 * -----------------------------------------
 * Modelo conceptual basado en IEC 61131-3 (ver §4 de la especificación).
 *
 * Este AST es el punto de convergencia de todos los lenguajes fuente:
 *   - ST      → se parsea casi 1:1 (ver st_parser.ts)
 *   - Ladder  → se traduce (contactos serie = AND, paralelo = OR, NC = NOT, bobina = asignación)
 *   - FBD     → futuro (Fase 6)
 *
 * El codegen consume ÚNICAMENTE estas estructuras, nunca la sintaxis fuente.
 */

/** Tipos de dato soportados en v1 (§5.1) más los tipos de bloque con estado. */
export type TipoDato = "BOOL" | "INT" | "TIME" | "TON" | "CTU";

/** Clase de variable según POU de IEC 61131-3. */
export type ClaseVariable = "VAR" | "VAR_INPUT" | "VAR_OUTPUT";

/** Declaración de una variable del programa. */
export interface VariableDeclaration {
  nombre: string;
  tipo: TipoDato;
  clase: ClaseVariable;
  /** Dirección IEC opcional, ej. "%IX0.0". El mapeo a pin físico vive en boards/. */
  direccion_iec?: string;
  /** Valor inicial opcional (bool para BOOL, número para INT/TIME-en-ms). */
  valor_inicial?: boolean | number;
}

// --- Nodos de expresión --------------------------------------------------

/** Contacto normalmente abierto —| |— : lee el valor de la variable. */
export interface ContactoNA {
  tipo: "contacto_na";
  variable: string;
}

/** Contacto normalmente cerrado —|/|— : lee el valor negado de la variable. */
export interface ContactoNC {
  tipo: "contacto_nc";
  variable: string;
}

/** Bobina —( )— : asigna el resultado del rung a la variable. `negar` = bobina —(/)—. */
export interface Bobina {
  tipo: "bobina";
  variable: string;
  negar?: boolean;
}

/** Bobina SET —(S)— : enclava la salida en TRUE. */
export interface BobinaSet {
  tipo: "bobina_s";
  variable: string;
}

/** Bobina RESET —(R)— : enclava la salida en FALSE. */
export interface BobinaReset {
  tipo: "bobina_r";
  variable: string;
}

/** Operación binaria lógica: contactos en serie (AND) o en paralelo (OR). */
export interface BinOp {
  tipo: "and" | "or";
  izq: Expresion;
  der: Expresion;
}

/** Negación lógica NOT. */
export interface Not {
  tipo: "not";
  operando: Expresion;
}

/** Comparación entre dos expresiones (§5.3). */
export interface Comparacion {
  tipo: "comparacion";
  operador: "==" | "!=" | "<" | ">" | "<=" | ">=";
  izq: Expresion;
  der: Expresion;
}

/** Asignación `variable := valor;` (bobina en términos de Ladder). */
export interface Asignacion {
  tipo: "asignacion";
  variable: string;
  valor: Expresion;
}

/**
 * Timer On-Delay: TON(IN, PT, Q, ET) (§5.3). `pt_ms` = preset en milisegundos.
 * `in` es la CONDICIÓN de entrada (una expresión booleana completa, no solo una
 * variable), lo que permite entradas compuestas como `Sensor1 AND NOT Sensor2`.
 * `q_var` / `et_var` son SALIDAS (nombres de variable donde se escribe el resultado).
 */
export interface Ton {
  tipo: "ton";
  in: Expresion;
  pt_ms: number;
  q_var: string;
  et_var?: string;
}

/**
 * Counter Up: CTU(CU, RESET, PV, Q, CV) (§5.3).
 * `cu` (pulso de conteo) y `reset` son CONDICIONES de entrada (expresiones
 * booleanas completas). `q_var` / `cv_var` son SALIDAS (nombres de variable).
 */
export interface Ctu {
  tipo: "ctu";
  cu: Expresion;
  reset: Expresion;
  pv: number;
  q_var: string;
  cv_var?: string;
}

/** Literal booleano o numérico. */
export interface Literal {
  tipo: "literal";
  valor: boolean | number;
}

/** Unión de todos los nodos de expresión posibles del AST. */
export type Expresion =
  | ContactoNA
  | ContactoNC
  | Bobina
  | BobinaSet
  | BobinaReset
  | BinOp
  | Not
  | Comparacion
  | Asignacion
  | Ton
  | Ctu
  | Literal;

// --- Estructura de programa ---------------------------------------------

/** Un Network equivale a un "rung" de Ladder: una o más bobinas y su lógica. */
export interface Network {
  id: number;
  expresiones: Expresion[];
}

/** POU (Program Organization Unit): el programa completo. */
export interface Programa {
  nombre: string;
  variables: VariableDeclaration[];
  networks: Network[];
  lenguaje_fuente: "ladder" | "st";
}
