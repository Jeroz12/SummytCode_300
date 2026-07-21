import { describe, it, expect } from "vitest";
import { STParser } from "../src/parsers/st_parser";
import { Asignacion, Bobina, Ton, Comparacion } from "../src/ast/types";

describe("STParser", () => {
  // 1. Asignación simple de nivel superior.
  it("parsea una asignación simple", () => {
    const parser = new STParser();
    const ast = parser.parse("Motor := TRUE;");

    expect(ast.lenguaje_fuente).toBe("st");
    expect(ast.networks).toHaveLength(1);

    const expr = ast.networks[0].expresiones[0];
    expect(expr.tipo).toBe("asignacion");
    const asig = expr as Asignacion;
    expect(asig.variable).toBe("Motor");
    expect(asig.valor).toEqual({ tipo: "literal", valor: true });
  });

  // 2. Declaración de variables.
  it("parsea un bloque de declaración de variables", () => {
    const parser = new STParser();
    const ast = parser.parse(`
      VAR
        Start : BOOL;
        Motor AT %QX0.0 : BOOL;
        Cuenta : INT := 0;
      END_VAR
    `);

    expect(ast.variables).toHaveLength(3);

    expect(ast.variables[0]).toMatchObject({ nombre: "Start", tipo: "BOOL", clase: "VAR" });
    expect(ast.variables[1]).toMatchObject({
      nombre: "Motor",
      tipo: "BOOL",
      direccion_iec: "%QX0.0",
    });
    expect(ast.variables[2]).toMatchObject({ nombre: "Cuenta", tipo: "INT", valor_inicial: 0 });
  });

  // 3. IF / THEN se traduce a contacto NA + bobina.
  it("parsea IF/THEN como contacto + bobina", () => {
    const parser = new STParser();
    const ast = parser.parse(`
      IF Start THEN
        Motor := TRUE;
      END_IF;
    `);

    const exprs = ast.networks[0].expresiones;
    expect(exprs[0]).toEqual({ tipo: "contacto_na", variable: "Start" });

    expect(exprs[1].tipo).toBe("bobina");
    const bobina = exprs[1] as Bobina;
    expect(bobina.variable).toBe("Motor");
    expect(bobina.negar).toBe(false);
  });

  // 4. Timer TON en forma de llamada de función.
  it("parsea un timer TON con preset en tiempo", () => {
    const parser = new STParser();
    const ast = parser.parse("TON(IN := Start, PT := T#5s, Q => Motor, ET => Transcurrido);");

    const expr = ast.networks[0].expresiones[0];
    expect(expr.tipo).toBe("ton");
    const ton = expr as Ton;
    // `in` es una Expresion: una variable simple se modela como contacto NA.
    expect(ton.in).toEqual({ tipo: "contacto_na", variable: "Start" });
    expect(ton.pt_ms).toBe(5000);
    expect(ton.q_var).toBe("Motor");
    expect(ton.et_var).toBe("Transcurrido");
  });

  // 4b. TON con entrada COMPUESTA (el caso que motivó extender el AST).
  it("parsea un TON con entrada compuesta (AND de dos contactos)", () => {
    const parser = new STParser();
    const ast = parser.parse("TON(IN := Sensor1 AND NOT Sensor2, PT := T#5s, Q => Alarma);");

    const ton = ast.networks[0].expresiones[0] as Ton;
    expect(ton.in).toEqual({
      tipo: "and",
      izq: { tipo: "contacto_na", variable: "Sensor1" },
      der: { tipo: "contacto_nc", variable: "Sensor2" },
    });
    expect(ton.pt_ms).toBe(5000);
    expect(ton.q_var).toBe("Alarma");
  });

  // 5. Manejo de errores: código inválido lanza un error legible con línea.
  it("lanza un error claro ante código inválido", () => {
    const parser = new STParser();
    // Falta el ';' final de la asignación.
    expect(() => parser.parse("Motor := TRUE")).toThrow(/línea/);
  });

  // Extra: comparación numérica (INT).
  it("parsea una comparación dentro de una condición", () => {
    const parser = new STParser();
    const ast = parser.parse(`
      IF Cuenta > 10 THEN
        Lleno := TRUE;
      END_IF;
    `);

    const cond = ast.networks[0].expresiones[0];
    expect(cond.tipo).toBe("comparacion");
    const cmp = cond as Comparacion;
    expect(cmp.operador).toBe(">");
    expect(cmp.izq).toEqual({ tipo: "contacto_na", variable: "Cuenta" });
    expect(cmp.der).toEqual({ tipo: "literal", valor: 10 });
  });

  // 6. Notación de punto en la salida Q de un TON: "Timer1.Q" debe parsear sin error.
  it("parsea TON con notación de punto en Q (Timer1.Q)", () => {
    const parser = new STParser();
    const ast = parser.parse("TON(IN:=Motor, PT:=T#5s, Q=>Timer1.Q);");

    const ton = ast.networks[0].expresiones[0] as Ton;
    expect(ton.q_var).toBe("Timer1");
  });

  // 7. "Q=>Timer1.Q" y "Q=>Timer1" deben producir el mismo AST (el ".Q" es azúcar sintáctica).
  it("produce el mismo AST con y sin notación de punto en Q", () => {
    const conPunto = new STParser().parse("TON(IN:=Motor, PT:=T#5s, Q=>Timer1.Q);");
    const sinPunto = new STParser().parse("TON(IN:=Motor, PT:=T#5s, Q=>Timer1);");

    expect(conPunto).toEqual(sinPunto);
  });

  // 8. Notación de punto con campo incorrecto lanza un error descriptivo.
  it("lanza un error si el campo tras el punto no coincide con el parámetro", () => {
    const parser = new STParser();
    expect(() =>
      parser.parse("TON(IN:=Motor, PT:=T#5s, Q=>Timer1.CV);")
    ).toThrow(/Campo 'CV' inesperado para el parámetro Q en Timer1/);
  });
});
