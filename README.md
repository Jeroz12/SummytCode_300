# PLC IDE

IDE de escritorio para programar microcontroladores usando lenguajes estándar de la industria PLC (**Ladder**, **Structured Text**, y a futuro **FBD**), inspirado en herramientas como TIA Portal, CODESYS y OpenPLC.

Proyecto interno de la agrupación, con fines educativos y de desarrollo propio. Permite compilar y flashear directamente desde la app, sin instalar toolchains externos, y está diseñado desde el inicio para escalar a múltiples familias de MCU y placas personalizadas propias.

Especificación técnica completa: [`Especificacion_Tecnica_PLC_IDE.md`](./Especificacion_Tecnica_PLC_IDE.md).

## Estado actual

**Fase 1 — Inicialización.** Estructura del monorepo definida. Aún no hay código funcional: el foco actual (según el [roadmap](./ROADMAP.md)) es el pipeline `AST + parser ST → codegen C → compilar y flashear en Arduino Uno`.

## Alcance inicial (v1)

- MCU soportado: Arduino Uno (ATmega328).
- Lenguajes soportados: Ladder y ST.
- Flasheo por USB, monitoreo por puerto serial.

## Requisitos previos

- **Node.js 18+** y npm (o pnpm/yarn).
- **Rust** (toolchain estable) + [Tauri CLI](https://tauri.app/) — requerido para el backend de escritorio.
- **avr-gcc** y **avrdude** — toolchain de compilación/flasheo para Arduino Uno (se empaquetarán en el instalador final; por ahora deben estar disponibles en el sistema para desarrollo).
- Git.

## Instalación (desarrollo)

```bash
git clone <url-del-repositorio>
cd plc-ide
npm install
```

> Nota: el proyecto está en fase de inicialización — los scripts de `npm run dev` / `npm run build` aún no tienen una app funcional detrás.

## Estructura del proyecto

Monorepo dividido en backend (Rust/Tauri), frontend (React/TS), núcleo del compilador, y definiciones de hardware. Cada carpeta principal tiene su propio `README.md` con detalle:

```
plc-ide/
├── src-tauri/         # Backend Rust (Tauri): compiler, toolchain, serial
├── src/                # Frontend React/TS: editores, proyecto, monitor
├── compiler-core/      # AST, parsers (ST/Ladder), codegen por target de MCU
├── mcu_families/       # Definiciones genéricas por familia de MCU (JSON)
├── boards/             # Definiciones de placas específicas (JSON)
└── firmware-runtime/    # Plantillas base de firmware (scan cycle, HAL)
```

Ver la sección 9 de la especificación técnica para el detalle completo, y la sección 2 para la arquitectura general (Editor → Compilador → Runtime en el MCU).

## Roadmap

Ver [`ROADMAP.md`](./ROADMAP.md) para las 6 fases planeadas del proyecto.
