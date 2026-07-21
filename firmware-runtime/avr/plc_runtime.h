/*
 * plc_runtime.h — Runtime base del PLC IDE (AVR / ATmega328p)
 * -----------------------------------------------------------
 * Declara los tipos base, los bloques con estado (TON/CTU) y las primitivas
 * del runtime que el código generado (plc_program.c) usa. El runtime vive
 * permanentemente en el MCU; el programa del usuario se genera aparte.
 *
 * Sin memoria dinámica: todos los estados son structs por valor (AVR = 2KB RAM).
 */
#ifndef PLC_RUNTIME_H
#define PLC_RUNTIME_H

#include <stdint.h>

/* ── Tipos base (IEC 61131-3 acotado a v1, §5.1) ── */
typedef uint8_t  BOOL;     /* 0 = FALSE, distinto de 0 = TRUE */
typedef int16_t  INT;      /* entero con signo de 16 bits     */
typedef uint32_t TIME_MS;  /* tiempo en milisegundos          */

/* ── Timer On-Delay (TON) ── */
typedef struct {
  BOOL    Q;          /* salida: TRUE cuando ET >= PT           */
  TIME_MS ET;         /* elapsed time en ms                     */
  TIME_MS _start_ms;  /* privado: timestamp del flanco de IN    */
  BOOL    _last_in;   /* privado: valor anterior de IN          */
} TON_t;

/* ── Counter Up (CTU) ── */
typedef struct {
  BOOL Q;         /* salida: TRUE cuando CV >= PV        */
  INT  CV;        /* current value (conteo actual)      */
  BOOL _last_cu;  /* privado: valor anterior de CU      */
} CTU_t;

/* ── Primitivas del runtime ── */
void    plc_runtime_init(void);
TIME_MS plc_millis(void);
void    TON_update(TON_t* t, BOOL in, TIME_MS pt_ms);
void    CTU_update(CTU_t* c, BOOL cu, BOOL reset, INT pv);

/* ── Funciones que IMPLEMENTA el programa generado (plc_program.c) ── */
void plc_io_init(void);
void plc_read_inputs(void);
void plc_write_outputs(void);
void plc_program(void);

/* ── HAL nativa AVR (registros directos, sin core de Arduino) ── */
#include "hal_avr.h"

/* Compatibilidad: el código generado por CGenerator usa los nombres Arduino
   (pinMode, digitalWrite, digitalRead, analogRead) sin sufijo. Estas macros los
   redirigen de forma transparente a la HAL nativa, sin tocar el generador. */
#define pinMode(pin, mode)     pinMode_hal((pin), (mode))
#define digitalWrite(pin, val) digitalWrite_hal((pin), (val))
#define digitalRead(pin)       digitalRead_hal((pin))
#define analogRead(pin)        analogRead_hal((pin))

#endif /* PLC_RUNTIME_H */
