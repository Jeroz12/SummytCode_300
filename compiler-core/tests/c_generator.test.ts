import { describe, it, expect } from "vitest";
import { CGenerator } from "../src/codegen/c_generator";
import { avrAtmega328Target } from "../src/codegen/targets/avr_atmega328";
import type { Programa } from "../src/ast/types";
import type { BoardJson } from "../src/codegen/types";

const BOARD_VACIO: BoardJson = { canales_io: [] };

/** Genera el contenido de plc_program.c para un Programa dado. */
function generar(programa: Programa, board: BoardJson = BOARD_VACIO): string {
  const res = new CGenerator().generate(programa, board, avrAtmega328Target);
  expect(res.success).toBe(true);
  expect(res.files).toHaveLength(1);
  return res.files[0].contenido;
}

function programa(parcial: Partial<Programa>): Programa {
  return {
    nombre: parcial.nombre ?? "Test",
    variables: parcial.variables ?? [],
    networks: parcial.networks ?? [],
    lenguaje_fuente: parcial.lenguaje_fuente ?? "st",
  };
}

describe("CGenerator", () => {
  // 1. Declaración de variable BOOL sin dirección IEC.
  it("genera una variable BOOL sin dirección", () => {
    const c = generar(programa({ variables: [{ nombre: "Start", tipo: "BOOL", clase: "VAR" }] }));
    expect(c).toContain("uint8_t Start = 0;");
  });

  // 2. Asignación simple de un literal.
  it("genera una asignación simple", () => {
    const c = generar(
      programa({
        networks: [
          {
            id: 1,
            expresiones: [{ tipo: "asignacion", variable: "Motor", valor: { tipo: "literal", valor: true } }],
          },
        ],
      })
    );
    expect(c).toContain("Motor = 1;");
  });

  // 3. Contacto NA que alimenta una bobina.
  it("genera contacto NA + bobina", () => {
    const c = generar(
      programa({
        networks: [
          {
            id: 1,
            expresiones: [
              { tipo: "contacto_na", variable: "Start" },
              { tipo: "bobina", variable: "Motor" },
            ],
          },
        ],
      })
    );
    expect(c).toContain("Motor = (Start);");
  });

  // 4. Contactos en serie (AND) con un contacto NC.
  it("genera contactos en serie (AND)", () => {
    const c = generar(
      programa({
        networks: [
          {
            id: 1,
            expresiones: [
              {
                tipo: "asignacion",
                variable: "Motor",
                valor: {
                  tipo: "and",
                  izq: { tipo: "contacto_na", variable: "Start" },
                  der: { tipo: "contacto_nc", variable: "Stop" },
                },
              },
            ],
          },
        ],
      })
    );
    // El contacto NC se emite como (!Stop); el AND aporta el paréntesis externo.
    expect(c).toContain("Motor = (Start && (!Stop));");
  });

  // 5. Timer TON → llamada a TON_update del runtime.
  it("genera un TON con llamada a TON_update", () => {
    const c = generar(
      programa({
        variables: [{ nombre: "Timer1", tipo: "TON", clase: "VAR" }],
        networks: [
          {
            id: 1,
            expresiones: [
              { tipo: "ton", in: { tipo: "contacto_na", variable: "Motor" }, pt_ms: 5000, q_var: "Timer1" },
            ],
          },
        ],
      })
    );
    expect(c).toContain("TON_update(&Timer1, Motor, 5000UL);");
    expect(c).toContain("TON_t Timer1;");
  });

  // 6. Mapeo de I/O con pines físicos de la placa (init / read / write).
  it("genera init, lectura y escritura de I/O desde el board", () => {
    const board: BoardJson = {
      board_id: "arduino_uno",
      canales_io: [
        { direccion_iec: "%IX0.0", modo: "input", pin_fisico: "2", etiqueta_serigrafia: "D2" },
        { direccion_iec: "%QX0.0", modo: "output", pin_fisico: "10", etiqueta_serigrafia: "D10" },
      ],
    };
    const c = generar(
      programa({
        variables: [
          { nombre: "Start", tipo: "BOOL", clase: "VAR_INPUT", direccion_iec: "%IX0.0" },
          { nombre: "Motor", tipo: "BOOL", clase: "VAR_OUTPUT", direccion_iec: "%QX0.0" },
        ],
      }),
      board
    );
    expect(c).toContain("pinMode(2, INPUT);");
    expect(c).toContain("pinMode(10, OUTPUT);");
    expect(c).toContain("Start = digitalRead(2);");
    expect(c).toContain("digitalWrite(10, Motor);");
    expect(c).toContain("/* %IX0.0 → D2 */");
  });
});
