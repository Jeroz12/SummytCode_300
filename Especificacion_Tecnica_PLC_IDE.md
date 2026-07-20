# Especificación Técnica del Proyecto
## IDE de Programación PLC (Ladder / ST / FBD) para MCU

**Proyecto:** Herramienta de programación tipo PLC para microcontroladores
**Tipo:** Proyecto interno de agrupación — fines educativos y de desarrollo propio
**Versión del documento:** 1.0
**Fecha:** Julio 2026

---

## 1. Visión general

Aplicación de escritorio que permite programar microcontroladores (inicialmente Arduino Uno, con expansión planeada a STM32 y ESP32, incluyendo placas personalizadas diseñadas por la agrupación) usando lenguajes estándar de la industria PLC (Ladder, Structured Text, y a futuro FBD), inspirada en herramientas como TIA Portal, CODESYS y OpenPLC.

### 1.1 Objetivos
- Servir como herramienta de aprendizaje para nuevos integrantes de la agrupación (cachimbos).
- Permitir compilación y flasheo directo desde la app, sin necesidad de instalar toolchains externos.
- Estar diseñada desde el inicio para escalar a múltiples familias de MCU y placas personalizadas propias.

### 1.2 Alcance inicial (v1)
- MCU soportado: Arduino Uno (ATmega328).
- Lenguajes soportados: Ladder y ST (FBD en fase posterior).
- Flasheo por USB, monitoreo por serial.
- Arquitectura ya preparada para STM32/ESP32 y comunicación futura por un solo conector (RS485 o Ethernet).

---

## 2. Arquitectura general

La aplicación se compone de tres capas:

1. **Editor/IDE (frontend):** interfaz donde el usuario programa en Ladder, ST o FBD.
2. **Compilador/transpilador:** convierte el programa a una representación intermedia (AST) y luego a código C ejecutable.
3. **Runtime en el MCU:** firmware que ejecuta el programa en ciclos de scan (leer entradas → ejecutar lógica → escribir salidas).

### 2.1 Stack tecnológico recomendado
- **Framework de app de escritorio:** Tauri (backend en Rust, frontend en React/TypeScript).
  - Alternativa más simple si el equipo no maneja Rust: Electron.
- **Editor Ladder/FBD:** React Flow o Konva.js (canvas interactivo).
- **Editor ST:** Monaco Editor o CodeMirror (resaltado de sintaxis, autocompletado).
- **Toolchains empaquetados dentro del instalador:**
  - AVR: `avr-gcc` + `avrdude`.
  - STM32 (futuro): `arm-none-eabi-gcc` + `stm32flash`/`st-link`.
  - ESP32 (futuro): `esp-idf` o `xtensa-esp32-elf-gcc`.

### 2.2 Justificación: app de escritorio, no web
- Compilación nativa sin depender de WebAssembly ni servidores en la nube.
- Acceso directo y confiable a puertos USB/serial (WebSerial/WebUSB tiene soporte limitado y problemas de drivers).
- Funciona 100% offline — importante para uso en aula/laboratorio.
- Es el modelo seguido por todas las referencias de la industria (TIA Portal, CODESYS, OpenPLC Editor).

---

## 3. Pipeline de compilación

```
[Editor Ladder/ST] → [Parser específico] → [AST intermedio]
   → [Validación semántica] → [Generador de código C]
   → [Compilador embebido (según familia de MCU)] → [Binario]
   → [Flasheo por USB (herramienta embebida)]
```

- **Un solo backend de generación de C**, sin importar el lenguaje gráfico de origen.
- La validación semántica debe dar errores claros y pedagógicos (variables no declaradas, doble asignación de salidas, tipos incompatibles).

---

## 4. Formato intermedio (AST)

Modelo conceptual basado en IEC 61131-3 (Program Organization Units):

```
Programa
├── Variables declaradas (nombre, tipo, clase, dirección IEC opcional)
├── Bloques de lógica (Networks/Rungs)
│   └── Árbol de expresiones: AND, OR, NOT, comparaciones,
│       asignaciones, timers, contadores
└── Orden de ejecución (scan order)
```

**Convergencia de lenguajes:**
- **ST** se parsea casi 1:1 al AST (ya es texto estructurado).
- **Ladder**: contactos en serie = AND, en paralelo = OR, contacto NC = NOT, bobina = asignación.
- **FBD** (futuro): cada bloque es un nodo con entradas/salidas conectadas.

---

## 5. Set de instrucciones v1

### 5.1 Tipos de datos
| Tipo | Uso |
|---|---|
| `BOOL` | Contactos, bobinas, entradas/salidas digitales |
| `INT` (16 bits) | Comparaciones, contadores, valores analógicos |
| `TIME` | Parámetros de timers (ej. `T#5s`) |

### 5.2 Elementos Ladder v1
- Contacto normalmente abierto `—| |—` y cerrado `—|/|—`
- Bobina simple `—( )—` y negada `—(/)—`
- Bobina SET `—(S)—` / RESET `—(R)—`
- Combinaciones serie (AND) y paralelo (OR)
- **TON** (Timer On-Delay)
- **CTU** (Counter Up)

