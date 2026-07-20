# src-tauri/ — Backend (Rust / Tauri)

## Propósito
Backend nativo de la aplicación de escritorio, construido sobre Tauri. Es responsable de todo lo que el frontend (React) no puede o no debe hacer directamente en el navegador embebido: orquestar la compilación, invocar toolchains externos, flashear el MCU y comunicarse por puerto serie.

## Subcarpetas y archivos esperados

### `compiler/`
Orquesta el pipeline de compilación descrito en la sección 3 de la especificación:
`Editor → Parser → AST → Validación semántica → Codegen C → Compilador embebido → Binario`.
No contiene el parser ni el codegen en sí (eso vive en `compiler-core/`), sino los comandos Tauri (`#[tauri::command]`) que invocan esa lógica y devuelven resultados/errores al frontend.

Archivos esperados:
- `mod.rs` — punto de entrada del módulo.
- `commands.rs` — comandos expuestos al frontend (`compilar_proyecto`, `validar_ast`, etc.).
- `errors.rs` — tipos de error de compilación con mensajes pedagógicos (ver sección 3).

### `toolchain/`
Gestión de los compiladores y herramientas de flasheo empaquetados dentro del instalador (sección 2.1):
- AVR: `avr-gcc` + `avrdude`.
- STM32 (futuro): `arm-none-eabi-gcc` + `stm32flash`/`st-link`.
- ESP32 (futuro): `esp-idf` / `xtensa-esp32-elf-gcc`.

Archivos esperados:
- `mod.rs`
- `avr.rs` — invocación de `avr-gcc`/`avrdude` para Arduino Uno (v1).
- `paths.rs` — resolución de rutas a binarios empaquetados según plataforma (Windows/Linux/Mac).

### `serial/`
Comunicación con el MCU por puerto serie: flasheo (v1) y monitoreo en vivo (fase 3), según sección 8.

Archivos esperados:
- `mod.rs`
- `ports.rs` — listado y apertura de puertos COM/tty disponibles.
- `monitor.rs` — lectura/escritura de variables en tiempo real (Modbus u otro protocolo, fase 3).

## Notas técnicas
- Rust es responsable de todo acceso a filesystem, procesos externos y hardware — el frontend nunca invoca toolchains directamente.
- Los comandos Tauri deben devolver errores estructurados (no strings crudos) para que el frontend pueda mostrar mensajes claros en la consola de la IDE.
- Mantener este backend agnóstico del lenguaje fuente (Ladder/ST/FBD): solo trabaja con el AST y el C generado, nunca con sintaxis específica de un editor.
