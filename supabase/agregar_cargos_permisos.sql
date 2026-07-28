-- =========================================================
-- Sistema de "cargos" con permisos configurables por módulo, para reemplazar el control grueso
-- admin/editor/lector por algo que tú puedas ajustar por persona.
-- Corre este archivo completo en Supabase → SQL Editor.
--
-- Cómo queda:
--   - profiles.role (admin/editor/lector) SIGUE existiendo tal cual — admin sigue siendo el
--     superusuario que puede todo, sin importar el cargo. Eso no cambia y sigue siendo lo único
--     que puede promover a alguien a admin (vía SQL, como ya lo hacías).
--   - Cada persona (que no sea admin) puede tener un "cargo" (ej. "Contador", "Ingeniero de
--     campo"). Cada cargo tiene casillas de qué puede editar: UPME, Energización, Cronograma,
--     Presupuesto, Pagos, Balance financiero, aprobar pagos, eliminar proyectos, y gestionar
--     cargos/usuarios.
--   - IMPORTANTE — arranca en blanco: nadie (excepto admin) tiene ningún permiso hasta que crees
--     cargos y se los asignes desde el botón nuevo "Cargos y usuarios" en el sidebar. Mientras
--     tanto, todo el mundo que no sea admin va a ver todo en modo solo lectura.
--   - Aviso técnico importante: esto controla qué pestañas puede EDITAR cada quien desde la
--     aplicación. La base de datos sí bloquea de verdad si alguien no tiene NINGÚN permiso de
--     edición (no puede escribir nada), pero no puede distinguir a nivel de base de datos "cambió
--     el campo aprobado de un pago" de "cambió el valor" — esa distinción fina la hace la propia
--     aplicación (oculta o bloquea el botón a quien no deba usarlo).
-- =========================================================

create table if not exists cargos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  puede_editar_upme boolean not null default false,
  puede_editar_energizacion boolean not null default false,
  puede_editar_cronograma boolean not null default false,
  puede_editar_presupuesto boolean not null default false,
  puede_editar_pagos boolean not null default false,
  puede_aprobar_pagos boolean not null default false,
  puede_editar_balance boolean not null default false,
  puede_eliminar_proyectos boolean not null default false,
  puede_gestionar_usuarios boolean not null default false,
  created_at timestamptz default now()
);

alter table profiles add column if not exists cargo_id uuid references cargos(id) on delete set null;

-- security definer: lee profiles/cargos saltándose RLS (evita candados circulares), igual que
-- is_admin()/can_access_project() que ya existían.
create or replace function public.tiene_permiso(perm text)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from profiles p
    join cargos c on c.id = p.cargo_id
    where p.id = auth.uid()
    and coalesce((to_jsonb(c) ->> perm)::boolean, false)
  )
$$;

-- "¿puede editar algo en el proyecto, lo que sea?" — es el candado grueso que usa la base de
-- datos para el guardado de project_data (que guarda los 6 módulos juntos en una sola fila, así
-- que no se puede distinguir módulo por módulo a ese nivel — ver aviso arriba).
create or replace function public.puede_editar_algo()
returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from profiles p join cargos c on c.id = p.cargo_id where p.id = auth.uid()
    and (
      c.puede_editar_upme or c.puede_editar_energizacion or c.puede_editar_cronograma
      or c.puede_editar_presupuesto or c.puede_editar_pagos or c.puede_editar_balance
    )
  )
$$;

grant execute on function public.tiene_permiso(text) to authenticated;
grant execute on function public.puede_editar_algo() to authenticated;

alter table cargos enable row level security;
drop policy if exists "authenticated read cargos" on cargos;
drop policy if exists "manager write cargos" on cargos;
create policy "authenticated read cargos" on cargos
  for select using (auth.role() = 'authenticated');
create policy "manager write cargos" on cargos
  for all using (public.is_admin() or public.tiene_permiso('puede_gestionar_usuarios'))
  with check (public.is_admin() or public.tiene_permiso('puede_gestionar_usuarios'));

-- Deja que un "manager" (admin o con permiso puede_gestionar_usuarios) asigne el cargo de
-- cualquier persona — pero el "role" (admin/editor/lector) de cada quien NO se puede tocar desde
-- aquí (sigue siendo solo por SQL Editor), para que nadie se autopromueva a admin por esta vía.
drop policy if exists "manager update profiles" on profiles;
create policy "manager update profiles" on profiles
  for update using (
    public.is_admin() or public.tiene_permiso('puede_gestionar_usuarios')
  )
  with check (
    (public.is_admin() or public.tiene_permiso('puede_gestionar_usuarios'))
    and role = (select p2.role from profiles p2 where p2.id = profiles.id)
  );

-- Reemplaza los candados de "role in ('admin','editor')" por "tiene algún permiso de edición" —
-- así el control fino de qué módulo puede editar cada quien lo maneja la app, y el control grueso
-- de "puede escribir algo sí o no" lo maneja de verdad la base de datos.
drop policy if exists "editor insert projects" on projects;
create policy "editor insert projects" on projects
  for insert with check (public.puede_editar_algo());

drop policy if exists "member editor update projects" on projects;
create policy "member editor update projects" on projects
  for update using (public.puede_editar_algo() and public.can_access_project(id));

drop policy if exists "admin delete projects" on projects;
create policy "admin delete projects" on projects
  for delete using (public.is_admin() or public.tiene_permiso('puede_eliminar_proyectos'));

drop policy if exists "member editor insert project_data" on project_data;
create policy "member editor insert project_data" on project_data
  for insert with check (public.puede_editar_algo() and public.can_access_project(project_id));

drop policy if exists "member editor update project_data" on project_data;
create policy "member editor update project_data" on project_data
  for update using (public.puede_editar_algo() and public.can_access_project(project_id));

drop policy if exists "admin delete project_data" on project_data;
create policy "admin delete project_data" on project_data
  for delete using (public.is_admin() or public.tiene_permiso('puede_eliminar_proyectos'));

drop policy if exists "member editor insert project_history" on project_history;
create policy "member editor insert project_history" on project_history
  for insert with check (public.puede_editar_algo() and public.can_access_project(project_id));

drop policy if exists "member editor update project_history" on project_history;
create policy "member editor update project_history" on project_history
  for update using (public.puede_editar_algo() and public.can_access_project(project_id));

drop policy if exists "member editor insert attachments" on attachments;
create policy "member editor insert attachments" on attachments
  for insert with check (public.puede_editar_algo() and public.can_access_project(project_id));

drop policy if exists "member editor delete attachments" on attachments;
create policy "member editor delete attachments" on attachments
  for delete using (public.puede_editar_algo() and public.can_access_project(project_id));

drop policy if exists "member editor upload project files" on storage.objects;
create policy "member editor upload project files" on storage.objects
  for insert with check (
    bucket_id = 'project-files'
    and public.puede_editar_algo()
    and public.can_access_project(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "member editor delete project files" on storage.objects;
create policy "member editor delete project files" on storage.objects
  for delete using (
    bucket_id = 'project-files'
    and public.puede_editar_algo()
    and public.can_access_project(((storage.foldername(name))[1])::uuid)
  );

-- Miembros de proyecto: ahora también lo puede gestionar quien tenga puede_gestionar_usuarios,
-- no solo admin.
drop policy if exists "admin manage project_members" on project_members;
create policy "admin manage project_members" on project_members
  for all using (public.is_admin() or public.tiene_permiso('puede_gestionar_usuarios'))
  with check (public.is_admin() or public.tiene_permiso('puede_gestionar_usuarios'));