### 5.3 Instrucciones ST equivalentes
```
IF / THEN / ELSE
AND, OR, NOT
:=
=, <>, <, >, <=, >=
TON(IN, PT, Q, ET)
CTU(CU, RESET, PV, Q, CV)
```

### 5.4 Fuera de alcance en v1 (fases futuras)
TOF, TP, CTD, tipo `REAL`, arrays, Function Blocks definidos por el usuario, FBD completo.

---

## 6. Formato de archivo de proyecto

Formato: **JSON** (`.plcproj`) — elegido sobre XML (PLCopen) por simplicidad de parseo, debugging manual y control de versiones en Git.

```json
{
  "proyecto": {
    "nombre": "Control_Semaforo",
    "target": "arduino_uno",
    "version_formato": "1.0"
  },
  "variables": [
    { "nombre": "Start", "tipo": "BOOL", "clase": "VAR_INPUT", "direccion": "%IX0.0" },
    { "nombre": "Motor", "tipo": "BOOL", "clase": "VAR_OUTPUT", "direccion": "%QX0.0" }
  ],
  "programa": {
    "lenguaje_fuente": "ladder",
    "networks": [
      {
        "id": 1,
        "elementos": [
          { "tipo": "contacto_NA", "variable": "Start" },
          { "tipo": "bobina", "variable": "Motor" }
        ]
      }
    ]
  }
}
```

- `lenguaje_fuente` conserva en qué lenguaje se escribió cada POU para reabrirlo en el mismo editor.
- El mapeo de I/O **no se guarda aquí**: se referencia desde los archivos de placa (ver sección 7).

---

## 7. Sistema de definición de hardware (placas y familias de MCU)

Diseño en dos niveles para soportar placas personalizadas de la agrupación sin duplicar información técnica.

```
Familia de MCU (genérico)  →  Define CÓMO se compila y qué HAL se usa
        ↓ hereda
Placa específica (PCB propia)  →  Define QUÉ pines físicos y para qué sirven
```

### 7.1 Archivo de familia de MCU

Ubicación: `mcu_families/*.json`

```json
{
  "familia_id": "stm32f1",
  "nombre_visible": "STM32F1 (Cortex-M3)",
  "arquitectura": "arm-cortex-m3",
  "toolchain": {
    "compilador": "arm-none-eabi-gcc",
    "flags_base": ["-mcpu=cortex-m3", "-mthumb", "-Os"],
    "linker_script": "stm32f103_generic.ld",
    "libreria_hal": "STM32F1xx_HAL_Driver"
  },
  "metodo_flasheo": {
    "protocolos_soportados": ["usb_dfu", "stlink_swd", "serial_bootloader"],
    "herramienta": "stm32flash"
  },
  "capacidades": {
    "gpio_digital": true,
    "adc": { "resolucion_bits": 12, "canales_max": 10 },
    "pwm": { "canales_max": 4, "resolucion_bits": 16 },
    "comunicacion": ["usart", "spi", "i2c", "can"],
    "timers_hw": 4
  },
  "plantilla_codegen": {
    "init_gpio": "stm32_gpio_init.c.template",
    "scan_cycle": "stm32_scan_cycle.c.template",
    "runtime_base": "stm32_runtime.c.template"
  },
  "restricciones": {
    "ram_reservada_runtime_bytes": 512,
    "flash_reservada_bootloader_kb": 4
  }
}
```

### 7.2 Archivo de placa (board definition file)

Ubicación: `boards/*.json`

```json
{
  "board_id": "agrupacion_board_v1",
  "hereda_de": "stm32f1",
  "nombre_visible": "Placa Agrupación V1 (STM32F103)",
  "canales_io": [
    {
      "direccion_iec": "%IX0.0",
      "tipo": "BOOL",
      "modo": "input",
      "pin_fisico": "PA0",
      "etiqueta_serigrafia": "IN1",
      "electrico": { "voltaje": "24V", "opto_aislado": true }
    },
    {
      "direccion_iec": "%QX0.0",
      "tipo": "BOOL",
      "modo": "output",
      "pin_fisico": "PB0",
      "etiqueta_serigrafia": "OUT1",
      "electrico": { "tipo_salida": "rele", "corriente_max_A": 2 }
    }
  ],
  "comunicacion": {
    "programacion": "usb_serial",
    "monitoreo": "usb_serial",
    "futuro": ["rs485", "ethernet"]
  }
}
```

### 7.3 Mapeo de I/O — Arduino Uno (placa de referencia inicial)

| Pin físico | Dirección IEC | Tipo | Notas |
|---|---|---|---|
| D2 – D9 | %IX0.0 – %IX0.7 | BOOL | Entradas digitales (D0/D1 reservados para serial) |
| D10 – D13 | %QX0.0 – %QX0.3 | BOOL | Salidas digitales |
| A0 – A5 | %IW0 – %IW5 | INT | Entradas analógicas (0-1023) |

