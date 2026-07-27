-- =========================================================
-- Control de Parques Solares — esquema de base de datos
-- Ejecuta este archivo completo en Supabase: Dashboard > SQL Editor > New query
-- =========================================================

create extension if not exists "pgcrypto";

-- Tabla de proyectos (nombre, capacidad, ubicación)
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  capacity text,
  location text,
  created_at timestamptz default now(),
  created_by uuid references auth.users(id)
);

-- Datos de seguimiento de cada proyecto (UPME, energización, cronograma)
-- Se guardan como JSON para poder evolucionar la estructura sin migraciones constantes
create table if not exists project_data (
  project_id uuid primary key references projects(id) on delete cascade,
  upme jsonb not null default '{}'::jsonb,
  energizacion jsonb not null default '{}'::jsonb,
  cronograma jsonb not null default '{}'::jsonb,
  presupuesto jsonb not null default '{}'::jsonb,
  pagos jsonb not null default '{}'::jsonb,
  balance jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now(),
  updated_by uuid references auth.users(id)
);

-- Si esta tabla ya existía de una instalación anterior, agrega las columnas nuevas sin borrar nada:
alter table project_data add column if not exists presupuesto jsonb not null default '{}'::jsonb;
alter table project_data add column if not exists pagos jsonb not null default '{}'::jsonb;
alter table project_data add column if not exists balance jsonb not null default '{}'::jsonb;

-- Historial de cambios: una foto del proyecto por cada guardado (agrupando guardados seguidos de
-- la misma persona en una sola fila, ver logProjectHistory en App.jsx) — para ver quién cambió qué
-- y cuándo. Solo lectura desde la UI, no se puede restaurar directamente (ver nota en el modal).
create table if not exists project_history (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  data jsonb not null,
  updated_by uuid references auth.users(id),
  updated_by_email text,
  created_at timestamptz default now()
);
create index if not exists project_history_project_id_created_at_idx
  on project_history (project_id, created_at desc);

-- Perfil simple para mostrar nombre de quien hizo cada cambio (opcional), y el rol de permisos
-- de cada persona: admin (puede borrar proyectos), editor (puede editar todo menos borrar
-- proyectos), lector (solo puede ver y exportar).
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  role text not null default 'editor' check (role in ('admin', 'editor', 'lector'))
);

-- Si esta tabla ya existía de una instalación anterior, agrega la columna sin borrar nada.
-- El default 'editor' preserva el acceso de todo el mundo tal como está hoy —
-- promueve a mano a quien deba ser 'admin' con el update de abajo.
alter table profiles add column if not exists role text not null default 'editor' check (role in ('admin', 'editor', 'lector'));

-- Crea automáticamente un perfil cuando alguien se registra. También es la valla real contra
-- registro abierto: si el correo no es del dominio de Gumar, aborta el registro completo
-- (revienta la transacción del insert en auth.users) — la validación en Login.jsx es solo para
-- mostrar un mensaje bonito antes de llegar aquí, pero esto es lo que de verdad protege.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  if new.email !~* '@gumarp\.com\.co$' then
    raise exception 'Solo se permite registro con correos @gumarp.com.co';
  end if;
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Quién tiene acceso a qué proyecto: admin ve todo siempre (no necesita fila aquí); editor/lector
-- solo ven los proyectos donde el admin los haya agregado explícitamente desde el botón de
-- "personas" en el sidebar.
create table if not exists project_members (
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (project_id, user_id)
);

-- security definer: puede leer profiles/project_members saltándose RLS — evita que la política
-- de una tabla dependa de leer otra tabla que a su vez está protegida por RLS (candado circular).
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
-- Row Level Security: admin ve y edita TODO. editor/lector solo ven (y editor solo puede
-- editar) los proyectos donde estén agregados como miembros — ver project_members arriba.
-- =========================================================
alter table projects enable row level security;
alter table project_data enable row level security;
alter table profiles enable row level security;
alter table project_history enable row level security;
alter table project_members enable row level security;

drop policy if exists "authenticated insert projects" on projects;
drop policy if exists "authenticated update projects" on projects;
drop policy if exists "authenticated delete projects" on projects;
drop policy if exists "authenticated insert project_data" on project_data;
drop policy if exists "authenticated update project_data" on project_data;
drop policy if exists "authenticated delete project_data" on project_data;
drop policy if exists "authenticated read projects" on projects;
drop policy if exists "member or admin read projects" on projects;
drop policy if exists "editor update projects" on projects;
drop policy if exists "member editor update projects" on projects;
drop policy if exists "authenticated read project_data" on project_data;
drop policy if exists "member or admin read project_data" on project_data;
drop policy if exists "editor insert project_data" on project_data;
drop policy if exists "member editor insert project_data" on project_data;
drop policy if exists "editor update project_data" on project_data;
drop policy if exists "member editor update project_data" on project_data;
drop policy if exists "authenticated read project_history" on project_history;
drop policy if exists "member or admin read project_history" on project_history;
drop policy if exists "editor insert project_history" on project_history;
drop policy if exists "member editor insert project_history" on project_history;
drop policy if exists "editor update project_history" on project_history;
drop policy if exists "member editor update project_history" on project_history;
drop policy if exists "admin manage project_members" on project_members;

