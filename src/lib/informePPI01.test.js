import { describe, it, expect } from "vitest";
import { reporteFinancieroTotals, buildInformeProyecto } from "./informePPI01.js";
import { emptyProjectData, emptyBalanceState, emptyPresupuestoState } from "./data.js";

describe("reporteFinancieroTotals", () => {
  it("calcula costo estimado inicial, costo proyectado, EBITDA y eficiencia", () => {
    const balance = { ...emptyBalanceState(), valorVentaCliente: 1000 };
    const presupuesto = {
      base: [{ id: "1", cantidad: 1, valorUnitario: 600, ivaPct: 0 }],
      ejecucion: [{ id: "1", cantidad: 1, valorUnitario: 700, ivaPct: 0 }],
    };
    const r = reporteFinancieroTotals(balance, presupuesto);
    expect(r.valorContractual).toBe(1000);
    expect(r.costoEstimadoInicial).toBe(600);
    expect(r.costoProyectado).toBe(700);
    expect(r.ebitda).toBe(300); // 1000 - 700
    expect(r.eficienciaCosto).toBeCloseTo(600 / 700);
    expect(r.gananciaPerdida).toBeCloseTo(1 - 600 / 700); // 1 - eficiencia, NO el EBITDA
  });

  it("no truena con presupuesto vacío (eficiencia en 0, no división por cero)", () => {
    const r = reporteFinancieroTotals(emptyBalanceState(), emptyPresupuestoState());
    expect(r.costoProyectado).toBe(0);
    expect(r.eficienciaCosto).toBe(0);
    expect(r.gananciaPerdida).toBe(1);
    expect(r.ebitda).toBe(0);
  });
});

describe("buildInformeProyecto", () => {
  it("no truena con un proyecto recién creado (datos vacíos)", () => {
    const project = { id: "p1", name: "Proyecto Test", capacity: "1.2", location: "Copacabana, Antioquia" };
    const data = emptyProjectData();
    const r = buildInformeProyecto(project, data);
    expect(r.nombre).toBe("Proyecto Test");
    expect(r.potencia).toBe("1.2");
    expect(r.ubicacion).toBe("Copacabana, Antioquia");
    expect(r.fpo).toBeNull();
    expect(r.equipo).toEqual([]);
    expect(r.cortesObra).toEqual([]);
    expect(r.curvaSEnergizacion).toEqual([]);
    expect(r.cumplimientoEnergizacion).toBeNull();
    expect(r.financiero.ebitda).toBe(0);
  });

  it("arma cortes de obra y curva S cuando hay datos reales", () => {
    const project = { id: "p2", name: "Proyecto Con Datos", capacity: "9.9", location: "Girardota, Antioquia" };
    const data = emptyProjectData();
    data.energizacion.fechaInicio = "2026-01-01";
    data.energizacion.milestones = data.energizacion.milestones.map((m, i) => (i === 0 ? { done: true, fecha: "2026-01-05" } : m));
    data.info.cortesObra.contratistas = [{ id: "c1", proveedor: "ACME", incluir: true, reteobra: 100 }];
    data.pagos.ordenes = [{ id: "o1", numero: "1", proveedor: "ACME", valorTotal: 1000, pagos: [{ id: "pg1", fecha: "2026-01-10", valor: 1000, estado: "pagado" }] }];

    const r = buildInformeProyecto(project, data);
    expect(r.fpo).toBe("2026-10-01"); // fechaInicio + 9 meses (menor1mw por defecto)
    expect(r.cortesObra.length).toBe(1);
    expect(r.cortesObra[0].proveedor).toBe("ACME");
    expect(r.cortesObra[0].saldo).toBe(900); // 1000 - reteobra 100
    expect(r.curvaSEnergizacion.length).toBeGreaterThan(0);
  });

  it("corta el avance real en cutoffDate para exportar un informe de un periodo pasado (la base no se corta)", () => {
    const project = { id: "p3", name: "Proyecto Cutoff", capacity: "1", location: "" };
    const data = emptyProjectData();
    data.energizacion.fechaInicio = "2026-01-01";
    // marca dos hitos como hechos, uno antes del corte y otro después
    data.energizacion.milestones = data.energizacion.milestones.map((m, i) => {
      if (i === 0) return { done: true, fecha: "2026-01-05" }; // antes del corte
      if (i === 1) return { done: true, fecha: "2026-03-01" }; // después del corte
      return m;
    });

    const cutoff = "2026-01-15";
    const r = buildInformeProyecto(project, data, cutoff);

    const afterCutoff = r.curvaSEnergizacion.filter((p) => p.date > cutoff);
    expect(afterCutoff.every((p) => p.real === null)).toBe(true);
    expect(afterCutoff.some((p) => p.base > 0)).toBe(true); // la base sigue completa

    const atCutoff = r.curvaSEnergizacion.find((p) => p.date === cutoff);
    expect(atCutoff).toBeDefined();
    expect(atCutoff.real).not.toBeNull();
    expect(r.cumplimientoEnergizacion.date).toBe(cutoff); // el cumplimiento se toma en el corte, no en el último punto
  });
});
