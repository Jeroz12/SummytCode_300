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

## Stack tecnológico

- **App de escritorio:** [Tauri](https://tauri.app/) (backend en **Rust**, frontend en **React + TypeScript**).
- **Editor ST:** Monaco Editor. **Editor Ladder:** canvas (fase 2).
- **Núcleo del compilador (`compiler-core`):** TypeScript. El parseo ST/Ladder es JS puro y corre **en el frontend**; Rust (Tauri) se encarga solo de lo que toca el sistema (puertos serie, archivos, procesos). Ver [`src-tauri/README.md`](./src-tauri/README.md).

## Requisitos previos

- **Node.js 18+** y npm.
- **Rust** (toolchain estable vía [rustup](https://rustup.rs/)) — Tauri compila el backend con `cargo`.
- **Dependencias de sistema de Tauri** según la plataforma (ver [guía oficial](https://tauri.app/v1/guides/getting-started/prerequisites)):
  - Windows: **Microsoft C++ Build Tools** + **WebView2** (preinstalado en Win 11).
  - Linux: `webkit2gtk`, `libgtk-3-dev`, `librust-*` (paquetes `build-essential`, etc.).
  - macOS: **Xcode Command Line Tools**.
- **avr-gcc** y **avrdude** — toolchain de compilación/flasheo para Arduino Uno (se empaquetarán en el instalador final; por ahora deben estar en el sistema para desarrollo).
- Git.

## Instalación (desarrollo)

```bash
git clone <url-del-repositorio>
cd plc-ide
npm install          # dependencias del frontend + @tauri-apps/cli
npm run dev          # = "tauri dev": levanta Vite y compila/abre la app Tauri
```

> La primera ejecución de `npm run dev` compila el backend Rust con `cargo` y puede tardar varios minutos; las siguientes son incrementales.
> Para solo el frontend en el navegador (sin backend Tauri): `npm run dev:renderer`.

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
