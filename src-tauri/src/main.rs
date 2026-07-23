// Oculta la consola en Windows para el build de producción (no en debug).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod serial;

use std::sync::Mutex;

fn main() {
    tauri::Builder::default()
        // Estado del monitoreo serial en vivo (un puerto a la vez); None = inactivo.
        .manage::<serial::EstadoMonitoreo>(Mutex::new(None))
        .invoke_handler(tauri::generate_handler![
            commands::get_boards,
            commands::get_serial_ports,
            commands::save_project,
            commands::load_project,
            commands::guardar_codigo_generado,
            commands::compilar_avr,
            commands::flashear_avr,
            commands::dialogo_guardar_proyecto,
            commands::dialogo_abrir_proyecto,
            commands::guardar_proyecto_en_ruta,
            commands::exit_app,
            commands::listar_boards,
            commands::leer_familia,
            serial::iniciar_monitoreo,
            serial::detener_monitoreo,
            serial::listar_puertos,
        ])
        .run(tauri::generate_context!())
        .expect("error al iniciar la aplicación Tauri");
}
