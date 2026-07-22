import { describe, it, expect } from "vitest";
import {
  parseColombianNumber,
  parsePredecesoras,
  addWorkingDays,
  computeCronogramaSchedule,
  computeCriticalPath,
  matchCronogramaTasks,
  applyCronogramaMerge,
  parseCronogramaPaste,
  parsePresupuestoPaste,
  presupuestoTotals,
  calcPresupuestoItem,
  buildPresupuestoBaseFromTemplate,
  buildCronogramaBaseFromTemplate,
  ensureFullProjectData,
  emptyEnergizacionState,
  nextEnergizacionMilestone,
  uid,
} from "./data.js";

describe("parseColombianNumber", () => {
  it("parsea miles con punto", () => {
    expect(parseColombianNumber("1.234.567")).toBe(1234567);
  });
  it("parsea decimales con coma", () => {
    expect(parseColombianNumber("1.234,56")).toBeCloseTo(1234.56);
  });
  it("parsea coma sin puntos como decimal", () => {
    expect(parseColombianNumber("1234,5")).toBeCloseTo(1234.5);
  });
  it("devuelve 0 en vacío o inválido", () => {
    expect(parseColombianNumber("")).toBe(0);
    expect(parseColombianNumber(undefined)).toBe(0);
    expect(parseColombianNumber("abc")).toBe(0);
  });
});

describe("parsePredecesoras", () => {
  it("parsea un solo id sin tipo ni retraso (default FC, lag 0)", () => {
    expect(parsePredecesoras("28")).toEqual([{ id: "28", tipo: "FC", lag: 0 }]);
  });
  it("parsea tipo y retraso positivo", () => {
    expect(parsePredecesoras("116FC+20 días")).toEqual([{ id: "116", tipo: "FC", lag: 20 }]);
  });
  it("parsea retraso negativo", () => {
    expect(parsePredecesoras("116FC-5 días")).toEqual([{ id: "116", tipo: "FC", lag: -5 }]);
  });
  it("parsea CC y FF sin retraso", () => {
    expect(parsePredecesoras("6CC")).toEqual([{ id: "6", tipo: "CC", lag: 0 }]);
    expect(parsePredecesoras("13FF")).toEqual([{ id: "13", tipo: "FF", lag: 0 }]);
  });
  it("parsea multiples predecesoras separadas por punto y coma", () => {
    expect(parsePredecesoras("91FC-5 días;56FF")).toEqual([
      { id: "91", tipo: "FC", lag: -5 },
      { id: "56", tipo: "FF", lag: 0 },
    ]);
  });
  it("parsea lista simple sin tipos", () => {
    expect(parsePredecesoras("95;96;93;94").map((p) => p.id)).toEqual(["95", "96", "93", "94"]);
  });
  it("texto vacío no produce predecesoras", () => {
    expect(parsePredecesoras("")).toEqual([]);
    expect(parsePredecesoras(null)).toEqual([]);
  });
});

describe("addWorkingDays (calendario lunes-sábado + festivos Colombia)", () => {
  it("suma saltando domingos, contando sábados como laborales", () => {
    // viernes 23/01/26 + 3 días laborales -> sáb 24, (dom 25 salta), lun 26, mar 27
    expect(addWorkingDays("2026-01-23", 3)).toBe("2026-01-27");
  });
  it("resta días laborales cuando n es negativo", () => {
    expect(addWorkingDays("2026-01-27", -3)).toBe("2026-01-23");
  });
  it("con 0 días no se mueve", () => {
    expect(addWorkingDays("2026-01-26", 0)).toBe("2026-01-26");
  });
  it("salta Año Nuevo (festivo fijo)", () => {
    // 31 dic 2024 (miércoles) + 1 día laboral debe saltar 1 ene 2025 y caer en 2 ene
    expect(addWorkingDays("2024-12-31", 1)).toBe("2025-01-02");
  });
  it("salta Navidad (festivo fijo)", () => {
    expect(addWorkingDays("2025-12-24", 1)).toBe("2025-12-26");
  });
  it("salta Jueves y Viernes Santo (dependen de la Pascua)", () => {
    // Pascua 2026 = 5 abr 2026 -> Jueves Santo 2/abr, Viernes Santo 3/abr
    expect(addWorkingDays("2026-04-01", 1)).toBe("2026-04-04");
  });
});

