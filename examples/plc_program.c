/* Generado automáticamente por PLC IDE — Agrupación */
/* Programa: Enclavamiento 3 ramas | Target: avr_atmega328 */
/* NO EDITAR MANUALMENTE */

#include "plc_runtime.h"
#include <avr/io.h>
#include <util/delay.h>
#include <stdint.h>
#include <stdbool.h>

/* ── VARIABLES DEL PROGRAMA ── */
uint8_t Start = 0;
uint8_t Manual = 0;
uint8_t Stop = 0;
uint8_t Motor = 0;

/* ── INSTANCIAS DE TIMERS/CONTADORES ── */
/* (sin timers ni contadores) */

/* ── INICIALIZACIÓN DE I/O ── */
void plc_io_init(void) {
}

/* ── LECTURA DE ENTRADAS ── */
void plc_read_inputs(void) {
}

/* ── ESCRITURA DE SALIDAS ── */
void plc_write_outputs(void) {
}

/* ── LÓGICA DEL PROGRAMA ── */
void plc_program(void) {
  /* Network 1 */
  Motor = (((Start && (!Stop)) || (Motor && (!Stop))) || (Manual && (!Stop)));
}
