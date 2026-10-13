// Permisos por módulo, aprobación de pagos y gestión de usuarios (seguridad_permisos.sql).
import { describe, it, expect, beforeAll } from "vitest";
import { createDb, ids, errorOf } from "./db.js";

describe("permisos por módulo", () => {
  let t;
  beforeAll(async () => { t = await createDb(); }, 60000);

  const pagosCon = async (fn) => {
    const p = structuredClone((await t.row()).pagos);
    fn(p.ordenes[0].pagos);
    return { pagos: p };
  };
  const saveErr = (changes) => errorOf(async () => { const r = await t.save(changes); if (!r.ok) throw new Error("conflicto"); });

  it("cada cargo solo guarda sus módulos", async () => {
    await t.as(ids.upme);
    expect(await saveErr({ upme: { steps: {} } })).toBe("");
    expect(await saveErr({ presupuesto: { base: [] } })).toMatch(/No tienes permiso para editar Presupuesto/);
    expect(await saveErr(await pagosCon((ps) => { ps[0].valor = 999; }))).toMatch(/No tienes permiso para editar Pagos/);
    expect(await saveErr({ info: { equipo: [] } })).toBe(""); // info: cualquiera que edite algo
  });

  it("el lector no guarda nada", async () => {
    await t.as(ids.lector);
    expect(await saveErr(await pagosCon((ps) => { ps[0].concepto = "x"; }))).toMatch(/permiso/);
    expect(await saveErr({ info: { equipo: [] } })).toMatch(/permiso/);
  });

  it("aprobación de pagos", async () => {
    await t.as(ids.pagos);
    expect(await saveErr(await pagosCon((ps) => { ps[0].concepto = "Anticipo"; }))).toBe("");
    expect(await saveErr(await pagosCon((ps) => Object.assign(ps[0], { aprobado: true, aprobadoPor: "Pepa Pagos" }))))
      .toMatch(/Solo quien tiene permiso de aprobar/);

    await t.as(ids.aprobador);
    expect(await saveErr(await pagosCon((ps) => Object.assign(ps[0], { aprobado: true, aprobadoPor: "Ana Aprueba", aprobadoEn: "2026-10-13" })))).toBe("");
    expect(await saveErr(await pagosCon((ps) => Object.assign(ps[1], { aprobado: true, aprobadoPor: "Gerente" }))))
      .toMatch(/tiene que ser el tuyo/);
    expect(await saveErr(await pagosCon((ps) => { ps[1].concepto = "y"; }))).toMatch(/No tienes permiso para editar Pagos/);

    await t.as(ids.pagos);
    expect(await saveErr(await pagosCon((ps) => { ps[0].valor = 1; }))).toMatch(/aprobar pagos/);
    expect(await saveErr(await pagosCon((ps) => ps.splice(0, 1)))).toMatch(/aprobar pagos/);
    expect(await saveErr(await pagosCon((ps) => { ps[0].estado = "pagado"; }))).toBe(""); // marcar pagado sí
    expect(await saveErr(await pagosCon((ps) => { ps[1].valor = 60; }))).toBe(""); // pago no aprobado sí

    await t.as(ids.admin);
    expect(await saveErr({ ...(await pagosCon((ps) => { ps[0].valor = 7; })), presupuesto: { base: [1] } })).toBe("");
  });

  it("quien gestiona usuarios no puede darse permisos a sí mismo", async () => {
    await t.as(ids.gestor);
    expect(await errorOf(() => t.db.query(`update profiles set cargo_id = $1 where id = $2`, [ids.cargoPagos, ids.gestor])))
      .toMatch(/row-level security/);
    const propio = await t.db.query(`update cargos set puede_editar_pagos = true where id = $1`, [ids.cargoGestor]);
    expect(propio.affectedRows).toBe(0);
    const otro = await t.db.query(`update profiles set cargo_id = $1 where id = $2`, [ids.cargoUpme, ids.pagos]);
    expect(otro.affectedRows).toBe(1);
  });

  it("crear un proyecto exige ser el creador registrado", async () => {
    await t.as(ids.gestor);
    expect(await errorOf(() => t.db.query(`insert into projects (name, created_by) values ('x', $1)`, [ids.admin])))
      .toMatch(/row-level security/);
    expect(await errorOf(() => t.db.query(`insert into projects (name, created_by) values ('x', $1)`, [ids.gestor]))).toBe("");
  });
});
