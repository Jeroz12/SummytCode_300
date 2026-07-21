//! Módulo de comunicación serie — PLACEHOLDER.
//!
//! Aquí vivirá la lógica de:
//!   - Apertura/cierre de conexión serial para el MONITOREO EN VIVO de variables
//!     (Fase 3 del roadmap), usando la crate `serialport`.
//!   - Envío/recepción de tramas Modbus (TCP/RTU) para lectura/escritura de
//!     variables en tiempo real (fase futura, siguiendo el precedente de OpenPLC).
//!
//! Por ahora solo existe la estructura del módulo. La enumeración de puertos
//! disponibles ya está implementada en `commands::get_serial_ports`.

/// Stub: futura apertura de puerto serie para monitoreo en vivo.
#[allow(dead_code)]
pub fn placeholder_monitor_setup() {
    // TODO: implementar apertura de puerto serie para monitoreo en vivo
    // usando la crate `serialport`, en la fase de conexión del pipeline.
}
