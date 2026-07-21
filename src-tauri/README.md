# src-tauri/ — Backend (Rust / Tauri)

Backend nativo de la app de escritorio. Se encarga **exclusivamente de lo que
requiere acceso al sistema operativo**: enumerar puertos serie, leer/escribir
archivos de proyecto y (a futuro) invocar `avr-gcc`/`avrdude` y el monitoreo
serial. El frontend (React) lo invoca con `invoke('nombre_comando', args)`.

## Archivos

```
src-tauri/
├── Cargo.toml          # dependencias Rust (tauri, serde, serialport)
├── tauri.conf.json     # config de la app: ventana, build, allowlist
├── build.rs            # script de build estándar de Tauri
└── src/
    ├── main.rs         # punto de entrada; registra los comandos (invoke_handler)
    ├── commands.rs     # comandos invocables: get_boards, get_serial_ports, save/load_project
    └── serial.rs       # placeholder del monitoreo serie / Modbus (fase 3)
```

## Por qué el parseo ST/Ladder NO vive en Rust (Opción A)

El `compiler-core` (parser ST, traductor Ladder, generador C) está escrito en
**TypeScript** y es **JS puro**: no usa APIs de Node ni del sistema de archivos
para parsear. Por eso se importa y ejecuta **directamente en el renderer** (React),
sin pasar por Tauri.

Se descartaron las alternativas:
- **Reescribir compiler-core en Rust** — mucho trabajo duplicado, innecesario ahora.
- **Node.js embebido como sidecar** — complejidad de mantenimiento sin beneficio.

Regla práctica: **si algo no toca el sistema operativo, va en el frontend**
(`src/renderer/api/tauriApi.ts`, función `parseSTCode`). **Si toca el SO**
(archivos, procesos, puertos), va como comando Tauri aquí.

## Cómo agregar un nuevo comando Tauri

1. Implementa la función en `commands.rs` con el atributo `#[tauri::command]`:
   ```rust
   #[tauri::command]
   pub fn mi_comando(arg: String) -> Result<String, String> {
       // ... lógica que toca el sistema ...
       Ok(format!("recibido: {arg}"))
   }
   ```
2. Regístralo en `main.rs` dentro de `tauri::generate_handler![ ... ]`:
   ```rust
   .invoke_handler(tauri::generate_handler![
       commands::get_boards,
       commands::mi_comando,   // ← nuevo
   ])
   ```
3. Exponlo en el frontend en `src/renderer/api/tauriApi.ts`:
   ```ts
   export function miComando(arg: string): Promise<string> {
     return invoke<string>("mi_comando", { arg });
   }
   ```
   > Los nombres de los argumentos deben coincidir exactamente entre Rust y el
   > objeto que pasas a `invoke` (aquí, `arg`).

## Comandos actuales

| Comando | Firma | Estado |
|---|---|---|
| `get_boards` | `() -> Vec<BoardDefinition>` | mock (1 placa: arduino_uno) |
| `get_serial_ports` | `() -> Vec<String>` | real (crate `serialport`) |
| `save_project` | `(path, content) -> Result<(), String>` | real (`std::fs::write`) |
| `load_project` | `(path) -> Result<String, String>` | real (`std::fs::read_to_string`) |

## Notas técnicas

- La ventana y el `beforeDevCommand`/`distDir` se configuran en `tauri.conf.json`
  (apunta al dev server de Vite en `http://localhost:5173` y al build en `../dist/renderer`).
- `allowlist` mínima: solo `shell.open` habilitado (para abrir links externos).
- `BoardDefinition` en `commands.rs` debe mantener los mismos nombres de campo
  (`board_id`, `nombre_visible`) que el tipo del frontend en `src/shared/types.ts`.
