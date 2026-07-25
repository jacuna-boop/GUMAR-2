-- =========================================================
-- Restringe el acceso a proyectos por persona (antes: cualquier usuario logueado veía TODO).
-- Corre este archivo completo en Supabase → SQL Editor.
--
-- Cómo queda:
--   - admin: sigue viendo y editando TODOS los proyectos, sin excepción.
--   - editor / lector: solo ven (y solo pueden editar, si son editor) los proyectos donde
--     el admin los haya agregado explícitamente como miembros.
--   - Los proyectos que YA EXISTEN quedan sin miembros asignados — es decir, nadie (excepto
--     admin) los va a ver hasta que entres a cada proyecto y agregues a la gente desde el botón
--     nuevo de "personas" en el sidebar. Esto fue una decisión explícita (más estricto que
--     mantener el acceso actual) — si te equivocas y quieres revertir el "en blanco", puedes
--     correr el bloque comentado al final de este archivo.
--   - Los proyectos NUEVOS que cree cualquier persona la agregan automáticamente como miembro
--     de ese proyecto (si no, se quedaría sin poder ver lo que acaba de crear).
-- =========================================================

-- Tabla: quién tiene acceso a qué proyecto.
create table if not exists project_members (
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (project_id, user_id)
);

alter table project_members enable row level security;
drop policy if exists "admin manage project_members" on project_members;

-- Funciones auxiliares (security definer: pueden leer profiles/project_members saltándose RLS,
-- así evitamos que la política de una tabla necesite leer otra tabla que a su vez está protegida
-- por RLS y crear un candado circular).
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin')
$$;

create or replace function public.can_access_project(pid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from project_members where project_id = pid and user_id = auth.uid()
  )
$$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.can_access_project(uuid) to authenticated;

create policy "admin manage project_members" on project_members
  for all using (public.is_admin()) with check (public.is_admin());

-- Agrega automáticamente al creador de un proyecto como miembro (si no, no vería lo que creó).
create or replace function public.handle_new_project()
returns trigger as $$
begin
  if new.created_by is not null then
    insert into public.project_members (project_id, user_id) values (new.id, new.created_by)
    on conflict do nothing;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_project_created on projects;
create trigger on_project_created
  after insert on projects
  for each row execute procedure public.handle_new_project();

-- =========================================================
-- Reemplaza las políticas de lectura/escritura de projects / project_data / project_history /
-- attachments / storage.objects para que exijan ser miembro del proyecto (o admin).
-- =========================================================

drop policy if exists "authenticated read projects" on projects;
drop policy if exists "member or admin read projects" on projects;
create policy "member or admin read projects" on projects
  for select using (public.can_access_project(id));

drop policy if exists "editor update projects" on projects;
drop policy if exists "member editor update projects" on projects;
create policy "member editor update projects" on projects
  for update using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'editor'))
    and public.can_access_project(id)
  );

drop policy if exists "authenticated read project_data" on project_data;
drop policy if exists "member or admin read project_data" on project_data;
create policy "member or admin read project_data" on project_data
  for select using (public.can_access_project(project_id));

drop policy if exists "editor insert project_data" on project_data;
drop policy if exists "member editor insert project_data" on project_data;
create policy "member editor insert project_data" on project_data
  for insert with check (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'editor'))
    and public.can_access_project(project_id)
  );

drop policy if exists "editor update project_data" on project_data;
drop policy if exists "member editor update project_data" on project_data;
create policy "member editor update project_data" on project_data
  for update using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'editor'))
    and public.can_access_project(project_id)
  );

drop policy if exists "authenticated read project_history" on project_history;
drop policy if exists "member or admin read project_history" on project_history;
create policy "member or admin read project_history" on project_history
  for select using (public.can_access_project(project_id));

drop policy if exists "editor insert project_history" on project_history;
drop policy if exists "member editor insert project_history" on project_history;
create policy "member editor insert project_history" on project_history
  for insert with check (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'editor'))
    and public.can_access_project(project_id)
  );

drop policy if exists "editor update project_history" on project_history;
drop policy if exists "member editor update project_history" on project_history;
create policy "member editor update project_history" on project_history
  for update using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'editor'))
    and public.can_access_project(project_id)
  );

drop policy if exists "authenticated read attachments" on attachments;
drop policy if exists "member or admin read attachments" on attachments;
create policy "member or admin read attachments" on attachments
  for select using (public.can_access_project(project_id));

drop policy if exists "editor insert attachments" on attachments;
drop policy if exists "member editor insert attachments" on attachments;
create policy "member editor insert attachments" on attachments
  for insert with check (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'editor'))
    and public.can_access_project(project_id)
  );

drop policy if exists "editor delete attachments" on attachments;
drop policy if exists "member editor delete attachments" on attachments;
create policy "member editor delete attachments" on attachments
  for delete using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'editor'))
    and public.can_access_project(project_id)
  );

-- Archivos adjuntos en Storage: la ruta guarda el project_id como primer segmento
-- ("<projectId>/<modulo>/<entidadId>/archivo.pdf"), así que se valida desde ahí.
drop policy if exists "authenticated read project files" on storage.objects;
drop policy if exists "member or admin read project files" on storage.objects;
create policy "member or admin read project files" on storage.objects
  for select using (
    bucket_id = 'project-files'
    and public.can_access_project(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "editor upload project files" on storage.objects;
drop policy if exists "member editor upload project files" on storage.objects;
create policy "member editor upload project files" on storage.objects
  for insert with check (
    bucket_id = 'project-files'
    and exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'editor'))
    and public.can_access_project(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "editor delete project files" on storage.objects;
drop policy if exists "member editor delete project files" on storage.objects;
create policy "member editor delete project files" on storage.objects
  for delete using (
    bucket_id = 'project-files'
    and exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'editor'))
    and public.can_access_project(((storage.foldername(name))[1])::uuid)
  );

-- =========================================================
-- Por si te arrepientes de dejar los proyectos existentes "en blanco": esto le da acceso a
-- TODOS los usuarios actuales a TODOS los proyectos actuales (como estaba antes), y de ahí
-- tú vas quitando gente proyecto por proyecto desde la UI. Descomenta y corre si lo necesitas.
-- =========================================================
-- insert into project_members (project_id, user_id)
-- select p.id, u.id from projects p cross join auth.users u
-- on conflict do nothing;
