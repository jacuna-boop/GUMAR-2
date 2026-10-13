// Genera supabase/seed_pruebas.sql: usuarios, cargos y proyectos FICTICIOS para el ambiente de
// pruebas (Supabase local o staging). Nunca se corre contra producción.
//
//   node scripts/generar-seed-pruebas.mjs
//
// Usa las mismas plantillas que la app (data.js) para que los datos se parezcan a los reales.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPresupuestoBaseFromTemplate, buildCronogramaBaseFromTemplate, emptyEnergizacionState,
  emptyProyectoInfoState, computeCronogramaSchedule, UPME_STEPS, uid,
} from "../src/lib/data.js";

// Contraseña de TODOS los usuarios de prueba (solo existen en el ambiente de pruebas).
export const PRUEBAS_PASSWORD = "Pruebas-Gumar-2026";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "..", "supabase", "seed_pruebas.sql");

const U = {
  admin: { id: "10000000-0000-4000-8000-000000000001", email: "pruebas.admin@gumarp.com.co", nombre: "Admin Pruebas", role: "admin", cargo: null },
  pagos: { id: "10000000-0000-4000-8000-000000000002", email: "pruebas.pagos@gumarp.com.co", nombre: "Pepa Pagos", role: "editor", cargo: "Asistente de pagos" },
  aprobador: { id: "10000000-0000-4000-8000-000000000003", email: "pruebas.aprobador@gumarp.com.co", nombre: "Ana Aprobadora", role: "editor", cargo: "Gerente (aprueba pagos)" },
  obra: { id: "10000000-0000-4000-8000-000000000004", email: "pruebas.obra@gumarp.com.co", nombre: "Óscar Obra", role: "editor", cargo: "Director de obra" },
  lector: { id: "10000000-0000-4000-8000-000000000005", email: "pruebas.lector@gumarp.com.co", nombre: "Lucía Lectora", role: "lector", cargo: null },
};
const CARGOS = {
  "Asistente de pagos": { id: "20000000-0000-4000-8000-000000000001", puede_editar_pagos: true },
  "Gerente (aprueba pagos)": { id: "20000000-0000-4000-8000-000000000002", puede_aprobar_pagos: true, puede_editar_balance: true, puede_eliminar_proyectos: true, puede_gestionar_usuarios: true },
  "Director de obra": { id: "20000000-0000-4000-8000-000000000003", puede_editar_upme: true, puede_editar_energizacion: true, puede_editar_cronograma: true, puede_editar_presupuesto: true },
};

