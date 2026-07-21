/**
 * Punto de entrada público de @plc-ide/compiler-core.
 * Reexporta los tipos del AST, los parsers y el generador de código C.
 */
export * from "./ast/types";
export { STParser } from "./parsers/st_parser";
export * from "./ladder/types";
export { traducirLadderAAST } from "./ladder/ladder_translator";

// Codegen (AST → C)
export { CGenerator } from "./codegen/c_generator";
export type { CodegenResult, GeneratedFile, TargetConfig, BoardJson, BoardIOChannel } from "./codegen/types";
export { avrAtmega328Target } from "./codegen/targets/avr_atmega328";
export { emitirExpresion, sanitizarNombre } from "./codegen/helpers/expression_emitter";
