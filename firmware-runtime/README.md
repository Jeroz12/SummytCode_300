# firmware-runtime/ — Plantillas base de firmware

## Propósito
Contiene el runtime en C que se ejecuta en el MCU: el ciclo de scan del PLC (leer entradas → ejecutar lógica → escribir salidas, sección 2) y las plantillas parametrizables que el codegen (`compiler-core/codegen/`) combina con el código generado a partir del programa del usuario.

## Archivos esperados
- `common/` — código C compartido entre familias de MCU: estructuras de `TON`/`CTU`, tipos base (`BOOL`, `INT`, `TIME`), utilidades de edge detection.
- `avr/` — plantillas específicas para ATmega328 (Arduino Uno), v1:
  - `stm32_gpio_init.c.template`-equivalente para AVR (p. ej. `avr_gpio_init.c.template`).
  - `avr_scan_cycle.c.template` — bucle principal del ciclo de scan.
  - `avr_runtime.c.template` — base del runtime (setup, main loop, timers HW).
- `stm32/`, `esp32/` — futuro (Fases 4 y 5), estructura análoga a `avr/`.

Estas plantillas son referenciadas desde `mcu_families/*.json` en el campo `plantilla_codegen` (sección 7.1).

## Notas técnicas
- El runtime debe implementar fielmente la semántica de scan cycle de IEC 61131-3 (sección 12): lectura atómica de entradas al inicio del ciclo, ejecución de la lógica sobre esa copia, escritura de salidas al final.
- `TON` y `CTU` son las únicas instrucciones con estado propio en v1 (sección 5.2/5.3); su implementación en C vive aquí, no en el código generado por network.
- Mantener el runtime mínimo y portable en `common/` para facilitar el soporte de nuevas familias de MCU sin reescribir la lógica de negocio del PLC.