const q = (v) => (v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const j = (v) => `${q(JSON.stringify(v))}::jsonb`;
const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

function proyecto({ inicio, avance, tipo }) {
  // Presupuesto: base de la plantilla; ejecución con lo ya contratado en los primeros ítems.
  const presupuesto = buildPresupuestoBaseFromTemplate();
  presupuesto.ejecucion = presupuesto.ejecucion.map((it, i) =>
    i < 12 ? { ...it, valorUnitario: Math.round(it.valorUnitario * (0.95 + (i % 4) * 0.03)), tocado: true } : { ...it, cantidad: 0, valorUnitario: 0 });

  // Cronograma: la plantilla corrida para que arranque en "inicio", con avance en las primeras tareas.
  const base = buildCronogramaBaseFromTemplate();
  const t0 = base.tasks.find((t) => t.fechaInicio)?.fechaInicio;
  const shift = Math.round((new Date(inicio) - new Date(t0)) / 86400000);
  let tasks = base.tasks.map((t) => ({
    ...t,
    fechaInicio: t.fechaInicio ? addDays(t.fechaInicio, shift) : "",
    fechaFin: t.fechaFin ? addDays(t.fechaFin, shift) : "",
  }));
  tasks = computeCronogramaSchedule(tasks);
  const hojas = tasks.filter((t) => !t.esGrupo);
  const hechas = Math.round(hojas.length * avance);
  hojas.slice(0, hechas).forEach((t) => { t.pctCompletado = 100; });
  if (hojas[hechas]) hojas[hechas].pctCompletado = 50;
  const cronograma = { tasks, seguimiento: [{ id: uid(), fecha: addDays(inicio, 60), avance: Math.round(avance * 100) }], baseline: null };

  const upmeSteps = {};
  UPME_STEPS.forEach((s, i) => {
    upmeSteps[s.id] = { completado: i < 4, fecha: i < 4 ? addDays(inicio, -90 + i * 15) : "", decision: null, notas: "" };
  });

  const energizacion = emptyEnergizacionState(tipo);
  energizacion.fechaInicio = addDays(inicio, -30);
  energizacion.milestones = energizacion.milestones.map((m, i) => (i < 10 ? { done: true, fecha: addDays(inicio, -30 + i * 7) } : m));

  const it = (n) => presupuesto.base[n];
  const pagos = {
    ordenes: [
      {
        id: uid(), numero: "OS-001", proveedor: "Paneles Andinos S.A.S.", descripcion: "Suministro de paneles", valorTotal: 580000000,
        presupuestoItems: [{ id: uid(), itemId: it(0).id, valor: 580000000 }],
        pagos: [
          { id: uid(), fecha: addDays(inicio, 5), valor: 145000000, concepto: "Anticipo 25%", estado: "pagado", aprobado: true, aprobadoPor: U.aprobador.nombre, aprobadoEn: addDays(inicio, 4) },
          { id: uid(), fecha: addDays(inicio, 45), valor: 290000000, concepto: "Contra entrega", estado: "pagado" },
        ],
      },
      {
        id: uid(), numero: "OS-002", proveedor: "Inversores del Caribe", descripcion: "Inversores", valorTotal: 94000000,
        presupuestoItems: [{ id: uid(), itemId: it(1).id, valor: 94000000 }],
        pagos: [{ id: uid(), fecha: addDays(new Date().toISOString().slice(0, 10), 5), valor: 47000000, concepto: "Pago programado", estado: "programado" }],
      },
      { id: uid(), numero: "OS-003", proveedor: "Montajes Eléctricos Ltda.", descripcion: "Mano de obra montaje", valorTotal: 120000000, presupuestoItems: [], pagos: [] },
    ],
  };

  const info = emptyProyectoInfoState();
  info.equipo = [{ id: uid(), cargo: "Director de obra", nombre: U.obra.nombre }, { id: uid(), cargo: "Gerente", nombre: U.aprobador.nombre }];

  const balance = {
    valorVentaCliente: 2400000000,
    hitos: [
      { id: uid(), nombre: "Anticipo cliente 30%", fechaProgramada: addDays(inicio, 10), valorEsperado: 720000000, pagado: true, fechaPago: addDays(inicio, 12), valorPagado: 720000000 },
      { id: uid(), nombre: "Avance de obra 40%", fechaProgramada: addDays(inicio, 120), valorEsperado: 960000000, pagado: false, fechaPago: "", valorPagado: 0 },
    ],
  };

  return { upme: { steps: upmeSteps }, energizacion, cronograma, presupuesto, pagos, balance, info };
}

const PROYECTOS = [
  { id: "30000000-0000-4000-8000-000000000001", name: "Demo Sol Norte (pruebas)", capacity: 0.99, location: "Montería, Córdoba", code: "PRB-001", miembros: ["pagos", "aprobador", "obra", "lector"], datos: proyecto({ inicio: "2026-06-01", avance: 0.35, tipo: "menor1mw" }) },
  { id: "30000000-0000-4000-8000-000000000002", name: "Demo Valle Grande (pruebas)", capacity: 4.5, location: "Palmira, Valle del Cauca", code: "PRB-002", miembros: ["aprobador", "obra"], datos: proyecto({ inicio: "2026-09-01", avance: 0.08, tipo: "mayor1mw" }) },
];

const lines = [];
lines.push(`-- GENERADO por scripts/generar-seed-pruebas.mjs — no editar a mano.
-- Datos FICTICIOS para el ambiente de pruebas. NUNCA correr en producción.
-- Usuarios (todos con la contraseña PRUEBAS_PASSWORD del script generador):
${Object.entries(U).map(([k, u]) => `--   ${u.email.padEnd(36)} ${u.role}${u.cargo ? " · " + u.cargo : ""}`).join("\n")}

begin;
`);

// Usuarios de Supabase Auth (el trigger handle_new_user crea su fila en profiles).
for (const u of Object.values(U)) {
  lines.push(`insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000', ${q(u.id)}, 'authenticated', 'authenticated', ${q(u.email)},
  extensions.crypt(${q(PRUEBAS_PASSWORD)}, extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', ${j({ full_name: u.nombre })}, now(), now(), '', '', '', '')
on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (${q(u.id)}, ${q(u.id)}, ${q(u.id)}, ${j({ sub: u.id, email: u.email, email_verified: true })}, 'email', now(), now(), now())
on conflict do nothing;`);
}

for (const [nombre, c] of Object.entries(CARGOS)) {
  const cols = Object.keys(c).filter((k) => k !== "id");
  lines.push(`insert into cargos (id, nombre${cols.map((k) => ", " + k).join("")}) values (${q(c.id)}, ${q(nombre)}${cols.map((k) => ", " + c[k]).join("")}) on conflict (id) do nothing;`);
}
for (const u of Object.values(U)) {
  lines.push(`update profiles set full_name = ${q(u.nombre)}, role = ${q(u.role)}, cargo_id = ${u.cargo ? q(CARGOS[u.cargo].id) : "null"} where id = ${q(u.id)};`);
}
for (const p of PROYECTOS) {
  lines.push(`insert into projects (id, name, capacity, location, code, created_by) values (${q(p.id)}, ${q(p.name)}, ${p.capacity}, ${q(p.location)}, ${q(p.code)}, ${q(U.admin.id)}) on conflict (id) do nothing;`);
  for (const m of p.miembros) lines.push(`insert into project_members (project_id, user_id) values (${q(p.id)}, ${q(U[m].id)}) on conflict do nothing;`);
  const d = p.datos;
  lines.push(`insert into project_data (project_id, upme, energizacion, cronograma, presupuesto, pagos, balance, info, updated_by)
values (${q(p.id)}, ${j(d.upme)}, ${j(d.energizacion)}, ${j(d.cronograma)}, ${j(d.presupuesto)}, ${j(d.pagos)}, ${j(d.balance)}, ${j(d.info)}, ${q(U.admin.id)})
on conflict (project_id) do nothing;`);
}
lines.push("\ncommit;\n");

fs.writeFileSync(out, lines.join("\n"));
console.log("Escrito", path.relative(process.cwd(), out), `(${Math.round(fs.statSync(out).size / 1024)} KB)`);
