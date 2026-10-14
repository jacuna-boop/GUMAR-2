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

describe("curva S de energización", () => {
  it("arranca en 0 % el día de inicio, trae ts para el eje de tiempo y la fecha real manda", async () => {
    const { buildEnergizacionCurvaSData, emptyEnergizacionState } = await import("./data.js");
    const ener = { ...emptyEnergizacionState(), fechaInicio: "2026-04-13" };
    ener.milestones = ener.milestones.map((m, i) => (i < 2 ? { done: true, fecha: "2026-04-20" } : m));
    const c = buildEnergizacionCurvaSData(ener, "2026-05-01");
    expect(c[0]).toMatchObject({ date: "2026-04-13", base: 0, real: 0, inicio: true });
    expect(c[1].date).toBe("2026-04-13"); // los hitos del día 0 suben la base ese mismo día
    expect(c[1].base).toBeGreaterThan(0);
    expect(c.every((p, i) => i === 0 || p.ts >= c[i - 1].ts)).toBe(true);
    expect(c[0].ts).toBe(new Date(2026, 3, 13).getTime());
    expect(c.find((p) => p.date === "2026-04-19").real).toBe(0);
    expect(c.find((p) => p.date === "2026-04-20").real).toBeGreaterThan(0);
  });
});

describe("CNO 2233 en energización (≤1MW)", () => {
  it("los proyectos sin norma siguen en CNO 2121 y los nuevos arrancan en CNO 2233", async () => {
    const d = await import("./data.js");
    const viejo = d.ensureFullProjectData({ energizacion: { fechaInicio: "", milestones: Array.from({ length: 73 }, () => ({ done: false, fecha: "" })) } }).energizacion;
    expect(d.energizacionMilestonesFor(viejo)).toHaveLength(73);
    expect(d.energizacionTotalCostFor(viejo)).toBe(655);
    const nuevo = d.emptyEnergizacionState("menor1mw");
    expect(nuevo.norma).toBe("2233");
    expect(nuevo.milestones).toHaveLength(75);
    expect(d.energizacionTotalCostFor(nuevo)).toBe(665);
    expect(d.emptyEnergizacionState("mayor1mw").norma).toBeUndefined();
  });

  it("renumera las cartas como CNO 2233 y agrega la 9.7 de ecuación de demanda", async () => {
    const d = await import("./data.js");
    const labels = d.energizacionGroupsFor({ norma: "2233" }).map((g) => g.label);
    expect(labels).toContain("Carta 9.7 · Ecuación de demanda y factores");
    expect(labels).toContain("Carta 9.8 · Certificado de conexión");
    expect(labels).toContain("Carta 9.9 · Declaración del programa de generación");
    expect(labels).toContain("Carta 9.11 · Cumplimiento de reglamentación vigente");
    expect(labels).toContain("Carta 9.12 · Declaración entrada en operación");
    const titulos = d.energizacionMilestonesFor({ norma: "2233" }).map((m) => m.title).join(" | ");
    expect(titulos).not.toMatch(/\b9\.10\b/);
    expect(titulos).toMatch(/Carta 9\.1 al OR/); // la 9.1 no se toca
  });

  it("cambiar de norma conserva lo marcado (por título) y volver deja todo igual", async () => {
    const d = await import("./data.js");
    const base = d.ensureFullProjectData({ energizacion: { fechaInicio: "2026-04-13", milestones: Array.from({ length: 73 }, () => ({ done: false, fecha: "" })) } }).energizacion;
    const titulos2121 = d.energizacionMilestonesFor(base).map((m) => m.title);
    const marcados = ["Aprobación Carta 9.6", "Aprobación Carta 9.3 por XM", "Descargo energización del proyecto"];
    base.milestones = base.milestones.map((m, i) => (marcados.includes(titulos2121[i]) ? { done: true, fecha: `2026-05-0${i % 9 + 1}` } : m));
    const a2233 = d.cambiarNormaEnergizacion(base, "2233");
    const titulos2233 = d.energizacionMilestonesFor(a2233).map((m) => m.title);
    expect(a2233.milestones).toHaveLength(75);
    marcados.forEach((t) => {
      expect(a2233.milestones[titulos2233.indexOf(t)]).toEqual(base.milestones[titulos2121.indexOf(t)]);
    });
    expect(a2233.milestones.filter((m) => m.done)).toHaveLength(3);
    expect(d.hitosCno2233Marcados(a2233)).toBe(0);
    expect(d.energizacionTotalCostFor(a2233)).toBeGreaterThan(d.energizacionTotalCostFor(base)); // más trabajo pendiente
    const deVuelta = d.cambiarNormaEnergizacion(a2233, "2121");
    expect(deVuelta.milestones).toEqual(base.milestones);
    expect(d.cambiarNormaEnergizacion(a2233, "2233")).toBe(a2233); // misma norma: no cambia nada
  });
});

