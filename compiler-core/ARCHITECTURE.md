# Arquitectura de `compiler-core`

Núcleo del compilador del PLC IDE. Implementa el tramo `Parser → AST` del pipeline descrito en la §3 de la especificación técnica. Es **agnóstico de la UI y de Tauri**: recibe texto o estructuras y devuelve un AST, de forma totalmente testeable de manera aislada.

```
[Editor ST/Ladder] → [Parser] → [AST intermedio] → [Validación] → [Codegen C] → ...
                       ▲▲▲▲▲▲     ▲▲▲▲▲▲▲▲▲▲▲▲
                    (este paquete implementa esta parte)
```

## Estructura de directorios

```
compiler-core/
├── src/
│   ├── ast/
│   │   └── types.ts               # Definición del AST (interfaces/tipos TS)
│   ├── parsers/
│   │   └── st_parser.ts           # Parser recursivo descendente de Structured Text
│   ├── ladder/
│   │   ├── types.ts               # Representación del rung dibujado
│   │   └── ladder_translator.ts   # Ladder → AST (traducirLadderAAST)
│   └── index.ts                   # Barrel export público del paquete
├── tests/
│   ├── test_st_parser.ts          # Tests del parser de ST (Vitest)
│   └── test_ladder_translator.ts  # Tests del traductor de Ladder (Vitest)
├── package.json                   # @plc-ide/compiler-core
├── tsconfig.json                  # target ES2020, output → dist/
└── ARCHITECTURE.md
```

> Nota: `tests/` se excluye del build de `tsc` (`tsconfig.json` → `exclude`). Los tests se ejecutan con Vitest, que transpila TS al vuelo con esbuild.

## Flujo de parsing

El parser de ST (`STParser`) trabaja en dos fases clásicas:

### 1. Tokenize (`tokenize`)
Convierte el string de código fuente en una lista plana de **tokens**, cada uno con su `linea` y `columna` (clave para errores legibles). Reconoce:

- **Palabras clave**: `VAR`, `END_VAR`, `IF`, `THEN`, `END_IF`, `AND`, `OR`, `NOT`, `TRUE`, `FALSE`, `BOOL`, `INT`, `TIME`, `TON`, `CTU`, `AT`, … (case-insensitive).
- **Identificadores**: nombres de variables.
- **Números**: enteros / decimales.
- **Literales de tiempo**: `T#5s`, `T#100ms`, `T#1m30s` → se convierten a milisegundos.
- **Direcciones IEC**: `%IX0.0`, `%QX0.0`, `%IW0`.
- **Símbolos**: `:=`, `=>`, `<=`, `>=`, `<>`, y `( ) : ; , = < >`.
- **Comentarios**: `// línea` y `(* bloque *)` (se descartan).

### 2. Parse (descenso recursivo)
Consume los tokens según una gramática con la siguiente **precedencia de expresiones** (de menor a mayor):

```
parseExpresion → parseOr → parseAnd → parseComparacion → parseUnario → parsePrimario
                   OR        AND        = <> < > <= >=      NOT           literales,
                                                                          variables,
                                                                          (paréntesis)
```

A nivel de statement, `parseStatement` despacha a:
- `parseIf` — `IF … THEN … END_IF`
- `parseLlamadaBloque` — `TON(...)` / `CTU(...)`
- `parseAsignacion` — `variable := expr;`

Cada statement de nivel superior produce un **Network** (equivalente a un rung de Ladder).

## Cómo el AST representa Ladder y ST a la vez

El AST es el punto de convergencia de los lenguajes (§4). Decisiones de modelado clave:

| Construcción fuente | Nodo AST |
|---|---|
| Lectura de una variable en una expresión (`Start`) | `contacto_na` (contacto normalmente abierto) |
| `NOT Start` | `contacto_nc` (contacto normalmente cerrado) |
| `A AND B` / `A OR B` | `and` / `or` |
| `Cuenta > 10` | `comparacion` |
| `Motor := <expr>;` (nivel superior) | `asignacion` |
| `Motor := TRUE;` dentro de un `IF` | `bobina` (`negar=false`); `:= FALSE` → `negar=true` |
| `TON(IN:=.., PT:=T#5s, Q=>..)` | `ton` (`in` es una `Expresion`; `pt_ms` en milisegundos) |
| `CTU(CU:=.., RESET:=.., PV:=.., Q=>..)` | `ctu` (`cu` y `reset` son `Expresion`) |

> `IN`/`CU`/`RESET` aceptan condiciones compuestas, p. ej. `TON(IN := Sensor1 AND NOT Sensor2, PT := T#5s, Q => Alarma)`.

Un `IF Start THEN Motor := TRUE; END_IF;` se traduce a un Network con dos expresiones:
`[ contacto_na(Start), bobina(Motor) ]` — exactamente el modelo serie-contacto → bobina de Ladder.

### Simplificación conocida (MVP)
El AST de esta versión **no tiene un nodo genérico de "referencia a variable"**: una lectura de variable siempre se modela como `contacto_na`, incluso cuando la variable es `INT` (p. ej. el lado izquierdo de `Cuenta > 10`). Es semánticamente aceptable para el codegen (un contacto NA "lee el valor de la variable"), pero conviene tenerlo presente al implementar la validación de tipos. Si en el futuro estorba, se añadirá un nodo `variable_ref` sin romper el resto del AST.

## Cómo extender el parser para nuevas instrucciones