describe("computeCronogramaSchedule", () => {
  const base = [
    { id: "a", displayId: "1", nombre: "Ancla", duracionTexto: "0 días", fechaInicio: "2026-01-26", fechaFin: "2026-01-26", predecesoras: "", esGrupo: false },
    { id: "b", displayId: "2", nombre: "Depende de 1 (FC+20)", duracionTexto: "0 días", fechaInicio: "2026-01-01", fechaFin: "2026-01-01", predecesoras: "1FC+20 días", esGrupo: false },
    { id: "c", displayId: "3", nombre: "Depende de 2 (CC)", duracionTexto: "5 días", fechaInicio: "2026-01-01", fechaFin: "2026-01-01", predecesoras: "2CC", esGrupo: false },
  ];

  it("calcula en cascada usando FC y CC", () => {
    const out = computeCronogramaSchedule(base);
    const b = out.find((t) => t.id === "b");
    const c = out.find((t) => t.id === "c");
    expect(b.fechaInicio).toBe(addWorkingDays("2026-01-26", 20));
    expect(c.fechaInicio).toBe(b.fechaInicio);
    expect(c.fechaFin).toBe(addWorkingDays(c.fechaInicio, 5));
  });

  it("no recalcula tareas sin predecesoras válidas (quedan como ancla manual)", () => {
    const out = computeCronogramaSchedule(base);
    const a = out.find((t) => t.id === "a");
    expect(a.fechaInicio).toBe("2026-01-26");
  });

  it("ignora predecesoras que no resuelven a ningún Id existente", () => {
    const tasks = [
      { id: "x", displayId: "1", nombre: "X", duracionTexto: "0 días", fechaInicio: "2026-01-01", fechaFin: "2026-01-01", predecesoras: "999", esGrupo: false },
    ];
    const out = computeCronogramaSchedule(tasks);
    expect(out[0].fechaInicio).toBe("2026-01-01"); // sin cambios, 999 no existe
  });

  it("no entra en bucle infinito con una referencia circular", () => {
    const cyclic = [
      { id: "p", displayId: "10", nombre: "P", duracionTexto: "0 días", fechaInicio: "2026-01-01", fechaFin: "2026-01-01", predecesoras: "11", esGrupo: false },
      { id: "q", displayId: "11", nombre: "Q", duracionTexto: "0 días", fechaInicio: "2026-01-02", fechaFin: "2026-01-02", predecesoras: "10", esGrupo: false },
    ];
    expect(() => computeCronogramaSchedule(cyclic)).not.toThrow();
  });

  it("recalcula el rango de un grupo a partir del min/max de sus hijas", () => {
    const tasks = [
      { id: "g", displayId: "100", nombre: "GRUPO", duracionTexto: "10 días", fechaInicio: "2026-01-01", fechaFin: "2026-01-10", predecesoras: "", esGrupo: true },
      { id: "h1", displayId: "101", nombre: "Hija 1", duracionTexto: "0 días", fechaInicio: "2026-02-01", fechaFin: "2026-02-01", predecesoras: "", esGrupo: false },
      { id: "h2", displayId: "102", nombre: "Hija 2", duracionTexto: "0 días", fechaInicio: "2026-02-15", fechaFin: "2026-02-20", predecesoras: "", esGrupo: false },
    ];
    const out = computeCronogramaSchedule(tasks);
    const g = out.find((t) => t.id === "g");
    expect(g.fechaInicio).toBe("2026-02-01");
    expect(g.fechaFin).toBe("2026-02-20");
  });
});

