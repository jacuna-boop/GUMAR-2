-- =========================================================
-- Control de Parques Solares — esquema de base de datos
-- Ejecuta este archivo completo en Supabase: Dashboard > SQL Editor > New query
-- =========================================================

create extension if not exists "pgcrypto";

-- Tabla de proyectos (nombre, capacidad, ubicación)
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text, -- código corto interno (ej. "GP084"), opcional — se usa en el informe PP-I-01
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
  info jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now(),
  updated_by uuid references auth.users(id)
);

-- Si esta tabla ya existía de una instalación anterior, agrega las columnas nuevas sin borrar nada:
alter table project_data add column if not exists presupuesto jsonb not null default '{}'::jsonb;
alter table project_data add column if not exists pagos jsonb not null default '{}'::jsonb;
alter table project_data add column if not exists balance jsonb not null default '{}'::jsonb;
alter table project_data add column if not exists info jsonb not null default '{}'::jsonb;

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
-- de cada persona: admin (superusuario, puede todo) / editor / lector (solo puede ver y exportar,
-- nunca editar, sin importar el cargo). El control fino de qué puede EDITAR cada quien (por
-- módulo) vive en "cargos" más abajo, no en este role.
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

-- Quién tiene acceso a qué proyecto: admin ve todo siempre (no necesita fila aquí); el resto solo
-- ve los proyectos donde el admin (o alguien con permiso de gestionar usuarios) lo haya agregado
-- explícitamente desde el botón de "personas" en el sidebar.
create table if not exists project_members (
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (project_id, user_id)
);

-- Cargos: cada uno trae casillas de qué módulo puede editar, si puede aprobar pagos, eliminar
-- proyectos y gestionar cargos/usuarios. Arrancan sin ningún cargo creado — hasta que el admin
-- cree cargos y se los asigne a cada quien, nadie (salvo admin) puede editar nada.
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

-- security definer: puede leer profiles/project_members/cargos saltándose RLS — evita que la
-- política de una tabla dependa de leer otra tabla que a su vez está protegida por RLS (candado
-- circular).
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

-- Permiso puntual del cargo de quien está conectado (ej. 'puede_aprobar_pagos'). Lee la columna
-- por nombre dinámicamente, así que agregar un permiso nuevo más adelante no requiere tocar esta
-- función — basta con agregar la columna a "cargos".
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

-- "¿Puede editar algo en el proyecto, lo que sea?" — es el candado grueso que usa la base de
-- datos para el guardado de project_data (los 6 módulos van juntos en una sola fila, así que no
-- se puede exigir un permiso módulo por módulo a este nivel — el detalle fino lo hace la app).
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

grant execute on function public.is_admin() to authenticated;
grant execute on function public.can_access_project(uuid) to authenticated;
grant execute on function public.tiene_permiso(text) to authenticated;
grant execute on function public.puede_editar_algo() to authenticated;

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
-- Row Level Security: admin ve y edita TODO. El resto solo ve los proyectos donde esté agregado
-- como miembro, y solo puede editar si su cargo se lo permite — ver project_members y cargos
-- arriba.
-- =========================================================
alter table projects enable row level security;
alter table project_data enable row level security;
alter table profiles enable row level security;
alter table project_history enable row level security;
alter table project_members enable row level security;
alter table cargos enable row level security;

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
drop policy if exists "manager update profiles" on profiles;
drop policy if exists "self update own name" on profiles;
drop policy if exists "authenticated read cargos" on cargos;
drop policy if exists "manager write cargos" on cargos;

create policy "member or admin read projects" on projects
  for select using (public.can_access_project(id));
create policy "editor insert projects" on projects
  for insert with check (public.puede_editar_algo());
create policy "member editor update projects" on projects
  for update using (public.puede_editar_algo() and public.can_access_project(id));
create policy "admin delete projects" on projects
  for delete using (public.is_admin() or public.tiene_permiso('puede_eliminar_proyectos'));

create policy "member or admin read project_data" on project_data
  for select using (public.can_access_project(project_id));
create policy "member editor insert project_data" on project_data
  for insert with check (public.puede_editar_algo() and public.can_access_project(project_id));
create policy "member editor update project_data" on project_data
  for update using (public.puede_editar_algo() and public.can_access_project(project_id));
create policy "admin delete project_data" on project_data
  for delete using (public.is_admin() or public.tiene_permiso('puede_eliminar_proyectos'));

create policy "member or admin read project_history" on project_history
  for select using (public.can_access_project(project_id));
create policy "member editor insert project_history" on project_history
  for insert with check (public.puede_editar_algo() and public.can_access_project(project_id));
create policy "member editor update project_history" on project_history
  for update using (public.puede_editar_algo() and public.can_access_project(project_id));

create policy "authenticated read profiles" on profiles
  for select using (auth.role() = 'authenticated');

-- Un "manager" (admin o con permiso puede_gestionar_usuarios) puede asignar el cargo de
-- cualquier persona — pero el "role" (admin/editor/lector) de cada quien NO se puede tocar desde
-- aquí (sigue siendo solo por SQL Editor), para que nadie se autopromueva a admin por esta vía.
create policy "manager update profiles" on profiles
  for update using (
    public.is_admin() or public.tiene_permiso('puede_gestionar_usuarios')
  )
  with check (
    (public.is_admin() or public.tiene_permiso('puede_gestionar_usuarios'))
    and role = (select p2.role from profiles p2 where p2.id = profiles.id)
  );

-- Cualquiera puede editar su PROPIO nombre (ej. desde "Editar mi nombre" en el sidebar), sin
-- necesitar ser manager — pero el check impide que se cuele un cambio de role o cargo_id por esta
-- vía (eso sigue siendo solo cosa de un manager, vía la política de arriba).
create policy "self update own name" on profiles
  for update using (
    auth.uid() = id
  )
  with check (
    auth.uid() = id
    and role = (select p2.role from profiles p2 where p2.id = profiles.id)
    and cargo_id is not distinct from (select p2.cargo_id from profiles p2 where p2.id = profiles.id)
  );

create policy "admin manage project_members" on project_members
  for all using (public.is_admin() or public.tiene_permiso('puede_gestionar_usuarios'))
  with check (public.is_admin() or public.tiene_permiso('puede_gestionar_usuarios'));

create policy "authenticated read cargos" on cargos
  for select using (auth.role() = 'authenticated');
create policy "manager write cargos" on cargos
  for all using (public.is_admin() or public.tiene_permiso('puede_gestionar_usuarios'))
  with check (public.is_admin() or public.tiene_permiso('puede_gestionar_usuarios'));

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
  for insert with check (public.puede_editar_algo() and public.can_access_project(project_id));
create policy "member editor delete attachments" on attachments
  for delete using (public.puede_editar_algo() and public.can_access_project(project_id));

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
    and public.puede_editar_algo()
    and public.can_access_project(((storage.foldername(name))[1])::uuid)
  );
create policy "member editor delete project files" on storage.objects
  for delete using (
    bucket_id = 'project-files'
    and public.puede_editar_algo()
    and public.can_access_project(((storage.foldername(name))[1])::uuid)
  );
