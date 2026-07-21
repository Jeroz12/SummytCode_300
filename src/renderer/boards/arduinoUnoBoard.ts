import type { BoardJson } from "../../../compiler-core/src";

/**
 * BoardJson hardcodeado para Arduino Uno (mapeo de §7.3 de la especificación).
 * TEMPORAL: cuando exista el sistema de carga de `boards/*.json` reales, esto
 * se reemplaza por la lectura del archivo de placa correspondiente.
 */
export const arduinoUnoBoard: BoardJson = {
  board_id: "arduino_uno",
  canales_io: [
    { direccion_iec: "%IX0.0", modo: "input", pin_fisico: "2", etiqueta_serigrafia: "D2" },
    { direccion_iec: "%IX0.1", modo: "input", pin_fisico: "3", etiqueta_serigrafia: "D3" },
    { direccion_iec: "%QX0.0", modo: "output", pin_fisico: "10", etiqueta_serigrafia: "D10" },
  ],
};
