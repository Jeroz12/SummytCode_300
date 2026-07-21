/*
 * hal_avr.h — HAL nativa para ATmega328p (Arduino Uno) sin core de Arduino
 * ------------------------------------------------------------------------
 * Reimplementa pinMode/digitalWrite/digitalRead/analogRead directamente con
 * los registros del AVR, para poder compilar con avr-gcc puro (sin el IDE de
 * Arduino). El código generado por el compilador PLC sigue usando los nombres
 * Arduino; las macros de compatibilidad viven en plc_runtime.h.
 *
 * Mapeo de pines Arduino → puerto/bit del ATmega328p:
 *
 *   Pin | Puerto | Bit        Pin | Puerto | Bit
 *   ----+--------+----        ----+--------+----
 *   D0  |   D    |  0         D10 |   B    |  2
 *   D1  |   D    |  1         D11 |   B    |  3
 *   D2  |   D    |  2         D12 |   B    |  4
 *   D3  |   D    |  3         D13 |   B    |  5   (LED integrado / SCK)
 *   D4  |   D    |  4         A0  |   C    |  0
 *   D5  |   D    |  5         A1  |   C    |  1
 *   D6  |   D    |  6         A2  |   C    |  2
 *   D7  |   D    |  7         A3  |   C    |  3
 *   D8  |   B    |  0         A4  |   C    |  4   (SDA / I2C)
 *   D9  |   B    |  1         A5  |   C    |  5   (SCL / I2C)
 *
 * (D0/D1 = RX/TX del USART; A0..A5 = índices 14..19 como pines digitales.)
 */
#ifndef HAL_AVR_H
#define HAL_AVR_H

#include <avr/io.h>
#include <stdint.h>
#include "plc_runtime.h"  /* tipos BOOL / INT */

/* ── Índices de puerto del ATmega328p ── */
#define HAL_PORT_B 0
#define HAL_PORT_C 1
#define HAL_PORT_D 2

/* ── Modos y niveles ── */
#define HAL_INPUT  0
#define HAL_OUTPUT 1
#define HAL_HIGH   1
#define HAL_LOW    0

/* Alias Arduino-compatibles: el código generado usa INPUT/OUTPUT/HIGH/LOW.
   Se protegen con #ifndef por si se compilara junto al core de Arduino. */
#ifndef INPUT
#define INPUT  HAL_INPUT
#endif
#ifndef OUTPUT
#define OUTPUT HAL_OUTPUT
#endif
#ifndef HIGH
#define HIGH   HAL_HIGH
#endif
#ifndef LOW
#define LOW    HAL_LOW
#endif

/* Cantidad de pines digitales mapeados (D0..D13 + A0..A5 = 20). */
#define HAL_NUM_PINS 20

/* Descriptor de un pin: a qué puerto pertenece y en qué bit. */
typedef struct {
  uint8_t puerto;  /* HAL_PORT_B / _C / _D */
  uint8_t bit;     /* 0..7 dentro del puerto */
} hal_pin_t;

/* Tabla de mapeo (definida en hal_avr.c, una sola copia). */
extern const hal_pin_t hal_pin_map[HAL_NUM_PINS];

/* ── Funciones HAL ── */
void pinMode_hal(uint8_t pin, uint8_t mode);
void digitalWrite_hal(uint8_t pin, uint8_t value);
BOOL digitalRead_hal(uint8_t pin);
INT  analogRead_hal(uint8_t canal); /* canal ADC 0..5 (A0..A5) */

#endif /* HAL_AVR_H */
