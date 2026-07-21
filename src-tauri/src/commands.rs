//! Comandos Tauri invocables desde el frontend (`invoke('nombre', args)`).
//!
//! Estos comandos cubren únicamente lo que requiere acceso al sistema operativo
//! (archivos, procesos, puertos serie). El parseo de ST/Ladder NO está aquí: es
//! JS puro y corre en el renderer (ver decisión de arquitectura, Opción A, en
//! src-tauri/README.md).

use serde::Serialize;
use std::path::PathBuf;

/// Definición mínima de una placa. Debe coincidir en forma (field names) con el
/// tipo `BoardDefinition` del frontend en src/shared/types.ts.
#[derive(Serialize)]
pub struct BoardDefinition {
    pub board_id: String,
    pub nombre_visible: String,
}

/// Placas disponibles.
#[tauri::command]
pub fn get_boards() -> Vec<BoardDefinition> {
    // TODO: leer de boards/*.json cuando exista el sistema de carga de archivos.
    vec![BoardDefinition {
        board_id: "arduino_uno".to_string(),
        nombre_visible: "Arduino Uno".to_string(),
    }]
}

/// Puertos serie reales del sistema (ej. ["COM3"] en Windows, ["/dev/ttyUSB0"] en Linux).
/// Si falla o no hay puertos, retorna un vector vacío (nunca un error).
#[tauri::command]
pub fn get_serial_ports() -> Vec<String> {
    match serialport::available_ports() {
        Ok(ports) => ports.into_iter().map(|p| p.port_name).collect(),
        Err(_) => Vec::new(),
    }
}

/// Guarda el JSON de un proyecto (.plcproj) en la ruta indicada.
#[tauri::command]
pub fn save_project(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

/// Carga el contenido de un proyecto (.plcproj) desde la ruta indicada.
#[tauri::command]
pub fn load_project(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// Carpeta `generated/` en la RAÍZ del proyecto (no en src-tauri/).
///
/// Se calcula desde `CARGO_MANIFEST_DIR` (constante de compilación, siempre
/// apunta a src-tauri/) en vez de una ruta relativa al cwd: en `tauri dev` el
/// proceso corre con cwd = src-tauri/, así que un simple `PathBuf::from("generated")`
/// crearía la carpeta en el lugar equivocado. Esto debe coincidir con PROG_DIR del
/// Makefile de firmware-runtime/avr/ (`../../generated` desde esa carpeta = raíz/generated).
fn carpeta_generated() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("generated")
}

/// Guarda código C generado por el compilador en `generated/{nombre_archivo}`.
#[tauri::command]
pub fn guardar_codigo_generado(nombre_archivo: String, contenido: String) -> Result<String, String> {
    let carpeta = carpeta_generated();
    if !carpeta.exists() {
        std::fs::create_dir_all(&carpeta).map_err(|e| format!("Error creando carpeta: {}", e))?;
    }

    let ruta_completa = carpeta.join(&nombre_archivo);
    std::fs::write(&ruta_completa, contenido)
        .map_err(|e| format!("Error escribiendo archivo: {}", e))?;

    Ok(ruta_completa.to_string_lossy().to_string())
}
