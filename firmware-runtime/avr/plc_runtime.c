/*
 * plc_runtime.c — Implementación del runtime base (AVR / ATmega328p @ 16 MHz)
 * ---------------------------------------------------------------------------
 * - plc_millis(): base de tiempo por interrupción (Timer1 en modo CTC, 1 ms).
 * - TON_update / CTU_update: semántica IEC 61131-3 exacta, sin memoria dinámica.
 */
#include "plc_runtime.h"
#include <avr/io.h>
#include <avr/interrupt.h>

/* Contador de milisegundos incrementado por la ISR del Timer1. */
static volatile TIME_MS _plc_ms_count = 0;

/* ISR: se dispara cada 1 ms (ver plc_runtime_init). */
ISR(TIMER1_COMPA_vect) {
  _plc_ms_count++;
}

TIME_MS plc_millis(void) {
  TIME_MS ms;
  uint8_t sreg = SREG;
  /* Lectura atómica: _plc_ms_count es de 32 bits y la ISR puede modificarlo
     a media lectura en un AVR de 8 bits. */
  cli();
  ms = _plc_ms_count;
  SREG = sreg;
  return ms;
}

void plc_runtime_init(void) {
  /* Timer1 en modo CTC, disparo cada 1 ms a 16 MHz:
       OCR1A = (F_CPU / prescaler / 1000) - 1 = (16e6 / 64 / 1000) - 1 = 249 */
  TCCR1A = 0;
  TCCR1B = (1 << WGM12) | (1 << CS11) | (1 << CS10); /* CTC, prescaler 64 */
  OCR1A  = 249;
  TIMSK1 = (1 << OCIE1A);                            /* habilita interrupción por comparación */
  sei();                                             /* habilita interrupciones globales */
}

void TON_update(TON_t* t, BOOL in, TIME_MS pt_ms) {
  if (in && !t->_last_in) {
    /* Flanco ascendente de IN (0→1): arranca la temporización. */
    t->_start_ms = plc_millis();
    t->ET = 0;
    t->Q  = 0;
  } else if (in) {
    /* IN sostenido en TRUE: acumula tiempo transcurrido. */
    t->ET = plc_millis() - t->_start_ms;
    if (t->ET >= pt_ms) {
      t->Q = 1;
    }
  } else {
    /* IN en FALSE: reinicia el timer (no retentivo al bajar). */
    t->Q = 0;
    t->ET = 0;
    t->_start_ms = 0;
  }
  t->_last_in = in;
}

void CTU_update(CTU_t* c, BOOL cu, BOOL reset, INT pv) {
  if (reset) {
    c->CV = 0;
    c->Q  = 0;
  } else if (cu && !c->_last_cu) {
    /* Flanco ascendente de CU (0→1) con reset inactivo: incrementa. */
    c->CV++;
  }
  c->Q = (c->CV >= pv) ? 1 : 0;
  c->_last_cu = cu;
}
