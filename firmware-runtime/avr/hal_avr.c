/*
 * hal_avr.c — Implementación de la HAL nativa (ATmega328p @ 16 MHz)
 * ----------------------------------------------------------------
 * Acceso directo a registros: DDRx (dirección), PORTx (salida/pull-up),
 * PINx (lectura de entrada) y el ADC. Sin dependencias del core de Arduino
 * y sin memoria dinámica.
 */
#include "hal_avr.h"

/* Tabla de mapeo pin Arduino → {puerto, bit}. Una sola instancia (const). */
const hal_pin_t hal_pin_map[HAL_NUM_PINS] = {
  /* D0..D7 → PORTD 0..7 */
  {HAL_PORT_D, 0}, {HAL_PORT_D, 1}, {HAL_PORT_D, 2}, {HAL_PORT_D, 3},
  {HAL_PORT_D, 4}, {HAL_PORT_D, 5}, {HAL_PORT_D, 6}, {HAL_PORT_D, 7},
  /* D8..D13 → PORTB 0..5 */
  {HAL_PORT_B, 0}, {HAL_PORT_B, 1}, {HAL_PORT_B, 2}, {HAL_PORT_B, 3},
  {HAL_PORT_B, 4}, {HAL_PORT_B, 5},
  /* A0..A5 (índices 14..19) → PORTC 0..5 */
  {HAL_PORT_C, 0}, {HAL_PORT_C, 1}, {HAL_PORT_C, 2}, {HAL_PORT_C, 3},
  {HAL_PORT_C, 4}, {HAL_PORT_C, 5},
};

/* Resuelven el índice de puerto al registro concreto. */
static volatile uint8_t* ddr_de(uint8_t puerto) {
  switch (puerto) {
    case HAL_PORT_B: return &DDRB;
    case HAL_PORT_C: return &DDRC;
    case HAL_PORT_D: return &DDRD;
  }
  return 0;
}

static volatile uint8_t* port_de(uint8_t puerto) {
  switch (puerto) {
    case HAL_PORT_B: return &PORTB;
    case HAL_PORT_C: return &PORTC;
    case HAL_PORT_D: return &PORTD;
  }
  return 0;
}

static volatile uint8_t* pin_de(uint8_t puerto) {
  switch (puerto) {
    case HAL_PORT_B: return &PINB;
    case HAL_PORT_C: return &PINC;
    case HAL_PORT_D: return &PIND;
  }
  return 0;
}

void pinMode_hal(uint8_t pin, uint8_t mode) {
  if (pin >= HAL_NUM_PINS) return;
  const hal_pin_t p = hal_pin_map[pin];
  volatile uint8_t* ddr = ddr_de(p.puerto);
  volatile uint8_t* port = port_de(p.puerto);

  if (mode == HAL_OUTPUT) {
    *ddr |= (uint8_t)(1 << p.bit);         /* DDR bit = 1 → salida */
  } else {
    *ddr &= (uint8_t)~(1 << p.bit);        /* DDR bit = 0 → entrada */
    *port &= (uint8_t)~(1 << p.bit);       /* PORT bit = 0 → sin pull-up */
  }
}

void digitalWrite_hal(uint8_t pin, uint8_t value) {
  if (pin >= HAL_NUM_PINS) return;
  const hal_pin_t p = hal_pin_map[pin];
  volatile uint8_t* ddr = ddr_de(p.puerto);

  /* Comportamiento seguro: solo escribe si el pin está configurado como salida. */
  if (!(*ddr & (uint8_t)(1 << p.bit))) return;

  volatile uint8_t* port = port_de(p.puerto);
  if (value == HAL_LOW) {
    *port &= (uint8_t)~(1 << p.bit);
  } else {
    *port |= (uint8_t)(1 << p.bit);
  }
}

BOOL digitalRead_hal(uint8_t pin) {
  if (pin >= HAL_NUM_PINS) return 0;
  const hal_pin_t p = hal_pin_map[pin];
  volatile uint8_t* pinreg = pin_de(p.puerto);
  /* Se lee PINx (no PORTx): PINx refleja el estado eléctrico real del pin. */
  return (BOOL)((*pinreg >> p.bit) & 0x01);
}

INT analogRead_hal(uint8_t canal) {
  static uint8_t adc_iniciado = 0;

  if (!adc_iniciado) {
    /* ADEN habilita el ADC; prescaler 128 → 16 MHz / 128 = 125 kHz,
       dentro del rango recomendado de 50–200 kHz del datasheet. */
    ADCSRA = (uint8_t)((1 << ADEN) | (1 << ADPS2) | (1 << ADPS1) | (1 << ADPS0));
    adc_iniciado = 1;
  }

  /* REFS0 = referencia AVcc (5 V en el Uno); canal 0..7 en los bits bajos. */
  ADMUX = (uint8_t)((1 << REFS0) | (canal & 0x07));

  ADCSRA |= (uint8_t)(1 << ADSC);       /* inicia conversión */
  while (ADCSRA & (uint8_t)(1 << ADSC)) {
    /* Lectura bloqueante — aceptable en el MVP.
       Para uso avanzado: conversión por interrupción (ADC_vect). */
  }

  return (INT)ADC;                      /* resultado de 10 bits: 0..1023 */
}

/*
 * ── Notas educativas (para los cachimbos) ──────────────────────────────
 *
 * ¿Por qué se lee PINx y no PORTx?
 *   En el AVR cada puerto tiene TRES registros: DDRx (dirección), PORTx y PINx.
 *   - Al ESCRIBIR, PORTx fija el nivel de salida (o activa el pull-up si el pin
 *     es entrada). Leer PORTx devuelve lo que TÚ escribiste, no el pin real.
 *   - PINx es de solo lectura y refleja el VOLTAJE real presente en el pin.
 *   Por eso una entrada siempre se lee con PINx.
 *
 * ¿Qué es DDRx y cómo fija la dirección?
 *   DDRx = Data Direction Register. Cada bit controla un pin del puerto:
 *   bit = 1 → el pin es SALIDA; bit = 0 → el pin es ENTRADA. Por eso pinMode
 *   solo manipula un bit de DDRx.
 *
 * ¿Por qué prescaler 128 para el ADC a 16 MHz?
 *   El ADC necesita un reloj de 50–200 kHz para su máxima resolución (10 bits).
 *   16 MHz / 128 = 125 kHz, que cae en ese rango. Un prescaler menor daría un
 *   reloj demasiado rápido y perdería precisión.
 */
