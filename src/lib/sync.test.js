import { describe, it, expect } from "vitest";
import { emptyProjectData } from "./data.js";
import { PROJECT_MODULES, diffModules, rowVersions, planServerMerge, pickModules, retryDelayMs } from "./sync.js";

const row = (data, versions) => ({ project_id: "p1", ...data, module_versions: versions });

describe("diffModules", () => {
  it("detecta solo los módulos cuya referencia cambió", () => {
    const a = emptyProjectData();
    const b = { ...a, pagos: { ...a.pagos } };
    expect(diffModules(a, b)).toEqual(["pagos"]);
    expect(diffModules(a, a)).toEqual([]);
  });
  it("sin estado previo, todos cambiaron", () => {
    expect(diffModules(null, emptyProjectData())).toEqual(PROJECT_MODULES);
  });
});

describe("rowVersions", () => {
  it("null si la columna no existe (migración sin correr)", () => {
    expect(rowVersions({ project_id: "p1", upme: {} })).toBeNull();
  });
  it("rellena con 0 los módulos sin versión", () => {
    const v = rowVersions({ module_versions: { pagos: 3 } });
    expect(v.pagos).toBe(3);
    expect(v.upme).toBe(0);
  });
});

describe("planServerMerge", () => {
  const local = emptyProjectData();
  const known = rowVersions({ module_versions: { pagos: 1, upme: 1 } });

  it("trae los módulos más nuevos del servidor que no estoy editando", () => {
    const serverPagos = { ordenes: [{ id: "o1", pagos: [] }] };
    const r = row({ ...local, pagos: serverPagos }, { pagos: 2, upme: 1 });
    const plan = planServerMerge(local, known, r, new Set());
    expect(plan.applied).toEqual(["pagos"]);
    expect(plan.data.pagos.ordenes).toHaveLength(1);
    expect(plan.versions.pagos).toBe(2);
    expect(plan.data.upme).toBe(local.upme);
  });

  it("no pisa un módulo con cambios locales pendientes", () => {
    const r = row({ ...local, pagos: { ordenes: [{ id: "x", pagos: [] }] } }, { pagos: 2, upme: 1 });
    const plan = planServerMerge(local, known, r, new Set(["pagos"]));
    expect(plan.applied).toEqual([]);
    expect(plan.stale).toEqual(["pagos"]);
    expect(plan.data).toBe(local);
    expect(plan.versions.pagos).toBe(1); // sigue con la versión vieja → su guardado dará conflicto
  });

  it("ignora filas viejas (eco atrasado de mi propio guardado)", () => {
    const r = row({ ...local, pagos: { ordenes: [] } }, { pagos: 1, upme: 0 });
    const plan = planServerMerge(local, known, r, new Set());
    expect(plan.applied).toEqual([]);
    expect(plan.data).toBe(local);
  });

  it("en modo sin versionado no aplica nada", () => {
    const plan = planServerMerge(local, null, { ...local }, new Set());
    expect(plan.applied).toEqual([]);
  });
});

describe("helpers", () => {
  it("pickModules", () => {
    expect(pickModules({ a: 1, b: 2 }, ["a", "c"])).toEqual({ a: 1 });
  });
  it("retryDelayMs crece y se topa en 15s", () => {
    expect(retryDelayMs(1)).toBe(1000);
    expect(retryDelayMs(3)).toBe(4000);
    expect(retryDelayMs(20)).toBe(15000);
  });
});
