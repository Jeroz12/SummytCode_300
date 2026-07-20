# mcu_families/ — Definiciones de familias de MCU

## Propósito
Nivel genérico del sistema de definición de hardware (sección 7). Cada archivo describe **cómo se compila y qué HAL se usa** para una familia de microcontroladores, de forma independiente de cualquier placa física concreta. Las placas (`boards/`) heredan de estos archivos.

## Archivos esperados
Un archivo JSON por familia soportada, siguiendo el esquema de la sección 7.1:

- `atmega328.json` — familia del Arduino Uno, única soportada en v1 (sección 1.2).
- `stm32f1.json` — futuro, Fase 4 (sección 11). Ejemplo completo del esquema en la sección 7.1 de la especificación.
- `esp32.json` — futuro, Fase 5.

Cada archivo debe incluir, como mínimo:
```json
{
  "familia_id": "...",
  "nombre_visible": "...",
  "arquitectura": "...",
  "toolchain": { "compilador": "...", "flags_base": [...], "linker_script": "...", "libreria_hal": "..." },
  "metodo_flasheo": { "protocolos_soportados": [...], "herramienta": "..." },
  "capacidades": { "gpio_digital": true, "adc": {...}, "pwm": {...}, "comunicacion": [...], "timers_hw": 0 },
  "plantilla_codegen": { "init_gpio": "...", "scan_cycle": "...", "runtime_base": "..." },
  "restricciones": { "ram_reservada_runtime_bytes": 0, "flash_reservada_bootloader_kb": 0 }
}
```

## Notas técnicas
- `plantilla_codegen` referencia archivos de plantilla ubicados en `firmware-runtime/`.
- Agregar soporte a una familia de MCU completamente nueva implica crear **un único archivo aquí**; ninguna placa existente ni el compilador deben modificarse (sección 7.5).
- Los campos de `capacidades` acotan qué instrucciones/tipos del set v1 (sección 5) son válidos al compilar para esa familia (p. ej., validar que no se use PWM si `pwm` no está definido).