**Decisiones pendientes de definir por el equipo:**
- Uso de D0/D1 como I/O si no se requiere monitoreo en vivo.
- Soporte de salidas PWM (`%QW`) en v1 o fase posterior.

### 7.4 Qué información va en cada nivel

| Dato | Familia | Placa |
|---|---|---|
| Toolchain de compilación | ✅ | heredado |
| Nombres de registros/HAL | ✅ | heredado |
| Método de flasheo | ✅ | heredado |
| Capacidades máximas del chip | ✅ | heredado |
| Pin físico por canal IEC | ❌ | ✅ |
| Etiqueta serigrafiada en PCB | ❌ | ✅ |
| Aislamiento óptico / voltajes reales | ❌ | ✅ |

### 7.5 Ventaja estratégica
Al crear una nueva placa basada en una familia ya soportada, no se modifica el compilador ni las plantillas — solo se agrega un nuevo archivo de placa. Al dar soporte a una familia de MCU completamente nueva, se crea un único archivo de familia y todas las placas futuras de esa familia lo heredan automáticamente.

---

## 8. Comunicación PC ↔ MCU

- **v1:** flasheo por USB (bootloader estándar), monitoreo por puerto serial.
- **Futuro:** un solo conector físico (RS485 o Ethernet) para programación y monitoreo simultáneos.
- **Monitoreo en vivo:** se evalúa reutilizar Modbus (TCP/RTU) para lectura/escritura de variables en tiempo real, siguiendo el precedente de OpenPLC.

---

## 9. Estructura de carpetas del proyecto (monorepo)

```
plc-ide/
├── src-tauri/              # Backend Rust (Tauri)
│   ├── compiler/           # Orquesta parser → AST → codegen
│   ├── toolchain/          # Compiladores/flashers empaquetados
│   └── serial/             # Comunicación puerto serie
├── src/                    # Frontend (React/TS)
│   ├── editors/
│   │   ├── ladder/
│   │   ├── st/
│   │   └── fbd/            # Fase futura
│   ├── project/             # Gestión de proyectos y variables
│   └── monitor/            # Vista de monitoreo en vivo
├── compiler-core/          # AST y codegen
│   ├── ast/
│   ├── parsers/
│   │   ├── st_parser/
│   │   └── ladder_translator/
│   └── codegen/
│       └── target_avr/     # Luego target_stm32, target_esp32
├── mcu_families/            # Definiciones de familias de MCU
├── boards/                  # Definiciones de placas específicas
└── firmware-runtime/         # Plantilla base de firmware
```

---

## 10. Wireframe de referencia (pantalla principal)

```
┌─────────────────────────────────────────────────────────────────┐
│  Archivo  Editar  Ver  Programa  Comunicación  Ayuda   [MCU: Arduino Uno ▾] │
├───────────────┬───────────────────────────────────────┬─────────┤
│  PROYECTO     │ [Ladder] [ST] [FBD]                    │ VARIABLES│
│  ├─ Main      │ ┌───────────────────────────────────┐ │─────────│
│  ├─ Variables │ │ Network 1                          │ │ Nombre  │
│  ├─ I/O Map   │ │  ┤├──────┤├────────( )             │ │ Tipo    │
│  └─ Config    │ │  Start   Stop      Motor            │ │ Dirección│
│  HARDWARE     │ │ Network 2                           │ │         │
│  [pines PCB]  │ │  ┤├─────[TON]────( )                │ │         │
│               │ └───────────────────────────────────┘ │         │
├───────────────┴───────────────────────────────────────┴─────────┤
│  CONSOLA: ✔ Compilación exitosa / ⚠ advertencias                 │
│ [▶ Compilar] [⬆ Flashear] [📡 Monitorear]     Puerto: COM3 ▾     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 11. Roadmap por fases

| Fase | Alcance |
|---|---|
| **Fase 1** | AST + parser ST → codegen C → compilar y flashear en Arduino Uno |
| **Fase 2** | Editor Ladder (traducción a AST) |
| **Fase 3** | Monitoreo en vivo vía serial/Modbus |
| **Fase 4** | Soporte STM32 (nueva familia + placas propias) |
| **Fase 5** | Soporte ESP32 + comunicación por conector único (RS485/Ethernet) |
| **Fase 6** | Editor FBD |

---

## 12. Requisitos de aprendizaje para el equipo

- **IEC 61131-3**: semántica de scan cycle, edge detection, timers, retención de memoria.
- **C/C++ embebido**: memoria limitada, interrupciones, timing.
- **Electrónica básica**: aislamiento, voltajes, seguridad eléctrica al conectar cargas reales.
- **Rust y/o TypeScript**: según el stack elegido (Tauri/Electron + React).

---

## 13. Referencias de estudio

- OpenPLC (runtime + editor, código abierto)
- Beremiz + matiec (compilador IEC 61131-3 de referencia)
- Node-RED (UX de programación por bloques, útil para FBD)
- Documentación oficial de PlatformIO (gestión de toolchains multi-MCU)
