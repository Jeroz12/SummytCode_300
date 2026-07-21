// Oculta la consola en Windows para el build de producción (no en debug).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod serial;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::get_boards,
            commands::get_serial_ports,
            commands::save_project,
            commands::load_project,
            commands::guardar_codigo_generado,
        ])
        .run(tauri::generate_context!())
        .expect("error al iniciar la aplicación Tauri");
}
