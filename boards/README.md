# boards/ — Definiciones de placas específicas

## Propósito
Nivel específico del sistema de definición de hardware (sección 7). Cada archivo describe **qué pines físicos existen y para qué sirven** en una placa concreta (comercial o PCB propia de la agrupación), heredando el toolchain y las capacidades de una familia definida en `mcu_families/`.

## Archivos esperados
Un archivo JSON por placa soportada, siguiendo el esquema de la sección 7.2:

- `arduino_uno.json` — placa de referencia inicial (v1), hereda de `atmega328`. Mapeo de I/O según sección 7.3 (D2–D9 entradas digitales `%IX0.0`–`%IX0.7`, D10–D13 salidas `%QX0.0`–`%QX0.3`, A0–A5 entradas analógicas `%IW0`–`%IW5`).
- `agrupacion_board_v1.json` — ejemplo de placa personalizada propia (futuro), hereda de `stm32f1`.

Cada archivo debe incluir, como mínimo:
```json
{
  "board_id": "...",
  "hereda_de": "<familia_id de mcu_families/>",
  "nombre_visible": "...",
  "canales_io": [
    { "direccion_iec": "%IX0.0", "tipo": "BOOL", "modo": "input", "pin_fisico": "...", "etiqueta_serigrafia": "...", "electrico": {...} }
  ],
  "comunicacion": { "programacion": "...", "monitoreo": "...", "futuro": [...] }
}
```

## Notas técnicas
- `hereda_de` debe apuntar a un `familia_id` existente en `mcu_families/`.
- El mapeo de I/O (`canales_io`) es lo que vincula una dirección IEC (`%IX0.0`, `%QX0.0`, etc.) usada en el programa `.plcproj` con un pin físico real — este mapeo **no se guarda en el proyecto** (sección 6).
- Para agregar una placa nueva basada en una familia ya soportada, basta con crear un archivo aquí; no se toca el compilador ni las plantillas de codegen (sección 7.5).
- Decisiones pendientes a definir por el equipo (sección 7.3): uso de D0/D1 como I/O, soporte de salidas PWM (`%QW`) en v1.
