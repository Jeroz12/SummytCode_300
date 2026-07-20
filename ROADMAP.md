# Roadmap

Fases del proyecto según la sección 11 de la [especificación técnica](./Especificacion_Tecnica_PLC_IDE.md). El cronograma es una propuesta sugerida y debe ajustarse según disponibilidad del equipo (proyecto interno de agrupación, ritmo no full-time).

| Fase | Alcance | Duración estimada | Cronograma sugerido |
|---|---|---|---|
| **Fase 1** | AST + parser ST → codegen C → compilar y flashear en Arduino Uno | 6–8 semanas | Jul 2026 – Sep 2026 |
| **Fase 2** | Editor Ladder (traducción a AST) | 4–6 semanas | Sep 2026 – Oct 2026 |
| **Fase 3** | Monitoreo en vivo vía serial/Modbus | 3–4 semanas | Nov 2026 |
| **Fase 4** | Soporte STM32 (nueva familia + placas propias) | 6–8 semanas | Dic 2026 – Feb 2027 |
| **Fase 5** | Soporte ESP32 + comunicación por conector único (RS485/Ethernet) | 6–8 semanas | Mar 2027 – Abr 2027 |
| **Fase 6** | Editor FBD | 4–6 semanas | May 2027 – Jun 2027 |

## Detalle por fase

### Fase 1 — Núcleo del compilador y Arduino Uno
- Definir el AST (`compiler-core/ast/`) basado en IEC 61131-3 (sección 4).
- Implementar el parser de ST (`compiler-core/parsers/st_parser/`) para el set de instrucciones v1 (sección 5).
- Implementar el generador de código C para AVR (`compiler-core/codegen/target_avr/`) y el runtime base (`firmware-runtime/`).
- Integrar `avr-gcc` + `avrdude` en el backend Tauri (`src-tauri/toolchain/`, `src-tauri/compiler/`).
- Definir `mcu_families/atmega328.json` y `boards/arduino_uno.json` (sección 7).
- Validación semántica con mensajes pedagógicos (sección 3).

### Fase 2 — Editor Ladder
- Canvas interactivo (`src/editors/ladder/`) con React Flow o Konva.js.
- Elementos v1: contactos NA/NC, bobinas simple/negada/SET/RESET, combinaciones serie/paralelo, TON, CTU (sección 5.2).
- Traductor Ladder → AST (`compiler-core/parsers/ladder_translator/`).

### Fase 3 — Monitoreo en vivo
- Comunicación serial en tiempo real (`src-tauri/serial/monitor.rs`).
- Evaluar Modbus (TCP/RTU) como protocolo, siguiendo precedente de OpenPLC (sección 8).
- Vista de monitoreo en el frontend (`src/monitor/`).

### Fase 4 — Soporte STM32
- Nuevo archivo de familia `mcu_families/stm32f1.json` (sección 7.1).
- Nuevo target de codegen `compiler-core/codegen/target_stm32/`.
- Placas propias de la agrupación (`boards/agrupacion_board_v1.json` o similar).
- Métodos de flasheo adicionales: `usb_dfu`, `stlink_swd`, `serial_bootloader`.

### Fase 5 — Soporte ESP32 y conector único
- Nuevo archivo de familia `mcu_families/esp32.json`.
- Comunicación unificada por un solo conector físico (RS485 o Ethernet) para programación y monitoreo simultáneos (sección 8).

### Fase 6 — Editor FBD
- Editor de bloques (`src/editors/fbd/`), inspirado en la UX de Node-RED (sección 13).
- Extensión del AST para representar conexiones nodo-a-nodo (sección 4).

## Fuera de alcance hasta nuevo aviso
`TOF`, `TP`, `CTD`, tipo `REAL`, arrays, Function Blocks definidos por el usuario (sección 5.4) — se evaluará su incorporación una vez completadas las 6 fases anteriores.
