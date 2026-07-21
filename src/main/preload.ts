import { contextBridge } from "electron";
import { STParser } from "../../compiler-core/src/parsers/st_parser";
import type { BoardDefinition, ParseResult, PlcAPI } from "../shared/types";

/**
 * Puente seguro main ↔ renderer (contextIsolation activado).
 * `parseSTCode` es real (usa el compiler-core); el resto son stubs con datos mock
 * hasta que existan el lector de placas y la enumeración de puertos serie.
 */
const api: PlcAPI = {
  parseSTCode(code: string): Promise<ParseResult> {
    try {
      const ast = new STParser().parse(code);
      return Promise.resolve({ success: true, ast });
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : String(err);
      return Promise.resolve({ success: false, errors: [mensaje] });
    }
  },

  getBoards(): Promise<BoardDefinition[]> {
    return Promise.resolve([{ board_id: "arduino_uno", nombre_visible: "Arduino Uno" }]);
  },

  getSerialPorts(): Promise<string[]> {
    return Promise.resolve(["COM3", "COM4"]);
  },
};

contextBridge.exposeInMainWorld("plcAPI", api);
