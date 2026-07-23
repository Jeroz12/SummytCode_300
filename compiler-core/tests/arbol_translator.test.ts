import { describe, it, expect } from "vitest";
import {
  advertenciasArbol,
  recolectarSalidas,
  redAExpresion,
  traducirArbolAAST,
} from "../src/ladder/arbol_translator";
import { ElementoLadder, ProgramaArbol, RedContactos } from "../src/ladder/network_tree";
import { Asignacion, Ton, VariableDeclaration } from "../src/ast/types";
import { CGenerator } from "../src/codegen/c_generator";
import { avrAtmega328Target } from "../src/codegen/targets/avr_atmega328";
import type { BoardJson } from "../src/codegen/types";

// ── Constructores compactos del árbol ────────────────────────────────────────
const el = (e: ElementoLadder): RedContactos => ({ tipo: "elemento", elemento: e });
const na = (v: string) => el({ tipo: "contacto_na", variable: v });
const nc = (v: string) => el({ tipo: "contacto_nc", variable: v });
const coil = (v: string) => el({ tipo: "bobina", variable: v });
const serie = (...es: RedContactos[]): RedContactos => ({ tipo: "serie", elementos: es });
const paralelo = (...rs: RedContactos[]): RedContactos => ({ tipo: "paralelo", ramas: rs });

/** Genera el C de un rung de un solo árbol y devuelve el contenido del archivo. */
function generarC(red: RedContactos, variables: VariableDeclaration[] = []): string {
  const programa: ProgramaArbol = { rungs: [{ id: "1", red }] };
  const ast = traducirArbolAAST(programa, variables, "T");
  const board: BoardJson = { canales_io: [] };
  return new CGenerator().generate(ast, board, avrAtmega328Target).files[0].contenido;
}

describe("redAExpresion (árbol → lógica de entrada)", () => {
  it("un rung vacío no aporta lógica (null)", () => {
    expect(redAExpresion({ tipo: "vacio" })).toBeNull();
    expect(redAExpresion(serie({ tipo: "vacio" }))).toBeNull();
  });

  it("serie de contactos = AND anidado", () => {
    expect(redAExpresion(serie(na("A"), na("B")))).toEqual({
      tipo: "and",
      izq: { tipo: "contacto_na", variable: "A" },
      der: { tipo: "contacto_na", variable: "B" },
    });
  });

  it("paralelo de contactos = OR anidado", () => {
    expect(redAExpresion(paralelo(na("A"), na("B")))).toEqual({
      tipo: "or",
      izq: { tipo: "contacto_na", variable: "A" },
      der: { tipo: "contacto_na", variable: "B" },
    });
  });

  it("una bobina no aporta a la lógica de entrada (se ignora como identidad)", () => {
    // serie[Start, coil] → sólo Start es lógica de entrada.
    expect(redAExpresion(serie(na("Start"), coil("Motor")))).toEqual({
      tipo: "contacto_na",
      variable: "Start",
    });
  });
});

describe("recolectarSalidas", () => {
  it("recolecta bobinas/bloques en orden de aparición", () => {
    const red = serie(na("A"), coil("Y1"), coil("Y2"));
    expect(recolectarSalidas(red).map((s) => s.variable)).toEqual(["Y1", "Y2"]);
  });
});