create policy "member or admin read projects" on projects
  for select using (public.can_access_project(id));
create policy "editor insert projects" on projects
  for insert with check (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'editor'))
  );
create policy "member editor update projects" on projects
  for update using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'editor'))
    and public.can_access_project(id)
  );
create policy "admin delete projects" on projects
  for delete using (public.is_admin());

create policy "member or admin read project_data" on project_data
  for select using (public.can_access_project(project_id));
create policy "member editor insert project_data" on project_data
  for insert with check (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'editor'))
    and public.can_access_project(project_id)
  );
create policy "member editor update project_data" on project_data
  for update using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'editor'))
    and public.can_access_project(project_id)
  );
create policy "admin delete project_data" on project_data
  for delete using (public.is_admin());

create policy "member or admin read project_history" on project_history
  for select using (public.can_access_project(project_id));
create policy "member editor insert project_history" on project_history
  for insert with check (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'editor'))
    and public.can_access_project(project_id)
  );
create policy "member editor update project_history" on project_history
  for update using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'editor'))
    and public.can_access_project(project_id)
  );

create policy "authenticated read profiles" on profiles
  for select using (auth.role() = 'authenticated');

create policy "admin manage project_members" on project_members
  for all using (public.is_admin()) with check (public.is_admin());

-- =========================================================
-- Realtime: permite que los cambios de un compañero aparezcan
-- en pantalla de los demás sin recargar la página.
-- =========================================================
alter publication supabase_realtime add table projects;
alter publication supabase_realtime add table project_data;

-- =========================================================
-- Adjuntos: certificados UPME, actas de energización, fotos de avance de obra en el cronograma.
-- Un bucket privado de Storage (no público — los archivos se descargan con URL firmada temporal)
-- + una tabla que guarda a qué proyecto/módulo/ítem pertenece cada archivo.
-- =========================================================
insert into storage.buckets (id, name, public)
values ('project-files', 'project-files', false)
on conflict (id) do nothing;

create table if not exists attachments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  modulo text not null, -- 'upme' | 'energizacion' | 'cronograma'
  entidad_id text not null, -- id del paso/hito/tarea al que pertenece
  file_path text, -- ruta dentro del bucket "project-files" (vacío si es un enlace, ver link_url)
  file_name text not null,
  link_url text, -- si el "adjunto" es un enlace externo (Drive, SharePoint...) en vez de un archivo
  uploaded_by uuid references auth.users(id),
  uploaded_by_email text,
  created_at timestamptz default now()
);
create index if not exists attachments_project_modulo_entidad_idx
  on attachments (project_id, modulo, entidad_id);

alter table attachments enable row level security;
drop policy if exists "authenticated read attachments" on attachments;
drop policy if exists "member or admin read attachments" on attachments;
drop policy if exists "editor insert attachments" on attachments;
drop policy if exists "member editor insert attachments" on attachments;
drop policy if exists "editor delete attachments" on attachments;
drop policy if exists "member editor delete attachments" on attachments;
create policy "member or admin read attachments" on attachments
  for select using (public.can_access_project(project_id));
create policy "member editor insert attachments" on attachments
  for insert with check (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'editor'))
    and public.can_access_project(project_id)
  );
create policy "member editor delete attachments" on attachments
  for delete using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'editor'))
    and public.can_access_project(project_id)
  );

-- La ruta de cada archivo guarda el project_id como primer segmento
-- ("<projectId>/<modulo>/<entidadId>/archivo.pdf"), así que se valida desde ahí.
drop policy if exists "authenticated read project files" on storage.objects;
drop policy if exists "member or admin read project files" on storage.objects;
drop policy if exists "editor upload project files" on storage.objects;
drop policy if exists "member editor upload project files" on storage.objects;
drop policy if exists "editor delete project files" on storage.objects;
drop policy if exists "member editor delete project files" on storage.objects;
create policy "member or admin read project files" on storage.objects
  for select using (
    bucket_id = 'project-files'
    and public.can_access_project(((storage.foldername(name))[1])::uuid)
  );
create policy "member editor upload project files" on storage.objects
  for insert with check (
    bucket_id = 'project-files'
    and exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'editor'))
    and public.can_access_project(((storage.foldername(name))[1])::uuid)
  );
create policy "member editor delete project files" on storage.objects
  for delete using (
    bucket_id = 'project-files'
    and exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'editor'))
    and public.can_access_project(((storage.foldername(name))[1])::uuid)
  );
