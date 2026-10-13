// Base de datos de prueba: Postgres real (PGlite, compilado a WebAssembly) con supabase/schema.sql
// cargado tal cual, más imitaciones mínimas de lo que Supabase trae de fábrica (auth.uid(), roles,
// storage, publicación de realtime). Así las pruebas ejercitan las mismas funciones, triggers y
// políticas RLS que corren en producción.
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// "create extension pgcrypto" no existe en PGlite y no hace falta: gen_random_uuid() viene en Postgres.
const schemaSql = fs.readFileSync(path.join(here, "..", "schema.sql"), "utf8")
  .replace(/create extension if not exists "?pgcrypto"?;/gi, "");

const SUPABASE_STUBS = `
  create role anon;
  create role authenticated;
  create role service_role;
  create schema auth;
  create table auth.users (
    id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb,
    instance_id uuid, aud text, role text, encrypted_password text, email_confirmed_at timestamptz,
    raw_app_meta_data jsonb, created_at timestamptz, updated_at timestamptz, confirmation_token text,
    recovery_token text, email_change text, email_change_token_new text
  );
  create table auth.identities (
    id uuid primary key, user_id uuid, provider_id text, identity_data jsonb, provider text,
    last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz
  );
  -- pgcrypto vive en el esquema extensions en Supabase; aquí basta una imitación.
  create schema extensions;
  create function extensions.gen_salt(text) returns text language sql as $$ select 'salt' $$;
  create function extensions.crypt(text, text) returns text language sql as $$ select md5($1) $$;
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create function auth.role() returns text language sql stable as
    $$ select case when auth.uid() is null then 'anon' else 'authenticated' end $$;
  grant usage on schema auth to anon, authenticated;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean default false);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select string_to_array(name, '/') $$;
  create publication supabase_realtime;
`;

export const ids = {
  project: "00000000-0000-0000-0000-0000000000f1",
  admin: "00000000-0000-0000-0000-0000000000a1",
  pagos: "00000000-0000-0000-0000-0000000000a2",
  aprobador: "00000000-0000-0000-0000-0000000000a3",
  upme: "00000000-0000-0000-0000-0000000000a4",
  lector: "00000000-0000-0000-0000-0000000000a5",
  gestor: "00000000-0000-0000-0000-0000000000a6",
  cargoPagos: "00000000-0000-0000-0000-0000000000c1",
  cargoAprobador: "00000000-0000-0000-0000-0000000000c2",
  cargoUpme: "00000000-0000-0000-0000-0000000000c3",
  cargoGestor: "00000000-0000-0000-0000-0000000000c4",
};

// Usuarios: admin, uno por cargo (Pagos, Aprobador, UPME, Gestor de usuarios) y un lector.
// Todos miembros de un proyecto "Demo" con dos pagos (ninguno aprobado).
// Base vacía: solo schema.sql (y lo que traiga "extraSql", p. ej. el seed de pruebas).
export async function createEmptyDb(extraSql = "") {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  await db.exec(schemaSql);
  if (extraSql) await db.exec(extraSql);
  return db;
}

export async function createDb() {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  await db.exec(schemaSql);
  const u = ids;
  await db.exec(`
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
    insert into auth.users (id, email) values
      ('${u.admin}', 'admin@gumarp.com.co'), ('${u.pagos}', 'pagos@gumarp.com.co'),
      ('${u.aprobador}', 'ana@gumarp.com.co'), ('${u.upme}', 'uli@gumarp.com.co'),
      ('${u.lector}', 'leo@gumarp.com.co'), ('${u.gestor}', 'gus@gumarp.com.co');
    insert into cargos (id, nombre, puede_editar_pagos) values ('${u.cargoPagos}', 'Pagos', true);
    insert into cargos (id, nombre, puede_aprobar_pagos) values ('${u.cargoAprobador}', 'Aprobador', true);
    insert into cargos (id, nombre, puede_editar_upme) values ('${u.cargoUpme}', 'UPME', true);
    insert into cargos (id, nombre, puede_gestionar_usuarios, puede_editar_upme) values ('${u.cargoGestor}', 'Gestor', true, true);
    update profiles set role = 'admin' where id = '${u.admin}';
    update profiles set full_name = 'Pepa Pagos', cargo_id = '${u.cargoPagos}' where id = '${u.pagos}';
    update profiles set full_name = 'Ana Aprueba', cargo_id = '${u.cargoAprobador}' where id = '${u.aprobador}';
    update profiles set full_name = 'Uli', cargo_id = '${u.cargoUpme}' where id = '${u.upme}';
    update profiles set full_name = 'Leo', role = 'lector', cargo_id = '${u.cargoPagos}' where id = '${u.lector}';
    update profiles set full_name = 'Gus', cargo_id = '${u.cargoGestor}' where id = '${u.gestor}';
    insert into projects (id, name, created_by) values ('${u.project}', 'Demo', '${u.admin}');
    insert into project_members (project_id, user_id) select '${u.project}', id from auth.users
      on conflict do nothing;
    insert into project_data (project_id, pagos) values ('${u.project}',
      '{"ordenes":[{"id":"o1","pagos":[{"id":"p1","valor":100,"estado":"programado"},{"id":"p2","valor":50}]}]}');
    set role authenticated;
  `);

  const as = (userId) => db.exec(`select set_config('test.uid', '${userId || ""}', false)`);
  const asSuperuser = async (fn) => {
    await db.exec("reset role");
    try { return await fn(); } finally { await db.exec("set role authenticated"); }
  };
  const row = async () => (await db.query(`select * from project_data where project_id = $1`, [u.project])).rows[0];
  // Guarda como lo hace la app (rpc save_project_modules) usando las versiones actuales.
  const save = async (changes) => {
    const { module_versions: v } = await row();
    const expected = Object.fromEntries(Object.keys(changes).map((k) => [k, v[k] || 0]));
    const r = (await db.query(`select save_project_modules($1, $2::jsonb, $3::jsonb) r`,
      [u.project, JSON.stringify(changes), JSON.stringify(expected)])).rows[0].r;
    return r;
  };
  const history = () => asSuperuser(async () =>
    (await db.query(`select * from project_history where project_id = $1 order by created_at, id`, [u.project])).rows);
  return { db, as, asSuperuser, row, save, history };
}

// Ejecuta fn y devuelve el mensaje de error de la base de datos ("" si no hubo error).
export async function errorOf(fn) {
  try { await fn(); return ""; } catch (e) { return e.message || String(e); }
}
