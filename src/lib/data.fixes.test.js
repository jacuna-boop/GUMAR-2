// Pruebas de los arreglos puntuales de octubre 2026 (PR "bugs puntuales").
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  parseColombianNumber,
  addMonths,
  addWorkingDays,
  todayISO,
  computeCronogramaSchedule,
  parseCronogramaPaste,
  cronogramaAvanceActual,
  buildCurvaSData,
  ensureFullProjectData,
} from "./data.js";

describe("parseColombianNumber — formatos ambiguos", () => {
  it("un punto sin 3 dígitos después es decimal", () => {
    expect(parseColombianNumber("0.5")).toBe(0.5);
    expect(parseColombianNumber("1.5")).toBe(1.5);
    expect(parseColombianNumber("12.75")).toBe(12.75);
  });
  it("un punto con 3 dígitos después sigue siendo miles", () => {
    expect(parseColombianNumber("338.282")).toBe(338282);
  });
  it("formato de EE. UU. con comas de miles", () => {
    expect(parseColombianNumber("1,234,567")).toBe(1234567);
    expect(parseColombianNumber("1,234.56")).toBeCloseTo(1234.56);
  });
  it("números ya numéricos pasan tal cual", () => {
    expect(parseColombianNumber(1234.567)).toBe(1234.567);
    expect(parseColombianNumber(NaN)).toBe(0);
  });
});

describe("fechas", () => {
  afterEach(() => vi.useRealTimers());

  it("todayISO usa la fecha local, no UTC", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 13, 23, 30)); // 13 oct, 11:30 pm local
    expect(todayISO()).toBe("2026-10-13");
  });
  it("addMonths no se desborda al mes siguiente", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-03-15", 6)).toBe("2026-09-15");
    expect(addMonths("2026-08-31", 9)).toBe("2027-05-31");
  });
  it("addWorkingDays sin fecha devuelve vacío en vez de reventar", () => {
    expect(addWorkingDays("", 3)).toBe("");
    expect(addWorkingDays(undefined, 3)).toBe("");
  });
});

describe("computeCronogramaSchedule", () => {
  it("no revienta si la predecesora no tiene fechas, y deja la tarea como estaba", () => {
    const tasks = [
      { id: "a", displayId: "1", nombre: "Sin fechas", fechaInicio: "", fechaFin: "", predecesoras: "", duracionTexto: "5 días" },
      { id: "b", displayId: "2", nombre: "Depende de 1", fechaInicio: "2026-03-02", fechaFin: "2026-03-06", predecesoras: "1", duracionTexto: "4 días" },
    ];
    const out = computeCronogramaSchedule(tasks);
    expect(out[1].fechaInicio).toBe("2026-03-02");
    expect(out[1].fechaFin).toBe("2026-03-06");
  });
});

describe("parseCronogramaPaste", () => {
  it("tolera filas con menos columnas que el encabezado", () => {
    const text = "Id\tNombre\tDuración\tComienzo\tFin\tPredecesoras\t% completado\n1\tExcavación\n2\tObra civil\t0 días\tlun 02/03/26\tvie 06/03/26";
    const { tasks } = parseCronogramaPaste(text);
    expect(tasks.map((t) => t.nombre)).toEqual(["Excavación", "Obra civil"]);
  });
});

describe("avance del cronograma normalizado por peso", () => {
  const tasks = [
    { id: "a", peso: 30, pctCompletado: 100, fechaInicio: "2026-01-01", fechaFin: "2026-01-11" },
    { id: "b", peso: 30, pctCompletado: 0, fechaInicio: "2026-01-11", fechaFin: "2026-01-21" },
  ];
  it("da % real aunque los pesos sumen 60 y no 100", () => {
    expect(cronogramaAvanceActual(tasks)).toBe(50);
  });
  it("con pesos que suman 100 da lo mismo que antes", () => {
    expect(cronogramaAvanceActual([{ peso: 100, pctCompletado: 40 }])).toBe(40);
    expect(cronogramaAvanceActual([{ peso: 1, pctCompletado: 100 }])).toBe(100);
  });
  it("la línea base termina en 100 aunque los pesos no sumen 100", () => {
    const data = buildCurvaSData({ tasks, seguimiento: [] }, "2026-02-01");
    expect(data[data.length - 1].base).toBe(100);
  });
});

describe("ensureFullProjectData — no descarta datos", () => {
  it("conserva el presupuesto en formato viejo {items} como base", () => {
    const out = ensureFullProjectData({ presupuesto: { items: [{ id: "x", descripcion: "Paneles" }] } });
    expect(out.presupuesto.base).toHaveLength(1);
    expect(Array.isArray(out.presupuesto.ejecucion)).toBe(true);
  });
  it("base/ejecución que no son listas no rompen la app", () => {
    const out = ensureFullProjectData({ presupuesto: { base: "basura", ejecucion: [{ id: "e" }] } });
    expect(out.presupuesto.base).toEqual([]);
    expect(out.presupuesto.ejecucion).toHaveLength(1);
  });
  it("UPME con pasos guardados conserva lo existente y completa los que falten", () => {
    const out = ensureFullProjectData({ upme: { steps: { p1: { completado: true, fecha: "2026-01-01" } } } });
    expect(out.upme.steps.p1.completado).toBe(true);
    expect(Object.keys(out.upme.steps).length).toBeGreaterThan(1);
  });
});