1. **Nuevo tipo de dato o nodo de expresión** → agregarlo primero al union `Expresion` (o a `TipoDato`) en [`src/ast/types.ts`](src/ast/types.ts). El compilador de TS te obligará a manejar el nuevo caso donde corresponda.
2. **Nueva palabra clave** → añadirla al set `PALABRAS_CLAVE` del tokenizer.
3. **Nuevo statement** (ej. `WHILE`, `CASE`) → añadir un `parseXxx()` y despacharlo desde `parseStatement()`.
4. **Nuevo bloque con estado** (ej. `TOF`, `CTD`) → extender `parseLlamadaBloque()` (o refactorizarlo a una tabla de firmas de bloque) y añadir su nodo al AST.
5. **Siempre** agregar un test en [`tests/test_st_parser.ts`](tests/test_st_parser.ts) que fije el comportamiento esperado.

Instrucciones actualmente fuera de alcance (§5.4): `ELSE`/`ELSIF`, `TOF`, `TP`, `CTD`, tipo `REAL`, arrays y Function Blocks definidos por el usuario.

## Traductor de Ladder

Ladder **no se almacena como texto**: el editor visual produce una estructura de datos ([`src/ladder/types.ts`](src/ladder/types.ts)) que describe cómo están conectados los contactos y bobinas de un rung. La función `traducirLadderAAST` ([`src/ladder/ladder_translator.ts`](src/ladder/ladder_translator.ts)) convierte esa estructura en el **mismo** `Programa` (AST) que emite el parser de ST.

### Representación interna del rung

```
LadderPrograma
└── rungs: LadderRung[]
    ├── ramas:   LadderRama[]      // ramas en PARALELO entre sí
    │   └── elementos: LadderElemento[]   // contactos en SERIE dentro de la rama
    └── salidas: LadderElemento[]  // bobinas / bloques (TON, CTU) del rung
```

Dos ejes topológicos:
- **Serie** (elementos dentro de una rama) → corriente que debe pasar por todos ⇒ **AND**.
- **Paralelo** (ramas dentro de un rung) → basta con que una rama conduzca ⇒ **OR**.

### Mapeo a AST

| Construcción Ladder | Nodo AST |
|---|---|
| Elementos en serie `A —B—` | `and` anidado (`and(A, B)`) |
| Ramas en paralelo | `or` anidado (`or(rama1, rama2)`) |
| Contacto NA / NC | `contacto_na` / `contacto_nc` |
| Bobina —( )— | `asignacion` con la lógica del rung anidada en `valor` |
| Bobina negada —(/)— | `asignacion` con `not(lógica)` |
| Bobina SET —(S)— / RESET —(R)— | `bobina_s` / `bobina_r` (ver nota) |
| TON / CTU | `ton` / `ctu` |

Ejemplo — dos ramas en paralelo, cada una con un contacto, hacia una bobina (patrón de enclavamiento):

```
Rama 1: [contacto_na Start]          ┌─ Start ─┐
Rama 2: [contacto_na Enclavamiento]  ├─ Ench. ─┤──( Motor )
Salida: [bobina Motor]               └─────────┘
```
se traduce a:
```ts
{ tipo: "asignacion", variable: "Motor",
  valor: { tipo: "or",
    izq: { tipo: "contacto_na", variable: "Start" },
    der: { tipo: "contacto_na", variable: "Enclavamiento" } } }
```

### Por qué converge con ST

Ambos frontends (editor Ladder y editor ST) terminan produciendo el **mismo tipo `Programa`**. El codegen y la validación semántica trabajan solo sobre ese AST, sin saber en qué lenguaje se escribió el POU. Añadir un lenguaje nuevo (ej. FBD, Fase 6) es escribir otro traductor a `Programa`, sin tocar el backend.

### Notas de diseño (MVP)

- **Bobinas SET/RESET sin condición propia.** Los nodos `bobina_s` / `bobina_r` del AST no llevan un campo de condición. Para no perder la lógica del rung, el traductor la antepone **una vez** como expresión líder del `Network` (`[ lógica, bobina_s ]`), siguiendo la convención de lista plana que ya usa el parser de ST para `IF`. Las bobinas normales, en cambio, anidan la lógica dentro de `asignacion.valor` (como pide el modelo de §4). Es una asimetría deliberada por la forma de los nodos; documentarla evita sorpresas en el codegen.
- **Entrada de TON/CTU — RESUELTO (2026-07-20).** Anteriormente `Ton.in_var` / `Ctu.cu_var` eran un **único nombre de variable** (string) y una condición compuesta no podía representarse. Ahora los campos de condición del AST son `Ton.in`, `Ctu.cu` y `Ctu.reset`, todos de tipo **`Expresion`**. El traductor pasa la lógica completa del rung (el mismo AND/OR que usa una bobina) directamente como `in`/`cu`, sin caso especial. Única salvedad de nivel de dibujo: el `reset` de un CTU se toma de `parametros.reset_var` (un nombre de variable) y se envuelve en un `contacto_na`; el AST ya admite un `reset` compuesto si un editor futuro lo provee.
- **Contactos únicamente en las ramas.** Si un bloque o bobina aparece dentro de una rama (en vez de en `salidas`), el traductor lanza un error claro. Los elementos de una rama deben ser contactos.

## Errores

Todos los errores de parseo se lanzan como `Error` con el formato:

```
[línea L, columna C] <mensaje>. Símbolo encontrado: '<token>'
```

El objetivo (§3) es que sean **pedagógicos**: pensados para que un integrante nuevo entienda qué escribió mal y dónde.
