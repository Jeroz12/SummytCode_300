# firmware-runtime/ — Runtime base del PLC

## Propósito
El **runtime** es el código C que vive permanentemente en el MCU. Implementa el ciclo de scan del PLC (leer entradas → ejecutar lógica → escribir salidas, §2) y las **primitivas** que el código generado usa: la base de tiempo (`plc_millis`) y los bloques con estado (`TON`, `CTU`).

Existe **separado del programa generado** por una razón clave: el runtime es fijo y se escribe/valida una vez por familia de MCU; el `plc_program.c` cambia con cada programa del usuario y lo produce el compilador (`compiler-core/src/codegen/`). El generador solo rellena cuatro funciones (`plc_io_init`, `plc_read_inputs`, `plc_write_outputs`, `plc_program`) que el runtime declara e invoca.

## Estructura

```
firmware-runtime/
├── README.md
└── avr/                  # ATmega328p / Arduino Uno (v1)
    ├── plc_runtime.h     # tipos base, structs TON_t/CTU_t, prototipos
    ├── plc_runtime.c     # plc_millis (ISR Timer1), TON_update, CTU_update
    └── main.c            # setup()/loop() + ciclo de scan
```

El código generado hace `#include "plc_runtime.h"`. Al compilar para Arduino Uno se enlazan `plc_program.c` (generado) + `plc_runtime.c` + `main.c`.

## Ciclo de scan

```
        ┌───────────────────────────────────────────┐
        │                setup()                     │
        │   plc_runtime_init()  → Timer1 = base ms   │
        │   plc_io_init()       → pinMode de cada I/O │
        └───────────────────────────────────────────┘
                          │
                          ▼
        ┌───────────────────────────────────────────┐
   ┌───▶│                loop()                      │
   │    │   1. plc_read_inputs()   pines → variables │
   │    │   2. plc_program()       lógica (memoria)  │
   │    │   3. plc_write_outputs() variables → pines │
   │    └───────────────────────────────────────────┘
   └────────────────────  repite  ──────────────────┘
```

**El orden read → program → write es fundamental.** La lógica se evalúa contra una *imagen* de las entradas tomada al inicio del ciclo; así una misma entrada tiene un único valor estable durante todo el ciclo, aunque el hardware cambie a mitad de la evaluación. Leer el pin directamente en cada uso rompería el determinismo (glitches / condiciones de carrera). Es el modelo de IEC 61131-3.

## TON y CTU (semántica IEC 61131-3)

Ambos son **retentivos de estado entre ciclos** (por eso son structs, no variables locales) y detectan **flancos** comparando contra el valor anterior guardado en campos privados (`_last_in`, `_last_cu`).

### `TON_update(TON_t* t, BOOL in, TIME_MS pt_ms)` — Timer On-Delay
- **Flanco ascendente de IN (0→1):** guarda `plc_millis()` en `_start_ms`, pone `ET=0`, `Q=0`.
- **IN sostenido en TRUE:** `ET = plc_millis() - _start_ms`; cuando `ET >= pt_ms` → `Q=1`.
- **IN en FALSE:** reinicia (`Q=0`, `ET=0`) — no retentivo al bajar.

### `CTU_update(CTU_t* c, BOOL cu, BOOL reset, INT pv)` — Counter Up
- **reset=1:** `CV=0`, `Q=0`.
- **Flanco ascendente de CU (0→1) con reset=0:** `CV++`.
- Siempre: `Q = (CV >= pv)`; guarda `_last_cu = cu`.

Se leen sus salidas por los campos del struct: `Timer1.Q`, `Timer1.ET`, `Cont1.CV`.

## `plc_millis()` — por qué es ISR-based

La base de tiempo se cuenta con el **Timer1 en modo CTC**, configurado para disparar `ISR(TIMER1_COMPA_vect)` cada 1 ms (`OCR1A = 16MHz/64/1000 - 1 = 249`). La ISR solo incrementa un `volatile uint32_t`.

- **Por interrupción** (no polling) para que el conteo de tiempo sea independiente de cuánto tarde el ciclo de scan: aunque `plc_program()` sea largo, los ms no se pierden.
- La lectura de `plc_millis()` **deshabilita interrupciones brevemente** (`cli`/restaurar `SREG`) porque el contador es de 32 bits y un AVR de 8 bits no lo lee de forma atómica: sin esa protección, la ISR podría modificarlo a media lectura.
- Usa **Timer1** para no chocar con Timer0 (que el core de Arduino usa para su propio `millis()`).

## Cómo agregar soporte para otra familia de MCU

1. Crear una carpeta hermana (`stm32/`, `esp32/`, …).
2. Reimplementar **solo** `plc_runtime.c` con la HAL de esa familia:
   - `plc_millis()` con su timer/SysTick.
   - `plc_runtime_init()` con la config de reloj/timer.
   - `TON_update` / `CTU_update` (la lógica IEC es idéntica; suele copiarse tal cual).
3. Mantener `plc_runtime.h` con los **mismos tipos y prototipos** (el código generado no debe notar la diferencia).
4. Registrar las plantillas en el archivo de familia correspondiente (`mcu_families/*.json`, campo `plantilla_codegen`, §7.1) y añadir el `TargetConfig` equivalente en `compiler-core/src/codegen/targets/`.

Así, dar soporte a una familia nueva no toca el compilador ni el programa del usuario: solo se reimplementa este runtime.

## Restricciones

- **Sin memoria dinámica** (`malloc`/`new`): AVR tiene ~2 KB de RAM y el runtime debe ser determinístico. Todo estado son structs por valor.
- Las funciones `digitalRead`/`digitalWrite`/`pinMode`/`analogRead` usadas por el código generado provienen de una HAL estilo Arduino (ver *Limitaciones* en el README raíz / codegen).
