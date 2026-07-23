import { describe, it, expect } from "vitest";
import { validarRung } from "../src/ladder/validar_rung";
import { ElementoLadder, RedContactos, RungArbol } from "../src/ladder/network_tree";

// ── Helpers de construcción compactos (mismo estilo que arbol_translator.test.ts) ──
const el = (e: ElementoLadder): RedContactos => ({ tipo: "elemento", elemento: e });
const na = (v: string) => el({ tipo: "contacto_na", variable: v });
const nc = (v: string) => el({ tipo: "contacto_nc", variable: v });
const coil = (v: string) => el({ tipo: "bobina", variable: v });
const serie = (...es: RedContactos[]): RedContactos => ({ tipo: "serie", elementos: es });
const paralelo = (...rs: RedContactos[]): RedContactos => ({ tipo: "paralelo", ramas: rs });
const vacio: RedContactos = { tipo: "vacio" };

const rung = (red: RedContactos, id = "1"): RungArbol => ({ id, red });

describe("validarRung", () => {
  it("1. rung vacío (nodo 'vacio' desnudo) → error 'Rung vacío'", () => {
    const errores = validarRung(rung(vacio));
    expect(errores).toEqual([{ nivel: "error", mensaje: "Rung vacío" }]);
  });

  it("1b. rung vacío (serie con solo placeholders, incluso anidada) → error 'Rung vacío'", () => {
    const errores = validarRung(rung(serie(vacio, paralelo(vacio, vacio))));
    expect(errores).toEqual([{ nivel: "error", mensaje: "Rung vacío" }]);
  });

  it("2. rung con contactos pero ninguna salida → error 'Rung sin salida'", () => {
    const errores = validarRung(rung(serie(na("A"), nc("B"))));
    expect(errores).toContainEqual({ nivel: "error", mensaje: "Rung sin salida" });
  });

  it("3. salida sin ningún contacto antes → error 'Salida sin condición'", () => {
    const errores = validarRung(rung(serie(coil("Q"))));
    expect(errores).toContainEqual(
      expect.objectContaining({ nivel: "error", mensaje: "Salida sin condición" })
    );
  });

  it("3b. salida con un contacto antes en la misma serie → sin error de condición", () => {
    const errores = validarRung(rung(serie(na("A"), coil("Q"))));
    expect(errores.some((e) => e.mensaje === "Salida sin condición")).toBe(false);
  });

  it("3c. salida después de un paralelo donde al menos una rama tiene contacto → sin error de condición", () => {
    const red = serie(paralelo(na("A"), na("Latch")), coil("Q"));
    const errores = validarRung(rung(red));
    expect(errores.some((e) => e.mensaje === "Salida sin condición")).toBe(false);
  });

  it("4. salida dentro de una rama paralela (no al final del tronco) → warning", () => {
    const red = serie(na("A"), paralelo(nc("B"), coil("Q")));
    const errores = validarRung(rung(red));
    expect(errores).toContainEqual(
      expect.objectContaining({
        nivel: "warning",
        mensaje: expect.stringContaining("Salida dentro de una rama paralela"),
      })
    );
  });

  it("4b. salida al final del tronco principal (después de cerrar el paralelo) → sin warning de rama", () => {
    const red = serie(paralelo(na("A"), na("B")), coil("Q"));
    const errores = validarRung(rung(red));
    expect(errores.some((e) => e.mensaje.startsWith("Salida dentro de una rama paralela"))).toBe(false);
  });

  it("5. bifurcación con un solo camino → warning 'Bifurcación con un solo camino'", () => {
    const red = serie(na("A"), paralelo(nc("B")), coil("Q"));
    const errores = validarRung(rung(red));
    expect(errores).toContainEqual({
      nivel: "warning",
      mensaje: "Bifurcación con un solo camino",
      rutaNodo: [1],
    });
  });

  it("6. rung limpio y completo (serie con contacto y salida) → sin errores ni warnings", () => {
    const red = serie(na("Start"), nc("Stop"), coil("Motor"));
    expect(validarRung(rung(red))).toEqual([]);
  });

  it("7. rung con varios problemas a la vez acumula todos los hallazgos", () => {
    // Salida sin condición Y dentro de una rama paralela con un solo camino.
    const red = serie(paralelo(coil("Q")));
    const errores = validarRung(rung(red));
    const mensajes = errores.map((e) => e.mensaje).sort();
    expect(mensajes).toEqual(
      [
        "Bifurcación con un solo camino",
        "Salida dentro de una rama paralela (debería ir al final del tronco principal)",
        "Salida sin condición",
      ].sort()
    );
  });

  it("8. rutaNodo apunta al nodo correcto de la salida problemática", () => {
    // Rama 0 tiene un contacto, rama 1 es una serie con la bobina sin condición
    // propia (cada rama de un "paralelo" se valida de forma independiente).
    const red = paralelo(na("A"), serie(coil("Q")));
    const errores = validarRung(rung(red));
    const err = errores.find((e) => e.mensaje === "Salida sin condición");
    // paralelo.ramas[1] → serie.elementos[0] (la bobina).
    expect(err?.rutaNodo).toEqual([1, 0]);
  });
});
