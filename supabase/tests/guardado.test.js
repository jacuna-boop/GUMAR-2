// Guardado por módulo con versiones e historial automático (proteger_datos.sql).
import { describe, it, expect, beforeAll } from "vitest";
import { createDb, ids, errorOf } from "./db.js";

describe("guardado por módulo y conflictos", () => {
  let t;
  beforeAll(async () => { t = await createDb(); }, 60000);

  it("guarda solo el módulo enviado y sube su versión", async () => {
    await t.as(ids.admin);
    const r = await t.save({ upme: { steps: { a: { completado: true } } } });
    expect(r.ok).toBe(true);
    const row = await t.row();
    expect(row.module_versions.upme).toBe(1);
    expect(row.pagos.ordenes[0].id).toBe("o1"); // pagos intacto
  });

  it("rechaza guardar sobre una versión vieja y no guarda nada", async () => {
    await t.as(ids.pagos);
    const antes = await t.row();
    const r = (await t.db.query(`select save_project_modules($1, $2::jsonb, $3::jsonb) r`,
      [ids.project, JSON.stringify({ pagos: { ordenes: [] }, upme: { steps: {} } }), JSON.stringify({ pagos: 0, upme: 0 })])).rows[0].r;
    expect(r.ok).toBe(false);
    expect(r.conflicts).toEqual(["upme"]);
    expect(r.row.upme.steps.a.completado).toBe(true);
    expect((await t.row()).pagos).toEqual(antes.pagos);
  });

  it("un cambio hecho por fuera (SQL Editor, app vieja) también sube la versión", async () => {
    const v = (await t.row()).module_versions;
    await t.as(null); // el SQL Editor no tiene usuario conectado
    await t.asSuperuser(() => t.db.exec(`update project_data set balance = '{"hitos":[]}'::jsonb`));
    await t.as(ids.admin);
    const v2 = (await t.row()).module_versions;
    expect(v2.balance).toBe((v.balance || 0) + 1);
    expect(v2.upme).toBe(v.upme);
  });

  it("valida los módulos", async () => {
    await t.as(ids.admin);
    expect(await errorOf(() => t.save({ hacker: {} }))).toMatch(/Módulo inválido/);
    expect(await errorOf(() => t.save({ pagos: null }))).toMatch(/debe ser un objeto/);
  });

  it("el historial lo escribe el servidor, agrupa por persona y ventana, y anota los módulos", async () => {
    const h = await t.history();
    const deAdmin = h.filter((r) => r.updated_by === ids.admin);
    expect(deAdmin.at(-1).changed_modules).toContain("upme");
    expect(h.some((r) => r.updated_by_email === "sistema (SQL Editor)")).toBe(true);

    await t.as(ids.admin);
    await t.save({ upme: { steps: { a: { completado: false } } } });
    const n = (await t.history()).length;
    await t.save({ upme: { steps: { a: { completado: true } } } });
    await t.save({ upme: { steps: { a: { completado: "otra vez" } } } });
    expect((await t.history()).length).toBe(n); // guardados seguidos de la misma persona = una sola foto
  });

  it("la app no puede escribir ni editar el historial", async () => {
    await t.as(ids.admin);
    expect(await errorOf(() => t.db.query(
      `insert into project_history (project_id, data) values ($1, '{}'::jsonb)`, [ids.project]))).toMatch(/row-level security/);
    const r = await t.db.query(`update project_history set data = '{}'::jsonb where project_id = $1`, [ids.project]);
    expect(r.affectedRows).toBe(0);
  });
});
