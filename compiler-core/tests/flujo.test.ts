import { describe, it, expect } from "vitest";
// `propagarFlujo` vive en el renderer (lógica de visualización, no de
// compilación), pero se testea aquí porque el tipo RedContactos y el runner de
// tests (vitest) están en compiler-core. Import cross-package por ruta relativa;
// flujo.ts es puro (solo `import type`), así que corre sin arrastrar el renderer.
import { propagarFlujo, anotarFlujo, claveFlujo } from "../../src/editors/ladder/flujo";
import type {
  ElementoLadder,
  RedContactos,
} from "../src/ladder/network_tree";

/** Helpers de construcción de red. */
const na = (variable: string): RedContactos => ({
  tipo: "elemento",
  elemento: { tipo: "contacto_na", variable },
});
const nc = (variable: string): RedContactos => ({
  tipo: "elemento",
  elemento: { tipo: "contacto_nc", variable },
});
const bobina = (variable: string): RedContactos => ({
  tipo: "elemento",
  elemento: { tipo: "bobina", variable },
});
const serie = (...elementos: RedContactos[]): RedContactos => ({ tipo: "serie", elementos });
const paralelo = (...ramas: RedContactos[]): RedContactos => ({ tipo: "paralelo", ramas });
const VACIO: RedContactos = { tipo: "vacio" };

describe("propagarFlujo", () => {
  // 1. Serie (AND): conduce solo si TODOS los contactos conducen.
  it("serie AND: true solo con todos los contactos activos", () => {
    const red = serie(na("A"), na("B"));
    expect(propagarFlujo(red, { A: true, B: true })).toBe(true);
    expect(propagarFlujo(red, { A: true, B: false })).toBe(false);
    expect(propagarFlujo(red, { A: false, B: true })).toBe(false);
  });

  // 2. Paralelo (OR): conduce si AL MENOS una rama conduce.
  it("paralelo OR: true si alguna rama conduce", () => {
    const red = paralelo(na("A"), na("B"));
    expect(propagarFlujo(red, { A: false, B: false })).toBe(false);
    expect(propagarFlujo(red, { A: true, B: false })).toBe(true);
    expect(propagarFlujo(red, { A: false, B: true })).toBe(true);
  });

  // 3. Contacto NC: conduce con la variable en FALSE (lógica invertida).
  it("NC invertido: conduce cuando la variable es false", () => {
    expect(propagarFlujo(nc("Stop"), { Stop: false })).toBe(true);
    expect(propagarFlujo(nc("Stop"), { Stop: true })).toBe(false);
  });

  // 4. Vacío: nunca bloquea.
  it("vacio siempre es true", () => {
    expect(propagarFlujo(VACIO, {})).toBe(true);
  });

  // 5. Anidado: paralelo dentro de serie (self-hold clásico).
  //    (Start OR Motor) AND NOT Stop
  it("anidado: (Start OR Motor) AND NOT Stop", () => {
    const red = serie(paralelo(na("Start"), na("Motor")), nc("Stop"));
    expect(propagarFlujo(red, { Start: true, Motor: false, Stop: false })).toBe(true);
    expect(propagarFlujo(red, { Start: false, Motor: true, Stop: false })).toBe(true);
    expect(propagarFlujo(red, { Start: true, Motor: false, Stop: true })).toBe(false);
    expect(propagarFlujo(red, { Start: false, Motor: false, Stop: false })).toBe(false);
  });

  // 6. Sin variables en el estado: un NA ausente cuenta como false.
  it("variables ausentes: NA cuenta como false, todo el AND cae", () => {
    const red = serie(na("A"), na("B"));
    expect(propagarFlujo(red, {})).toBe(false);
    // Un NC ausente sí conduce (false ⇒ NC cerrado).
    expect(propagarFlujo(nc("X"), {})).toBe(true);
  });

  // 7. Una bobina en medio de una serie no bloquea el flujo.
  it("bobina en medio de una serie no bloquea", () => {
    const red = serie(na("A"), bobina("M"), na("B"));
    expect(propagarFlujo(red, { A: true, B: true })).toBe(true);
    // Sigue mandando la lógica de los contactos, no la bobina.
    expect(propagarFlujo(red, { A: true, B: false })).toBe(false);
  });

  // 8. Paralelo con exactamente una rama activa conduce.
  it("paralelo con una sola rama activa conduce", () => {
    const red = paralelo(na("A"), nc("B"), na("C"));
    // A y C en false; B en true ⇒ su NC NO conduce; ninguna rama activa.
    expect(propagarFlujo(red, { A: false, B: true, C: false })).toBe(false);
    // C activa ⇒ conduce.
    expect(propagarFlujo(red, { A: false, B: true, C: true })).toBe(true);
  });

  // 9. Las salidas (bobina/TON/CTU) no son condición: se comportan como cable.
  it("salidas no son condición (comportan como cable)", () => {
    const ton: ElementoLadder = { tipo: "ton", variable: "T1", parametros: { pt_ms: 1000 } };
    expect(propagarFlujo({ tipo: "elemento", elemento: ton }, {})).toBe(true);
    expect(propagarFlujo(bobina("M"), { M: false })).toBe(true);
  });
});

describe("anotarFlujo", () => {
  // El nodo de un contacto abierto queda sin energizar aguas abajo.
  it("un contacto abierto corta la energía aguas abajo en una serie", () => {
    // serie( NA(A)[0], NA(B)[1] ) con A=false ⇒ B no recibe energía.
    const red = serie(na("A"), na("B"));
    const mapa = anotarFlujo(red, { A: false, B: true });
    expect(mapa.get(claveFlujo([0]))).toBe(false); // A no conduce
    expect(mapa.get(claveFlujo([1]))).toBe(false); // B sin energía aunque B=true
    expect(mapa.get(claveFlujo([]))).toBe(false); // salida de la serie
  });

  it("marca energizado el camino real y no las ramas muertas del paralelo", () => {
    // serie( paralelo( NA(Start)[0.0], NA(Motor)[0.1] )[0], bobina(M)[1] )
    const red = serie(paralelo(na("Start"), na("Motor")), bobina("M"));
    const mapa = anotarFlujo(red, { Start: true, Motor: false });
    expect(mapa.get(claveFlujo([0, 0]))).toBe(true); // rama Start energizada
    expect(mapa.get(claveFlujo([0, 1]))).toBe(false); // rama Motor muerta
    expect(mapa.get(claveFlujo([0]))).toBe(true); // el paralelo conduce
    expect(mapa.get(claveFlujo([1]))).toBe(true); // la bobina recibe energía
  });
});
