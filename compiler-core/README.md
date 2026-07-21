# compiler-core/ — AST y Codegen

## Propósito
Núcleo del compilador: define el formato intermedio (AST) basado en IEC 61131-3, los parsers que convierten cada lenguaje fuente a ese AST, y los generadores de código C por familia de MCU. Es la implementación real del pipeline descrito en la sección 3, y es agnóstico de si se invoca desde Rust (`src-tauri/compiler`) o directamente en tests.

## Estructura actual

Esta capa está implementada en **TypeScript** (decisión de la Fase 1 por rapidez de iteración; migrable a Rust más adelante si el rendimiento lo exige). El código fuente vive bajo `src/`:

```
compiler-core/
├── src/
│   ├── ast/types.ts          # Modelo de datos intermedio (AST)
│   ├── parsers/st_parser.ts  # Parser de Structured Text → AST
│   ├── ladder/               # Representación de Ladder y su traductor → AST
│   │   ├── types.ts
│   │   └── ladder_translator.ts
│   └── index.ts              # Barrel export público del paquete
├── tests/test_st_parser.ts
├── ARCHITECTURE.md
├── package.json
└── tsconfig.json
```

## Subcarpetas y archivos esperados

### `src/ast/`
Definición del modelo de datos intermedio (sección 4):
```
Programa
├── Variables declaradas (nombre, tipo, clase, dirección IEC opcional)
├── Bloques de lógica (Networks/Rungs)
│   └── Árbol de expresiones: AND, OR, NOT, comparaciones, asignaciones, timers, contadores
└── Orden de ejecución (scan order)
```
Archivos: `types.ts` (tipos/interfaces del AST). A futuro: `validation.ts` (validación semántica: variables no declaradas, doble asignación de salidas, tipos incompatibles — sección 3).

### `src/parsers/st_parser.ts`
Parser de Structured Text → AST. Al ser ST ya texto estructurado, el mapeo es casi 1:1 (sección 4). Cubre en v1: `IF/THEN/ELSE`, `AND/OR/NOT`, `:=`, operadores de comparación, `TON`, `CTU` (sección 5.3).

Implementado como un único módulo (tokenizer + parser recursivo descendente). La gramática se documenta en `ARCHITECTURE.md`.

### `src/ladder/`
Traductor de la representación gráfica Ladder (generada por `src/editors/ladder`) → AST. Reglas de traducción (sección 4):
- Contactos en serie → AND
- Contactos en paralelo → OR
- Contacto NC → NOT
- Bobina → asignación

Archivos: `types.ts` (estructura intermedia del rung dibujado), `ladder_translator.ts` (función `traducirLadderAAST`).

### `src/codegen/`
Generación de código C a partir del AST. **Un solo backend de codegen conceptual, especializado por target de MCU** (sección 3 y 9).

- `target_avr/` — generador de C para ATmega328 (Arduino Uno), único target soportado en v1. Usa las plantillas de codegen referenciadas por la familia MCU correspondiente (sección 7.1: `plantilla_codegen`).
  - Futuro: `target_stm32/`, `target_esp32/` (Fases 4 y 5).

Archivos esperados en `target_avr/`: `codegen.ts`, `templates/` (o referencia a `firmware-runtime/`).

## Notas técnicas
- Esta capa no sabe nada de UI ni de Tauri — debe ser testeable de forma aislada (unit tests sobre AST → C generado).
- El codegen consume los archivos de `mcu_families/*.json` para saber qué plantillas y flags de compilación usar.
- Los errores de validación semántica generados aquí deben ser legibles y pedagógicos, ya que este proyecto tiene fines educativos (sección 1.1).
