//! Monitoreo en vivo de variables por puerto serie (Fase 3 del roadmap).
//!
//! El firmware generado emite, una vez por ciclo de scan, una trama ASCII por
//! USART a 9600 baud con el estado de las variables BOOL:
//!
//!     VAR:Start=1,Stop=0,Motor=1\n
//!
//! Aquí se abre el puerto en un HILO NATIVO (no async: `std::thread` + `AtomicBool`
//! es suficiente y evita arrastrar un runtime), se parsea cada trama y se reenvía
//! al frontend como el evento `plc_estado` con un objeto JSON `{ nombre: bool }`.
//!
//! La enumeración simple de todos los puertos sigue en `commands::get_serial_ports`;
//! aquí se añade `listar_puertos`, que filtra solo los puertos USB (los MCU).

use std::collections::HashMap;
use std::io::Read;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

/// Handles compartidos entre el comando y el hilo lector.
///
/// - `detener`: el comando lo pone en `true` para pedirle al hilo que salga.
/// - `activo`:  el hilo lo pone en `false` justo antes de terminar, para que
///   `detener_monitoreo` sepa que ya cerró el puerto (y no quede colgado).
pub struct MonitoreoState {
    detener: Arc<AtomicBool>,
    activo: Arc<AtomicBool>,
}

/// Tipo del estado gestionado por Tauri (`.manage(...)`). `None` = sin monitoreo.
pub type EstadoMonitoreo = Mutex<Option<MonitoreoState>>;

/// Parsea una trama `VAR:...` en un mapa `{ nombre: bool }`.
///
/// `"VAR:Start=1,Stop=0,Motor=1"` → `Some({Start:true, Stop:false, Motor:true})`.
///
/// Devuelve `None` únicamente si la línea no empieza por el prefijo `VAR:`. Los
/// pares individuales malformados (sin `=`, con valor distinto de `0`/`1`, o con
/// nombre vacío) se IGNORAN en vez de descartar la trama entera: la línea llega
/// de un enlace serie que puede traer ruido o recortes, y perder todas las
/// variables buenas por un byte corrupto sería peor. Función pura → testeable.
pub fn parsear_trama(linea: &str) -> Option<HashMap<String, bool>> {
    let cuerpo = linea.trim().strip_prefix("VAR:")?;

    let mut mapa = HashMap::new();
    for par in cuerpo.split(',') {
        let par = par.trim();
        if par.is_empty() {
            continue; // coma final o doble coma: sin par que leer.
        }
        let (nombre, valor) = match par.split_once('=') {
            Some(kv) => kv,
            None => continue, // par sin '=' → malformado, se ignora.
        };
        let nombre = nombre.trim();
        let valor = match valor.trim() {
            "1" => true,
            "0" => false,
            _ => continue, // valor no booleano → malformado, se ignora.
        };
        if nombre.is_empty() {
            continue;
        }
        mapa.insert(nombre.to_string(), valor);
    }
    Some(mapa)
}

