import { describe, it, expect } from "vitest";
import {
  RedContactos,
  ElementoLadder,
  redVacia,
  obtenerNodo,
  colocarElemento,
  eliminarElemento,
  insertarSerieAntes,
  insertarSerieDespues,
  bifurcar,
  agregarCaminoParalelo,
  eliminarCamino,
} from "../src/ladder/network_tree";

/** Helpers de construcción de elementos para los tests. */
const contacto = (variable: string): ElementoLadder => ({ tipo: "contacto_na", variable });
const bobina = (variable: string): ElementoLadder => ({ tipo: "bobina", variable });
const elem = (variable: string): RedContactos => ({ tipo: "elemento", elemento: contacto(variable) });
const vacio: RedContactos = { tipo: "vacio" };

describe("network_tree: operaciones de edición", () => {
  // ── (1) colocarElemento ────────────────────────────────────────────────────
  describe("colocarElemento", () => {
    it("reemplaza el 'vacio' de una serie por un elemento", () => {
      const red = redVacia(); // serie[vacio]
      const out = colocarElemento(red, [0], contacto("Start"));
      expect(out).toEqual({ tipo: "serie", elementos: [elem("Start")] });
    });

    it("es inmutable: no muta la red de entrada", () => {
      const red = redVacia();
      const copia = JSON.parse(JSON.stringify(red));
      colocarElemento(red, [0], contacto("Start"));
      expect(red).toEqual(copia);
    });

    it("coloca en un nodo anidado profundo por su ruta", () => {
      // serie[ paralelo[ serie[vacio], serie[vacio] ] ]
      const red: RedContactos = {
        tipo: "serie",
        elementos: [{ tipo: "paralelo", ramas: [redVacia(), redVacia()] }],
      };
      const out = colocarElemento(red, [0, 1, 0], contacto("Motor"));
      expect(obtenerNodo(out, [0, 1, 0])).toEqual(elem("Motor"));
      // el otro camino sigue vacío
      expect(obtenerNodo(out, [0, 0, 0])).toEqual(vacio);
    });
  });

  // ── (2) eliminarElemento ───────────────────────────────────────────────────
  describe("eliminarElemento", () => {
    it("hace splice del índice si la serie tiene más de un hijo", () => {
      const red: RedContactos = { tipo: "serie", elementos: [elem("A"), elem("B"), elem("C")] };
      const out = eliminarElemento(red, [1]);
      expect(out).toEqual({ tipo: "serie", elementos: [elem("A"), elem("C")] });
    });

    it("deja un 'vacio' si era el único hijo de la serie", () => {
      const red: RedContactos = { tipo: "serie", elementos: [elem("A")] };
      const out = eliminarElemento(red, [0]);
      expect(out).toEqual({ tipo: "serie", elementos: [vacio] });
    });

    it("reemplaza por serie vacía si el padre es un paralelo", () => {
      const red: RedContactos = { tipo: "paralelo", ramas: [elem("A"), elem("B")] };
      const out = eliminarElemento(red, [0]);
      expect(out).toEqual({ tipo: "paralelo", ramas: [redVacia(), elem("B")] });
    });
  });

  // ── (3) insertarSerieAntes / Despues ───────────────────────────────────────
  describe("insertarSerie", () => {
    it("inserta después dentro de la misma serie padre", () => {
      const red: RedContactos = { tipo: "serie", elementos: [elem("A"), elem("B")] };
      const out = insertarSerieDespues(red, [0], contacto("X"));
      expect(out).toEqual({ tipo: "serie", elementos: [elem("A"), elem("X"), elem("B")] });
    });

    it("inserta antes dentro de la misma serie padre", () => {
      const red: RedContactos = { tipo: "serie", elementos: [elem("A"), elem("B")] };
      const out = insertarSerieAntes(red, [1], contacto("X"));
      expect(out).toEqual({ tipo: "serie", elementos: [elem("A"), elem("X"), elem("B")] });
    });

    it("envuelve el nodo en una serie nueva si el padre no es serie (rama de paralelo)", () => {
      const red: RedContactos = { tipo: "paralelo", ramas: [elem("A"), elem("B")] };
      const out = insertarSerieDespues(red, [0], contacto("X"));
      expect(out).toEqual({
        tipo: "paralelo",
        ramas: [{ tipo: "serie", elementos: [elem("A"), elem("X")] }, elem("B")],
      });
    });
  });

  // ── (4) bifurcar ────────────────────────────────────────────────────────────
  describe("bifurcar", () => {
    it("convierte un elemento en un paralelo [original, serie vacía]", () => {
      const red: RedContactos = { tipo: "serie", elementos: [elem("Start")] };
      const out = bifurcar(red, [0]);
      expect(out).toEqual({
        tipo: "serie",
        elementos: [{ tipo: "paralelo", ramas: [elem("Start"), redVacia()] }],
      });
    });

    it("bifurca DENTRO de una rama ya bifurcada (rama anidada) sin límite", () => {
      // serie[ paralelo[ elem A, serie[vacio] ] ]  → bifurcar el elem A
      const red: RedContactos = {
        tipo: "serie",
        elementos: [{ tipo: "paralelo", ramas: [elem("A"), redVacia()] }],
      };
      const out = bifurcar(red, [0, 0]);
      // el camino 0 del paralelo externo pasa a ser un paralelo interno
      expect(obtenerNodo(out, [0, 0])).toEqual({
        tipo: "paralelo",
        ramas: [elem("A"), redVacia()],
      });
      // el paralelo externo conserva su segundo camino vacío
      expect(obtenerNodo(out, [0, 1])).toEqual(redVacia());
    });
  });

  // ── (5) agregarCaminoParalelo ──────────────────────────────────────────────
  describe("agregarCaminoParalelo", () => {
    it("agrega un tercer camino vacío a un paralelo de dos", () => {
      const red: RedContactos = { tipo: "paralelo", ramas: [elem("A"), elem("B")] };
      const out = agregarCaminoParalelo(red, []);
      expect(out).toEqual({ tipo: "paralelo", ramas: [elem("A"), elem("B"), redVacia()] });
    });

    it("lanza si la ruta no apunta a un paralelo", () => {
      const red: RedContactos = { tipo: "serie", elementos: [elem("A")] };
      expect(() => agregarCaminoParalelo(red, [0])).toThrow();
    });
  });

  // ── (6) eliminarCamino ─────────────────────────────────────────────────────
  describe("eliminarCamino", () => {
    it("hace splice de un camino cuando quedan >= 2", () => {
      const red: RedContactos = { tipo: "paralelo", ramas: [elem("A"), elem("B"), elem("C")] };
      const out = eliminarCamino(red, [], 1);
      expect(out).toEqual({ tipo: "paralelo", ramas: [elem("A"), elem("C")] });
    });

    it("DESENVUELVE el paralelo si queda una sola rama (colapsa)", () => {
      const red: RedContactos = { tipo: "serie", elementos: [{ tipo: "paralelo", ramas: [elem("A"), elem("B")] }] };
      const out = eliminarCamino(red, [0], 1);
      // el paralelo colapsa a su única rama restante (elem A) dentro de la serie
      expect(out).toEqual({ tipo: "serie", elementos: [elem("A")] });
    });
  });

  // ── obtenerNodo / rutas inválidas ──────────────────────────────────────────
  describe("obtenerNodo", () => {
    it("[] devuelve la raíz", () => {
      const red = redVacia();
      expect(obtenerNodo(red, [])).toBe(red);
    });
    it("lanza en una ruta inválida", () => {
      const red = redVacia();
      expect(() => obtenerNodo(red, [5])).toThrow();
    });
  });
});