describe("computeCriticalPath", () => {
  it("sigue la cadena de predecesoras que definió la fecha final", () => {
    // a (ancla) -> b (depende de a) -> c (depende de b) es la única cadena, debe ser toda crítica
    const scheduled = computeCronogramaSchedule([
      { id: "a", displayId: "1", nombre: "A", duracionTexto: "0 días", fechaInicio: "2026-01-01", fechaFin: "2026-01-01", predecesoras: "", esGrupo: false },
      { id: "b", displayId: "2", nombre: "B", duracionTexto: "0 días", fechaInicio: "2026-01-01", fechaFin: "2026-01-01", predecesoras: "1", esGrupo: false },
      { id: "c", displayId: "3", nombre: "C", duracionTexto: "0 días", fechaInicio: "2026-01-01", fechaFin: "2026-01-01", predecesoras: "2", esGrupo: false },
    ]);
    const critical = computeCriticalPath(scheduled);
    expect(critical.has("a")).toBe(true);
    expect(critical.has("b")).toBe(true);
    expect(critical.has("c")).toBe(true);
  });

  it("de dos predecesoras, solo la que gana (fecha más tardía) queda como crítica", () => {
    // d termina más tarde que e; f depende de ambos (FC) -> la predecesora crítica de f es d
    const scheduled = computeCronogramaSchedule([
      { id: "d", displayId: "1", nombre: "D (largo)", duracionTexto: "10 días", fechaInicio: "2026-01-01", fechaFin: "2026-01-13", predecesoras: "", esGrupo: false },
      { id: "e", displayId: "2", nombre: "E (corto)", duracionTexto: "1 día", fechaInicio: "2026-01-01", fechaFin: "2026-01-02", predecesoras: "", esGrupo: false },
      { id: "f", displayId: "3", nombre: "F", duracionTexto: "0 días", fechaInicio: "2026-01-01", fechaFin: "2026-01-01", predecesoras: "1;2", esGrupo: false },
    ]);
    const critical = computeCriticalPath(scheduled);
    expect(critical.has("f")).toBe(true);
    expect(critical.has("d")).toBe(true); // la que empuja la fecha
    expect(critical.has("e")).toBe(false); // no fue la que definió la fecha de f
  });

  it("no lanza error con lista vacía", () => {
    expect(() => computeCriticalPath([])).not.toThrow();
    expect(computeCriticalPath([]).size).toBe(0);
  });
});

describe("matchCronogramaTasks / applyCronogramaMerge (re-importar cronograma)", () => {
  const existing = [
    { id: "e1", displayId: "1", nombre: "Tarea con Id", duracionTexto: "5 días", fechaInicio: "2026-01-01", fechaFin: "2026-01-05", predecesoras: "", esGrupo: false, peso: 60, pctCompletado: 20 },
    { id: "e2", displayId: "", nombre: "Tarea sin id", duracionTexto: "3 días", fechaInicio: "2026-01-06", fechaFin: "2026-01-08", predecesoras: "", esGrupo: false, peso: 40, pctCompletado: 0 },
  ];
  const parsed = [
    { id: uid(), displayId: "1", nombre: "Tarea con Id", duracionTexto: "6 días", fechaInicio: "2026-02-01", fechaFin: "2026-02-06", predecesoras: "", esGrupo: false, peso: 0, pctCompletado: 80 },
    { id: uid(), displayId: "", nombre: "Tarea sin id", duracionTexto: "4 días", fechaInicio: "2026-02-07", fechaFin: "2026-02-10", predecesoras: "", esGrupo: false, peso: 0, pctCompletado: 0 },
    { id: uid(), displayId: "9", nombre: "Tarea totalmente nueva", duracionTexto: "1 día", fechaInicio: "2026-02-11", fechaFin: "2026-02-12", predecesoras: "", esGrupo: false, peso: 0, pctCompletado: 0 },
  ];

  it("empareja por displayId y por nombre si no hay displayId", () => {
    const { toUpdate, toAdd } = matchCronogramaTasks(existing, parsed);
    expect(toUpdate).toHaveLength(2);
    expect(toAdd).toHaveLength(1);
    expect(toAdd[0].nombre).toBe("Tarea totalmente nueva");
  });

  it("al aplicar el merge conserva peso (ajuste manual) pero actualiza fecha y %completado desde lo pegado", () => {
    const { toUpdate, toAdd } = matchCronogramaTasks(existing, parsed);
    const merged = applyCronogramaMerge(existing, toUpdate, toAdd);
    const t1 = merged.find((t) => t.id === "e1");
    expect(t1.fechaInicio).toBe("2026-02-01");
    expect(t1.peso).toBe(60); // no se toca, es ajuste manual
    expect(t1.pctCompletado).toBe(80); // sí se actualiza, viene del Project pegado
    expect(merged).toHaveLength(3);
    const nueva = merged.find((t) => t.nombre === "Tarea totalmente nueva");
    expect(nueva.peso).toBe(0);
  });
});

