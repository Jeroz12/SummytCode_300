import { describe, it, expect } from "vitest";
import { traducirLadderAAST } from "../src/ladder/ladder_translator";
import { LadderPrograma } from "../src/ladder/types";
import { Asignacion, Ton } from "../src/ast/types";

/** Helper: envuelve un rung en un LadderPrograma mínimo. */
function programa(rung: LadderPrograma["rungs"][number]): LadderPrograma {
  return { nombre: "Test", variables: [], rungs: [rung] };
}

describe("traducirLadderAAST", () => {
  // 1. Rung simple: 1 contacto en serie → 1 bobina.
  it("traduce 1 contacto en serie hacia 1 bobina", () => {
    const ast = traducirLadderAAST(
      programa({
        id: 1,
        ramas: [
          {
            elementos: [
              { id: "c1", tipo: "contacto_na", variable: "Start", posicion: { fila: 0, columna: 0 } },
            ],
          },
        ],
        salidas: [{ id: "o1", tipo: "bobina", variable: "Motor", posicion: { fila: 0, columna: 1 } }],
      })
    );

    expect(ast.lenguaje_fuente).toBe("ladder");
    expect(ast.networks).toHaveLength(1);

    const expr = ast.networks[0].expresiones[0] as Asignacion;
    expect(expr).toEqual({
      tipo: "asignacion",
      variable: "Motor",
      valor: { tipo: "contacto_na", variable: "Start" },
    });
  });

  // 2. Rung con 2 contactos en serie (AND).
  it("traduce 2 contactos en serie hacia un AND", () => {
    const ast = traducirLadderAAST(
      programa({
        id: 1,
        ramas: [
          {
            elementos: [
              { id: "c1", tipo: "contacto_na", variable: "Start", posicion: { fila: 0, columna: 0 } },
              { id: "c2", tipo: "contacto_na", variable: "Enable", posicion: { fila: 0, columna: 1 } },
            ],
          },
        ],
        salidas: [{ id: "o1", tipo: "bobina", variable: "Motor", posicion: { fila: 0, columna: 2 } }],
      })
    );

    const expr = ast.networks[0].expresiones[0] as Asignacion;
    expect(expr.valor).toEqual({
      tipo: "and",
      izq: { tipo: "contacto_na", variable: "Start" },
      der: { tipo: "contacto_na", variable: "Enable" },
    });
  });

  // 3. Rung con 2 ramas en paralelo (OR) — patrón de enclavamiento típico.
  it("traduce 2 ramas en paralelo hacia un OR", () => {
    const ast = traducirLadderAAST(
      programa({
        id: 1,
        ramas: [
          {
            elementos: [
              { id: "c1", tipo: "contacto_na", variable: "Start", posicion: { fila: 0, columna: 0 } },
            ],
          },
          {
            elementos: [
              { id: "c2", tipo: "contacto_na", variable: "Enclavamiento", posicion: { fila: 1, columna: 0 } },
            ],
          },
        ],
        salidas: [{ id: "o1", tipo: "bobina", variable: "Motor", posicion: { fila: 0, columna: 1 } }],
      })
    );

    const expr = ast.networks[0].expresiones[0] as Asignacion;
    expect(expr.valor).toEqual({
      tipo: "or",
      izq: { tipo: "contacto_na", variable: "Start" },
      der: { tipo: "contacto_na", variable: "Enclavamiento" },
    });
  });

  // 4. Rung con TON: el contacto de la rama alimenta el IN del timer.
  it("traduce un rung con TON", () => {
    const ast = traducirLadderAAST(
      programa({
        id: 1,
        ramas: [
          {
            elementos: [
              { id: "c1", tipo: "contacto_na", variable: "Sensor", posicion: { fila: 0, columna: 0 } },
            ],
          },
        ],
        salidas: [
          {
            id: "t1",
            tipo: "ton",
            variable: "Sensor",
            parametros: { pt_ms: 5000, q_var: "Alarma", et_var: "Transcurrido" },
            posicion: { fila: 0, columna: 1 },
          },
        ],
      })
    );

    const expr = ast.networks[0].expresiones[0] as Ton;
    expect(expr).toEqual({
      tipo: "ton",
      in: { tipo: "contacto_na", variable: "Sensor" },
      pt_ms: 5000,
      q_var: "Alarma",
      et_var: "Transcurrido",
    });
  });

  // 4b. TON con entrada COMPUESTA: la lógica del rung (AND de 2 contactos) va a `in`.
  it("traduce un TON con entrada compuesta (AND de dos contactos en serie)", () => {
    const ast = traducirLadderAAST(
      programa({
        id: 1,
        ramas: [
          {
            elementos: [
              { id: "c1", tipo: "contacto_na", variable: "Sensor1", posicion: { fila: 0, columna: 0 } },
              { id: "c2", tipo: "contacto_nc", variable: "Sensor2", posicion: { fila: 0, columna: 1 } },
            ],
          },
        ],
        salidas: [
          {
            id: "t1",
            tipo: "ton",
            variable: "TempTimer",
            parametros: { pt_ms: 5000, q_var: "Alarma" },
            posicion: { fila: 0, columna: 2 },
          },
        ],
      })
    );

    const ton = ast.networks[0].expresiones[0] as Ton;
    expect(ton.in).toEqual({
      tipo: "and",
      izq: { tipo: "contacto_na", variable: "Sensor1" },
      der: { tipo: "contacto_nc", variable: "Sensor2" },
    });
    expect(ton.pt_ms).toBe(5000);
    expect(ton.q_var).toBe("Alarma");
  });

  // 5. Extra: contacto NC + bobina RESET (bobina sin condición → lógica líder).
  it("traduce un contacto NC hacia una bobina RESET con lógica líder", () => {
    const ast = traducirLadderAAST(
      programa({
        id: 1,
        ramas: [
          {
            elementos: [
              { id: "c1", tipo: "contacto_nc", variable: "Stop", posicion: { fila: 0, columna: 0 } },
            ],
          },
        ],
        salidas: [{ id: "o1", tipo: "bobina_reset", variable: "Motor", posicion: { fila: 0, columna: 1 } }],
      })
    );

    expect(ast.networks[0].expresiones).toEqual([
      { tipo: "contacto_nc", variable: "Stop" },
      { tipo: "bobina_r", variable: "Motor" },
    ]);
  });
});
