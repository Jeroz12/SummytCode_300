/*
 * main.c — Punto de entrada y ciclo de scan del PLC (AVR)
 * -------------------------------------------------------
 * Un PLC ejecuta su lógica en CICLOS DE SCAN. Cada ciclo consta de tres fases
 * en un orden que NO es negociable:
 *
 *     ┌──────────────────────────────────────────────────────────┐
 *     │  1. READ    → se copian TODAS las entradas físicas a una  │
 *     │               "imagen" en memoria (variables).            │
 *     │  2. PROGRAM → la lógica se evalúa SOLO contra esa imagen,  │
 *     │               nunca leyendo pines en medio del cálculo.   │
 *     │  3. WRITE   → los resultados en memoria se vuelcan a las   │
 *     │               salidas físicas de una sola vez.            │
 *     └──────────────────────────────────────────────────────────┘
 *
 * ¿Por qué este orden importa? Porque garantiza COHERENCIA: durante un mismo
 * ciclo, una entrada tiene un único valor estable aunque el hardware cambie a
 * mitad de la evaluación. Si se leyera el pin en cada uso, la misma entrada
 * podría valer distinto en dos puntos de la lógica y producir comportamientos
 * no determinísticos (glitches, condiciones de carrera). Es el modelo clásico
 * de IEC 61131-3.
 *
 * setup()/loop() siguen la convención Arduino. main() las orquesta para que el
 * firmware funcione también bajo un build de avr-gcc directo.
 * (Bajo el core de Arduino —que ya define main()— este main() debe excluirse.)
 */
#include "plc_runtime.h"

/* Se ejecuta una vez al arrancar. */
void setup(void) {
  plc_runtime_init();  /* base de tiempo (Timer1 → plc_millis) */
  plc_io_init();       /* configura pines (generado por el compilador) */
}

/* Un ciclo de scan del PLC. */
void loop(void) {
  plc_read_inputs();   /* 1. entradas físicas  → variables */
  plc_program();       /* 2. lógica del usuario (solo memoria) */
  plc_write_outputs(); /* 3. variables → salidas físicas */
}

int main(void) {
  setup();
  for (;;) {
    loop();
  }
  return 0; /* inalcanzable */
}