describe("amarres de órdenes a ítems (Costo real)", () => {
  it("valor sugerido = lo que falta por asignar", async () => {
    const { valorSugeridoAmarre } = await import("./data.js");
    expect(valorSugeridoAmarre({ valorTotal: 100, presupuestoItems: [] })).toBe(100);
    expect(valorSugeridoAmarre({ valorTotal: 100, presupuestoItems: [{ valor: 30 }] })).toBe(70);
    expect(valorSugeridoAmarre({ valorTotal: 100, presupuestoItems: [{ valor: 130 }] })).toBe(0);
  });
  it("cambiar el valor de la orden ajusta un amarre único que la cubría (o estaba en $0), no los repartidos", async () => {
    const { actualizarValorOrden } = await import("./data.js");
    const unico = actualizarValorOrden({ valorTotal: 100, presupuestoItems: [{ id: "l", itemId: "i", valor: 100 }] }, 150);
    expect(unico.valorTotal).toBe(150);
    expect(unico.presupuestoItems[0].valor).toBe(150);
    expect(actualizarValorOrden({ valorTotal: 100, presupuestoItems: [{ itemId: "i", valor: 0 }] }, 80).presupuestoItems[0].valor).toBe(80);
    expect(actualizarValorOrden({ valorTotal: 100, presupuestoItems: [{ itemId: "i", valor: 40 }] }, 80).presupuestoItems[0].valor).toBe(40);
    const repartida = actualizarValorOrden({ valorTotal: 100, presupuestoItems: [{ itemId: "a", valor: 60 }, { itemId: "b", valor: 40 }] }, 200);
    expect(repartida.presupuestoItems.map((l) => l.valor)).toEqual([60, 40]);
  });
  it("costo real = valor de las órdenes cargadas a cada ítem (aunque el valor asignado esté en $0)", async () => {
    const { costoRealPorItemMap, pagadoPorItemMap } = await import("./data.js");
    const pagos = { ordenes: [
      { valorTotal: 100, presupuestoItems: [{ itemId: "a", valor: 0 }], pagos: [{ valor: 40, estado: "pagado" }] },
      { valorTotal: 50, presupuestoItems: [{ itemId: "a", valor: 50 }], pagos: [] },
      { valorTotal: 200, presupuestoItems: [{ itemId: "b", valor: 30 }, { itemId: "c", valor: 10 }], pagos: [{ valor: 100, estado: "pagado" }] },
      { valorTotal: 60, presupuestoItems: [{ itemId: "d", valor: 0 }, { itemId: "e", valor: 0 }], pagos: [] },
      { valorTotal: 70, presupuestoItems: [{ itemId: "f", valor: 20 }, { itemId: "f", valor: 0 }], pagos: [] },
    ] };
    const c = costoRealPorItemMap(pagos);
    expect(c.get("a")).toBe(150);
    expect(c.get("b")).toBe(150); // repartida: 30 de 40 asignados
    expect(c.get("c")).toBe(50);
    expect(c.get("d")).toBe(30); // repartida sin valores: partes iguales
    expect(c.get("f")).toBe(70); // dos amarres al mismo ítem = un solo ítem
    expect(pagadoPorItemMap(pagos).get("a")).toBe(40);
    expect(pagadoPorItemMap(pagos).get("b")).toBe(75);
  });
  it("a revisar: órdenes sin ítem y repartidas cuyo asignado no cuadra", async () => {
    const { ordenesDescuadradas } = await import("./data.js");
    const r = ordenesDescuadradas({ ordenes: [
      { id: 1, valorTotal: 100, presupuestoItems: [{ itemId: "a", valor: 0 }] },
      { id: 2, valorTotal: 100, presupuestoItems: [{ itemId: "a", valor: 60 }, { itemId: "b", valor: 40 }] },
      { id: 3, valorTotal: 100, presupuestoItems: [{ itemId: "a", valor: 60 }, { itemId: "b", valor: 0 }] },
      { id: 4, valorTotal: 50, presupuestoItems: [] },
    ] });
    expect(r.descuadradas.map((d) => [d.orden.id, d.diferencia])).toEqual([[3, 40]]);
    expect(r.sinAmarre.map((o) => o.id)).toEqual([4]);
  });
});

describe("cortes de obra: reteobra en porcentaje", () => {
  it("calcula la reteobra con el % sobre el valor acumulado y conserva un valor fijo viejo", async () => {
    const { buildCortesObra } = await import("./data.js");
    const pagos = { ordenes: [
      { proveedor: "ACME", pagos: [{ valor: 600000, estado: "pagado" }, { valor: 400000, estado: "pagado" }, { valor: 999, estado: "programado" }] },
      { proveedor: "VIEJO", pagos: [{ valor: 500000, estado: "pagado" }] },
    ] };
    const cortes = buildCortesObra(pagos, { contratistas: [
      { proveedor: "ACME", incluir: true, reteobraPct: 5 },
      { proveedor: "VIEJO", incluir: true, reteobra: 20000 },
    ] });
    const acme = cortes.find((c) => c.proveedor === "ACME");
    expect(acme).toMatchObject({ numCortes: 2, vrAcumulado: 1000000, reteobraPct: 5, reteobra: 50000, saldo: 950000 });
    expect(cortes.find((c) => c.proveedor === "VIEJO")).toMatchObject({ reteobra: 20000, saldo: 480000 });
  });
});
