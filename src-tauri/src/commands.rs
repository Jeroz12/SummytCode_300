//! Comandos Tauri invocables desde el frontend (`invoke('nombre', args)`).
//!
//! Estos comandos cubren únicamente lo que requiere acceso al sistema operativo
//! (archivos, procesos, puertos serie). El parseo de ST/Ladder NO está aquí: es
//! JS puro y corre en el renderer (ver decisión de arquitectura, Opción A, en
//! src-tauri/README.md).

use serde::Serialize;

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