/// Bucle del hilo lector: lee byte a byte hasta `\n`, parsea y emite el evento.
///
/// Sale limpiamente cuando `detener` es `true` o cuando el puerto falla (p. ej.
/// se desconecta el MCU a media sesión): un error de E/S que no sea *timeout*
/// termina el bucle sin `panic`. El *timeout* (100 ms) no es un fallo: solo
/// significa "no llegaron datos", y sirve para re-chequear `detener` con latencia
/// acotada aunque el firmware esté callado.
fn bucle_lector(mut puerto: Box<dyn serialport::SerialPort>, window: tauri::Window, detener: Arc<AtomicBool>) {
    let mut linea = String::new();
    let mut byte = [0u8; 1];

    loop {
        if detener.load(Ordering::Relaxed) {
            break;
        }

        match puerto.read(&mut byte) {
            Ok(0) => {} // sin datos; vuelve a chequear `detener`.
            Ok(_) => {
                match byte[0] {
                    b'\n' => {
                        if let Some(vars) = parsear_trama(&linea) {
                            if let Ok(payload) = serde_json::to_value(&vars) {
                                // Value::Object; se ignora un fallo de emit (ventana cerrada).
                                let _ = window.emit("plc_estado", payload);
                            }
                        }
                        linea.clear();
                    }
                    b'\r' => {} // fin de línea estilo CRLF: se descarta el CR.
                    b => {
                        linea.push(b as char);
                        // Cota de seguridad: una línea sin '\n' (ruido) no debe
                        // crecer sin límite. Se descarta y se resincroniza.
                        if linea.len() > 1024 {
                            linea.clear();
                        }
                    }
                }
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {} // sin datos aún.
            Err(_) => break, // desconexión u otro fallo de E/S → salir limpio.
        }
    }
}

/// Detiene el monitoreo en curso (si lo hay) y espera a que el hilo cierre el
/// puerto. Deja el estado en `None`. Reutilizado por ambos comandos.
///
/// Espera activa acotada a 500 ms (chequeando cada 10 ms) para no quedarse
/// colgado si el hilo estuviera bloqueado; en la práctica el hilo reacciona en
/// ≤100 ms (el timeout de lectura).
fn detener_y_esperar(estado: &EstadoMonitoreo) {
    // Se saca el `MonitoreoState` del Mutex y se suelta el lock de inmediato,
    // para no retener el candado durante la espera.
    let previo = {
        let mut guard = estado.lock().unwrap_or_else(|p| p.into_inner());
        guard.take()
    };

    if let Some(m) = previo {
        m.detener.store(true, Ordering::Relaxed);
        for _ in 0..50 {
            if !m.activo.load(Ordering::Relaxed) {
                break;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
    }
}

/// Inicia el monitoreo del `puerto` a `baud` baudios. Emite el evento `plc_estado`
/// por cada trama `VAR:` recibida. Si ya había un monitoreo activo, lo detiene antes.
#[tauri::command]
pub fn iniciar_monitoreo(
    puerto: String,
    baud: u32,
    window: tauri::Window,
    state: tauri::State<EstadoMonitoreo>,
) -> Result<(), String> {
    // Un solo puerto a la vez: cierra el monitoreo anterior si lo hubiera.
    detener_y_esperar(&state);

    let puerto_serie = serialport::new(&puerto, baud)
        .timeout(Duration::from_millis(100))
        .open()
        .map_err(|e| format!("No se pudo abrir el puerto '{}': {}", puerto, e))?;

    let detener = Arc::new(AtomicBool::new(false));
    let activo = Arc::new(AtomicBool::new(true));

    {
        let mut guard = state.lock().unwrap_or_else(|p| p.into_inner());
        *guard = Some(MonitoreoState {
            detener: detener.clone(),
            activo: activo.clone(),
        });
    }

    std::thread::spawn(move || {
        bucle_lector(puerto_serie, window, detener);
        // Señala que el puerto ya se cerró (haya salido por `detener` o por fallo).
        activo.store(false, Ordering::Relaxed);
    });

    Ok(())
}

/// Detiene el monitoreo en curso y libera el puerto. Idempotente: si no hay
/// monitoreo activo no hace nada.
#[tauri::command]
pub fn detener_monitoreo(state: tauri::State<EstadoMonitoreo>) -> Result<(), String> {
    detener_y_esperar(&state);
    Ok(())
}

/// Lista los puertos serie de tipo USB (los MCU se enumeran como USB-CDC),
/// devolviendo sus nombres (`"COM3"`, `"/dev/ttyUSB0"`, …). Filtra el ruido de
/// puertos Bluetooth/PCI que aparecen en `get_serial_ports`.
#[tauri::command]
pub fn listar_puertos() -> Result<Vec<String>, String> {
    let puertos = serialport::available_ports().map_err(|e| e.to_string())?;
    Ok(puertos
        .into_iter()
        .filter(|p| matches!(p.port_type, serialport::SerialPortType::UsbPort(_)))
        .map(|p| p.port_name)
        .collect())
}

#[cfg(test)]
mod tests {
    use super::parsear_trama;

    #[test]
    fn trama_valida_se_parsea() {
        let m = parsear_trama("VAR:Start=1,Stop=0,Motor=1").unwrap();
        assert_eq!(m.get("Start"), Some(&true));
        assert_eq!(m.get("Stop"), Some(&false));
        assert_eq!(m.get("Motor"), Some(&true));
        assert_eq!(m.len(), 3);
    }

    #[test]
    fn prefijo_incorrecto_es_none() {
        assert!(parsear_trama("OTRA:Start=1").is_none());
        assert!(parsear_trama("Start=1,Stop=0").is_none());
        assert!(parsear_trama("").is_none());
    }

    #[test]
    fn una_sola_variable() {
        let m = parsear_trama("VAR:Solo=1").unwrap();
        assert_eq!(m.get("Solo"), Some(&true));
        assert_eq!(m.len(), 1);
    }

    #[test]
    fn pares_malformados_se_ignoran_y_conservan_los_validos() {
        // 'Stop' sin '=', 'Motor' con valor no booleano, nombre vacío: todos se
        // ignoran; 'Start' y 'Sensor' válidos se conservan.
        let m = parsear_trama("VAR:Start=1,Stop,Motor=2,=3,Sensor=0").unwrap();
        assert_eq!(m.get("Start"), Some(&true));
        assert_eq!(m.get("Sensor"), Some(&false));
        assert!(!m.contains_key("Stop"));
        assert!(!m.contains_key("Motor"));
        assert_eq!(m.len(), 2);
    }

    #[test]
    fn trama_con_espacios_y_coma_final() {
        // Robustez ante espacios y una coma colgando al final.
        let m = parsear_trama("  VAR:A=1, B=0,  ").unwrap();
        assert_eq!(m.get("A"), Some(&true));
        assert_eq!(m.get("B"), Some(&false));
        assert_eq!(m.len(), 2);
    }

    #[test]
    fn solo_prefijo_sin_variables() {
        let m = parsear_trama("VAR:").unwrap();
        assert!(m.is_empty());
    }
}
