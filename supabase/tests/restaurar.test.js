// Restaurar módulos desde el historial (restaurar_historial.sql).
import { describe, it, expect, beforeAll } from "vitest";
import { createDb, ids, errorOf } from "./db.js";

describe("restaurar desde el historial", () => {
  let t;
  let buena;
  const restore = (historyId, modules) =>
    errorOf(() => t.db.query(`select restore_project_modules($1, $2::text[])`, [historyId, modules]));
  const orden = (numero) => ({ pagos: { ordenes: [{ id: "o1", numero, pagos: [] }] } });

  beforeAll(async () => {
    t = await createDb();
    await t.as(ids.pagos);
    await t.save(orden("BUENO"));
    await t.as(ids.upme);
    await t.save({ upme: { steps: { a: 1 } } });
    await t.asSuperuser(() => t.db.exec(`update project_history set created_at = created_at - interval '1 hour'`));
    await t.as(ids.pagos);
    await t.save(orden("DAÑADO"));
    buena = (await t.history()).find((r) => r.data.pagos?.ordenes?.[0]?.numero === "BUENO");
  }, 60000);

  it("solo restaura quien puede editar ese módulo", async () => {
    await t.as(ids.upme);
    expect(await restore(buena.id, ["pagos"])).toMatch(/No tienes permiso para editar Pagos/);
    await t.as(ids.lector);
    expect(await restore(buena.id, ["pagos"])).toMatch(/permiso/);
  });

  it("valida los módulos pedidos", async () => {
    await t.as(ids.pagos);
    expect(await restore(buena.id, [])).toMatch(/al menos un módulo/);
    expect(await restore(buena.id, ["hacker"])).toMatch(/Módulo inválido/);
  });

  it("restaura solo el módulo elegido y avisa a los demás clientes", async () => {
    await t.as(ids.pagos);
    const antes = await t.row();
    expect(await restore(buena.id, ["pagos"])).toBe("");
    const despues = await t.row();
    expect(despues.pagos.ordenes[0].numero).toBe("BUENO");
    expect(despues.upme.steps.a).toBe(1); // el trabajo de otro en UPME no se toca
    expect(despues.module_versions.pagos).toBeGreaterThan(antes.module_versions.pagos);
    expect(despues.module_versions.upme).toBe(antes.module_versions.upme);
  });

  it("deja en el historial 'antes de restaurar' y 'restauración'", async () => {
    const [antes, rest] = (await t.history()).slice(-2);
    expect(antes.kind).toBe("antes_de_restaurar");
    expect(antes.data.pagos.ordenes[0].numero).toBe("DAÑADO");
    expect(rest.kind).toBe("restauracion");
    expect(rest.source_history_id).toBe(buena.id);
    expect(rest.changed_modules).toEqual(["pagos"]);
  });

  it("un guardado posterior no pisa la fila de restauración y se puede deshacer", async () => {
    const n = (await t.history()).length;
    await t.as(ids.pagos);
    await t.save(orden("BUENO 2"));
    const h = await t.history();
    expect(h.length).toBe(n + 1);
    expect(h[n - 1].data.pagos.ordenes[0].numero).toBe("BUENO");

    const antes = h.find((r) => r.kind === "antes_de_restaurar");
    expect(await restore(antes.id, ["pagos"])).toBe("");
    expect((await t.row()).pagos.ordenes[0].numero).toBe("DAÑADO");
  });
});
