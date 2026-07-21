import type { TargetConfig } from "../types";

/**
 * Configuración de generación para AVR ATmega328p (Arduino Uno), el único target v1.
 * Usa la HAL estilo Arduino (digitalRead/digitalWrite/pinMode/analogRead) y la
 * función de tiempo `plc_millis()` provista por el firmware-runtime.
 */
export const avrAtmega328Target: TargetConfig = {
  familia: "avr_atmega328",
  include_hal: ["<avr/io.h>", "<util/delay.h>", "<stdint.h>", "<stdbool.h>"],
  tipo_bool: "uint8_t",
  tipo_int: "int16_t",
  tipo_time_ms: "uint32_t",
  get_time_ms: "plc_millis()",
  digital_read: "digitalRead({pin})",
  digital_write: "digitalWrite({pin}, {value})",
  analog_read: "analogRead({pin})",
  init_input: "pinMode({pin}, INPUT)",
  init_output: "pinMode({pin}, OUTPUT)",
};