describe("traducirArbolAAST → C (regresión, forma no-distribuida equivalente)", () => {
  // 1. Contacto simple → bobina.
  it("1 contacto NA + bobina → Motor = Start", () => {
    expect(generarC(serie(na("Start"), coil("Motor")))).toContain("Motor = Start;");
  });

  // 2. Dos contactos en serie → AND.
  it("2 contactos en serie → AND", () => {
    const ast = traducirArbolAAST({ rungs: [{ id: "1", red: serie(na("Start"), nc("Stop"), coil("Motor")) }] }, []);
    const asign = ast.networks[0].expresiones[0] as Asignacion;
    expect(asign.valor).toEqual({
      tipo: "and",
      izq: { tipo: "contacto_na", variable: "Start" },
      der: { tipo: "contacto_nc", variable: "Stop" },
    });
    expect(generarC(serie(na("Start"), nc("Stop"), coil("Motor")))).toContain(
      "Motor = (Start && (!Stop));"
    );
  });

  // 3. Enclavamiento (self-holding): Start OR Motor → bobina Motor.
  it("enclavamiento: Motor = (Start || Motor)", () => {
    const red = serie(paralelo(na("Start"), na("Motor")), coil("Motor"));
    const variables: VariableDeclaration[] = [
      { nombre: "Start", tipo: "BOOL", clase: "VAR_INPUT", direccion_iec: "%IX0.0" },
      { nombre: "Motor", tipo: "BOOL", clase: "VAR_OUTPUT", direccion_iec: "%QX0.0" },
    ];
    expect(generarC(red, variables)).toContain("Motor = (Start || Motor);");
    // El enclavamiento (contactos en paralelo) NO dispara advertencia de bobinas.
    expect(advertenciasArbol({ rungs: [{ id: "1", red }] })).toHaveLength(0);
  });

  // 4. TON como salida: el contacto alimenta el IN, params pasan tal cual.
  it("TON como salida conserva parámetros y su IN es la lógica del rung", () => {
    const red = serie(na("Sensor"), el({ tipo: "ton", variable: "T1", parametros: { pt_ms: 5000, q_var: "Alarma" } }));
    const ast = traducirArbolAAST({ rungs: [{ id: "1", red }] }, []);
    const ton = ast.networks[0].expresiones[0] as Ton;
    expect(ton.tipo).toBe("ton");
    expect(ton.in).toEqual({ tipo: "contacto_na", variable: "Sensor" });
    expect(ton.pt_ms).toBe(5000);
    expect(ton.q_var).toBe("Alarma");
  });

  // 5. (Start || Motor) && !Stop — enclavamiento clásico, forma NO distribuida.
  it("enclavamiento con Stop en serie: (Start || Motor) && !Stop", () => {
    const red = serie(paralelo(na("Start"), na("Motor")), nc("Stop"), coil("Motor"));
    expect(generarC(red)).toContain("Motor = ((Start || Motor) && (!Stop));");
  });

  // 6. Tres caminos paralelos en un grupo.
  it("3 caminos paralelos → Y = ((A || B) || C)", () => {
    const red = serie(paralelo(na("A"), na("B"), na("C")), coil("Y"));
    expect(generarC(red)).toContain("Y = ((A || B) || C);");
  });

  // 7. Dos grupos DISJUNTOS en serie → AND de ORs.
  it("2 grupos paralelos en serie → AND de ORs", () => {
    const red = serie(paralelo(na("T1"), na("R1")), paralelo(na("T2"), na("R2")), coil("Y"));
    expect(generarC(red)).toContain("Y = ((T1 || R1) && (T2 || R2));");
  });

  // 8. Enclavamiento de 3 caminos con Stop en serie.
  it("enclavamiento de 3 caminos: (Start || Motor || Manual) && !Stop", () => {
    const red = serie(paralelo(na("Start"), na("Motor"), na("Manual")), nc("Stop"), coil("Motor"));
    expect(generarC(red)).toContain("Motor = (((Start || Motor) || Manual) && (!Stop));");
  });

  // 9. NUEVO — rama anidada dentro de otra rama (imposible en el modelo de grilla).
  //    OR( AND(A, OR(B,C)), D ) — un paralelo dentro de una serie dentro de un paralelo.
  it("rama anidada dentro de otra rama: Y = ((A && (B || C)) || D)", () => {
    const red = serie(
      paralelo(serie(na("A"), paralelo(na("B"), na("C"))), na("D")),
      coil("Y")
    );
    expect(generarC(red)).toContain("Y = ((A && (B || C)) || D);");
  });

  // 10. Bobina negada.
  it("bobina negada → Y = (!A)", () => {
    expect(generarC(serie(na("A"), el({ tipo: "bobina_negada", variable: "Y" })))).toContain(
      "Y = (!A);"
    );
  });
});

describe("advertenciasArbol", () => {
  it("advierte cuando hay más de una bobina de salida en el rung", () => {
    const red = serie(na("A"), coil("Y1"), coil("Y2"));
    const avisos = advertenciasArbol({ rungs: [{ id: "3", red }] });
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain("Rung 3");
  });
});
