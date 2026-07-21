/**
 * Punto de entrada público de @plc-ide/compiler-core.
 * Reexporta los tipos del AST y los parsers disponibles.
 */
export * from "./ast/types";
export { STParser } from "./parsers/st_parser";
export * from "./ladder/types";
export { traducirLadderAAST } from "./ladder/ladder_translator";
