//! Comandos Tauri invocables desde el frontend (`invoke('nombre', args)`).
//!
//! Estos comandos cubren únicamente lo que requiere acceso al sistema operativo
//! (archivos, procesos, puertos serie). El parseo de ST/Ladder NO está aquí: es
//! JS puro y corre en el renderer (ver decisión de arquitectura, Opción A, en
//! src-tauri/README.md).

use serde::Serialize;
use std::path::PathBuf;
use std::process::Command;

/// Rutas absolutas al toolchain AVR empaquetado con Arduino IDE (verificadas en
/// esta máquina). No se depende del PATH del sistema: se invoca el ejecutable
/// completo, igual que hará el instalador final del IDE (§2.1 de la especificación).
const AVR_GCC: &str = r"C:\Users\meme_\AppData\Local\Arduino15\packages\arduino\tools\avr-gcc\7.3.0-atmel3.6.1-arduino7\bin\avr-gcc.exe";
const AVRDUDE: &str = r"C:\Users\meme_\AppData\Local\Arduino15\packages\arduino\tools\avrdude\8.0.0-arduino1\bin\avrdude.exe";
const AVRDUDE_CONF: &str = r"C:\Users\meme_\AppData\Local\Arduino15\packages\arduino\tools\avrdude\8.0.0-arduino1\etc\avrdude.conf";

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

/// Raíz del proyecto (la carpeta que contiene src-tauri/, generated/, firmware-runtime/).
///
/// Se calcula desde `CARGO_MANIFEST_DIR` (constante de compilación, siempre
/// apunta a src-tauri/) en vez de una ruta relativa al cwd: en `tauri dev` el
/// proceso corre con cwd = src-tauri/, así que rutas relativas tipo `PathBuf::from("generated")`
/// crearían carpetas en el lugar equivocado.
fn raiz_proyecto() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..")
}

/// Carpeta `generated/` en la raíz del proyecto. Debe coincidir con PROG_DIR del
/// Makefile de firmware-runtime/avr/ (`../../generated` desde esa carpeta = raíz/generated).
fn carpeta_generated() -> PathBuf {
    raiz_proyecto().join("generated")
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

/// Ejecuta un proceso hijo y, si falla, retorna Err con stdout+stderr completos
/// (crítico para que la consola del IDE muestre errores reales de avr-gcc/avrdude).
fn ejecutar(programa: &str, args: &[&str], cwd: Option<&PathBuf>, etiqueta: &str) -> Result<String, String> {
    let mut cmd = Command::new(programa);
    cmd.args(args);
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }

    let output = cmd
        .output()
        .map_err(|e| format!("Error ejecutando {}: {}", etiqueta, e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let combinado = format!("{}\n{}", stdout, stderr);

    if output.status.success() {
        Ok(combinado)
    } else {
        Err(format!("{} falló:\n{}", etiqueta, combinado))
    }
}

/// Compila `generated/plc_program.c` + el runtime AVR (firmware-runtime/avr/) con
/// avr-gcc puro, produciendo `generated/build/plc_firmware.hex`.
///
/// `puerto` no se usa aquí (la compilación no toca el puerto serie); se acepta
/// por simetría con `flashear_avr` y porque el frontend siempre tiene el puerto
/// seleccionado a mano cuando llama a este comando.
#[tauri::command]
#[allow(unused_variables)]
pub fn compilar_avr(puerto: String) -> Result<String, String> {
    let raiz = raiz_proyecto();
    let generated_dir = carpeta_generated();
    let firmware_dir = raiz.join("firmware-runtime").join("avr");
    let output_dir = generated_dir.join("build");

    let plc_program_src = generated_dir.join("plc_program.c");
    if !plc_program_src.exists() {
        return Err("No hay código generado. Presiona Compilar primero.".to_string());
    }

    std::fs::create_dir_all(&output_dir)
        .map_err(|e| format!("Error creando carpeta de build: {}", e))?;

    // Copia el runtime + el programa generado a generated/build/ para compilar todo junto.
    let archivos: [(PathBuf, &str); 6] = [
        (firmware_dir.join("plc_runtime.c"), "plc_runtime.c"),
        (firmware_dir.join("plc_runtime.h"), "plc_runtime.h"),
        (firmware_dir.join("hal_avr.c"), "hal_avr.c"),
        (firmware_dir.join("hal_avr.h"), "hal_avr.h"),
        (firmware_dir.join("main.c"), "main.c"),
        (plc_program_src, "plc_program.c"),
    ];
    for (origen, nombre_destino) in &archivos {
        std::fs::copy(origen, output_dir.join(nombre_destino))
            .map_err(|e| format!("Error copiando {}: {}", origen.display(), e))?;
    }

    // Compila cada .c a .o (flags consistentes con firmware-runtime/avr/Makefile).
    let fuentes = ["plc_runtime.c", "hal_avr.c", "main.c", "plc_program.c"];
    let mut objetos: Vec<String> = Vec::new();
    for fuente in fuentes {
        let objeto = fuente.replace(".c", ".o");
        ejecutar(
            AVR_GCC,
            &[
                "-mmcu=atmega328p",
                "-DF_CPU=16000000UL",
                "-Os",
                "-std=c11",
                "-Wall",
                "-ffunction-sections",
                "-fdata-sections",
                "-I.",
                "-c",
                fuente,
                "-o",
                &objeto,
            ],
            Some(&output_dir),
            &format!("avr-gcc (compilando {})", fuente),
        )?;
        objetos.push(objeto);
    }

    // Enlaza todos los .o -> plc_firmware.elf
    let mut link_args: Vec<&str> = vec!["-mmcu=atmega328p", "-Wl,--gc-sections"];
    link_args.extend(objetos.iter().map(String::as_str));
    link_args.extend(["-o", "plc_firmware.elf"]);
    ejecutar(AVR_GCC, &link_args, Some(&output_dir), "avr-gcc (enlazado)")?;

    // .elf -> .hex (avr-objcopy vive en la misma carpeta que avr-gcc).
    let avr_objcopy = PathBuf::from(AVR_GCC).with_file_name("avr-objcopy.exe");
    let avr_objcopy_str = avr_objcopy.to_string_lossy().to_string();
    ejecutar(
        &avr_objcopy_str,
        &["-O", "ihex", "-R", ".eeprom", "plc_firmware.elf", "plc_firmware.hex"],
        Some(&output_dir),
        "avr-objcopy",
    )?;

    Ok("generated/build/plc_firmware.hex".to_string())
}

/// Flashea `generated/build/plc_firmware.hex` al MCU vía avrdude (bootloader Arduino).
#[tauri::command]
pub fn flashear_avr(puerto: String) -> Result<String, String> {
    let hex_path = carpeta_generated().join("build").join("plc_firmware.hex");
    if !hex_path.exists() {
        return Err("No hay firmware compilado. Presiona Compilar primero.".to_string());
    }

    let flash_arg = format!("flash:w:{}:i", hex_path.to_string_lossy());

    ejecutar(
        AVRDUDE,
        &[
            "-C",
            AVRDUDE_CONF,
            "-p",
            "atmega328p",
            "-c",
            "arduino",
            "-P",
            &puerto,
            "-b",
            "115200",
            "-U",
            &flash_arg,
            "-v",
        ],
        None,
        "avrdude",
    )
}
