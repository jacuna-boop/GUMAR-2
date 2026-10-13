// El seed del ambiente de pruebas (supabase/seed_pruebas.sql) carga sobre schema.sql y deja a cada
// usuario de prueba viendo y pudiendo editar lo que le corresponde.
import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createEmptyDb } from "./db.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const seed = fs.readFileSync(path.join(here, "..", "seed_pruebas.sql"), "utf8");
const ID = {
  admin: "10000000-0000-4000-8000-000000000001",
  pagos: "10000000-0000-4000-8000-000000000002",
  lector: "10000000-0000-4000-8000-000000000005",
  norte: "30000000-0000-4000-8000-000000000001",
};

describe("seed del ambiente de pruebas", () => {
  let db;
  const as = async (uid) => { await db.exec(`select set_config('test.uid', '${uid}', false)`); };
  const visibles = async () => (await db.query(`select name from projects order by name`)).rows.map((r) => r.name);

  beforeAll(async () => {
    db = await createEmptyDb(seed);
    await db.exec(`
      grant select, insert, update, delete on all tables in schema public to authenticated;
      grant execute on all functions in schema public to authenticated;
      set role authenticated;`);
  }, 60000);

  it("crea los perfiles con su rol y cargo", async () => {
    await as(ID.admin);
    const { rows } = await db.query(`select email, role, cargo_id is not null as con_cargo from profiles order by email`);
    expect(rows).toHaveLength(5);
    expect(rows.find((r) => r.email.startsWith("pruebas.admin")).role).toBe("admin");
    expect(rows.find((r) => r.email.startsWith("pruebas.lector")).role).toBe("lector");
  });

  it("cada usuario ve solo sus proyectos", async () => {
    await as(ID.admin);
    expect(await visibles()).toHaveLength(2);
    await as(ID.pagos);
    expect(await visibles()).toEqual(["Demo Sol Norte (pruebas)"]);
  });

  it("los datos de los proyectos son válidos para la app", async () => {
    await as(ID.admin);
    const { rows } = await db.query(`select * from project_data where project_id = $1`, [ID.norte]);
    const d = rows[0];
    expect(d.presupuesto.base.length).toBeGreaterThan(50);
    expect(d.cronograma.tasks.length).toBeGreaterThan(50);
    expect(d.pagos.ordenes.some((o) => o.pagos.some((p) => p.aprobado))).toBe(true);
    expect(d.pagos.ordenes.some((o) => o.pagos.some((p) => p.estado === "programado"))).toBe(true);
  });

  it("los permisos funcionan con los usuarios de prueba", async () => {
    await as(ID.pagos);
    const save = (changes) => db.query(`select save_project_modules($1, $2::jsonb, '{}'::jsonb) r`, [ID.norte, JSON.stringify(changes)]);
    await expect(save({ presupuesto: { base: [], ejecucion: [] } })).rejects.toThrow(/No tienes permiso para editar Presupuesto/);
    await as(ID.lector);
    await expect(save({ info: { equipo: [] } })).rejects.toThrow(/permiso/);
  });
});