describe("plantilla de cronograma base", () => {
  it("genera tareas con ids únicos y sin fechas rotas", () => {
    const { tasks } = buildCronogramaBaseFromTemplate();
    expect(tasks.length).toBeGreaterThan(100);
    const ids = new Set(tasks.map((t) => t.id));
    expect(ids.size).toBe(tasks.length);
    tasks.forEach((t) => {
      expect(t.fechaInicio).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(t.fechaFin).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  it("el peso de las tareas hoja suma cerca de 100%", () => {
    const { tasks } = buildCronogramaBaseFromTemplate();
    const total = tasks.filter((t) => !t.esGrupo).reduce((s, t) => s + t.peso, 0);
    expect(total).toBeGreaterThan(95);
    expect(total).toBeLessThanOrEqual(100.5);
  });
});

describe("parseCronogramaPaste", () => {
  it("detecta grupos por duración distinta de 0 días", () => {
    const text = "Id\tNombre de tarea\tDuración\tComienzo\tFin\tPredecesoras\t% completado\n1\tFASE\t10 días\t01/01/26\t10/01/26\t\t0\n2\tTarea\t0 días\t01/01/26\t01/01/26\t1\t0";
    const { tasks, skipped } = parseCronogramaPaste(text);
    expect(skipped).toBe(0);
    expect(tasks[0].esGrupo).toBe(true);
    expect(tasks[1].esGrupo).toBe(false);
    expect(tasks[1].fechaInicio).toBe("2026-01-01");
  });
});

describe("plantilla de presupuesto base", () => {
  it("ejecución arranca igual a base, con tocado:false", () => {
    const { base, ejecucion } = buildPresupuestoBaseFromTemplate();
    expect(base.length).toBe(ejecucion.length);
    base.forEach((b, i) => {
      expect(ejecucion[i].id).toBe(b.id);
      expect(ejecucion[i].cantidad).toBe(b.cantidad);
      expect(ejecucion[i].valorUnitario).toBe(b.valorUnitario);
      expect(ejecucion[i].tocado).toBe(false);
    });
  });

  it("el total de base coincide con el total conocido del PDF ($2.750.931.306)", () => {
    const { base, ejecucion } = buildPresupuestoBaseFromTemplate();
    const totals = presupuestoTotals({ base, ejecucion });
    expect(totals.base).toBe(2750931306);
    expect(totals.diferencia).toBe(0); // ejecución = base al crear
  });

  it('no hay códigos de ítem duplicados (regresión del bug "4.7" repetido)', () => {
    const { base } = buildPresupuestoBaseFromTemplate();
    const items = base.map((b) => b.item);
    expect(new Set(items).size).toBe(items.length);
  });
});

describe("calcPresupuestoItem / presupuestoTotals", () => {
  it("calcula IVA y valor total correctamente", () => {
    const it = { cantidad: 2, valorUnitario: 100000, ivaPct: 19 };
    const calc = calcPresupuestoItem(it);
    expect(calc.valorUnitarioConIva).toBeCloseTo(119000);
    expect(calc.valorTotal).toBeCloseTo(238000);
    expect(calc.ivaRecuperable).toBeCloseTo(38000);
  });
});

describe("parsePresupuestoPaste", () => {
  it("detecta encabezados de categoría (filas sin cantidad/unidad/valor)", () => {
    const text = "1\tEQUIPOS PRINCIPALES\t\t\t\t\n1.1\tPaneles\t10\tUND\t100000\t19";
    const { items, skipped } = parsePresupuestoPaste(text);
    expect(skipped).toBe(0);
    expect(items).toHaveLength(1);
    expect(items[0].categoria).toBe("EQUIPOS PRINCIPALES");
    expect(items[0].cantidad).toBe(10);
  });
});

describe("ensureFullProjectData (no debe romper con datos viejos/corruptos)", () => {
  it("cae a estado vacío si presupuesto no tiene base/ejecucion", () => {
    const result = ensureFullProjectData({ presupuesto: { items: [] } });
    expect(result.presupuesto).toEqual({ base: [], ejecucion: [] });
  });
  it("acepta un objeto totalmente vacío ('{}'::jsonb de Postgres) sin lanzar error", () => {
    expect(() => ensureFullProjectData({})).not.toThrow();
    expect(() => ensureFullProjectData(null)).not.toThrow();
  });
});

describe("energización sin fecha de inicio no debe marcar atraso (regresión)", () => {
  it("un proyecto nuevo arranca sin fecha de inicio de energización", () => {
    expect(emptyEnergizacionState().fechaInicio).toBe("");
  });

  it("sin fecha de inicio, el siguiente hito nunca sale atrasado", () => {
    const ener = emptyEnergizacionState();
    const next = nextEnergizacionMilestone(ener);
    expect(next.delayed).toBe(false);
  });

  it("una vez asignada la fecha, sí puede marcar atraso si el día ya pasó", () => {
    const ener = { ...emptyEnergizacionState(), fechaInicio: "2000-01-01" }; // muy en el pasado
    const next = nextEnergizacionMilestone(ener);
    expect(next.delayed).toBe(true);
  });
});
