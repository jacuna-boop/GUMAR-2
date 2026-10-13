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
    and p.role <> 'lector'
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
    and p.role <> 'lector'
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

-- =========================================================
-- Proteger datos (guardado por módulo con versiones + historial en el servidor).
-- Copia de supabase/proteger_datos.sql — mantener ambos iguales.
-- =========================================================
-- =========================================================
-- Proteger datos: guardado por módulo con detección de conflictos + historial en el servidor.
-- Correr UNA vez en Supabase → SQL Editor. Se puede volver a correr sin problema.
--
-- Qué hace:
-- 1. project_data.module_versions: un número de versión por módulo (upme, pagos, …).
-- 2. save_project_modules(): guarda solo los módulos que cambiaron y SOLO si nadie más los guardó
--    desde que la persona los abrió. Si alguien sí lo hizo, no guarda nada y devuelve el conflicto
--    para que la app pregunte qué hacer. Corre con los permisos de quien llama (RLS aplica igual).
-- 3. Historial automático: un trigger guarda una foto en project_history con cada cambio real.
--    Agrupa los cambios seguidos de la misma persona en ventanas fijas de 10 minutos.
--    La app ya no puede escribir ni editar el historial (antes cualquier editor podía).
-- No modifica ningún dato existente de los proyectos.
-- =========================================================

alter table project_data add column if not exists module_versions jsonb not null default '{}'::jsonb;
alter table project_history add column if not exists changed_modules text[];

create or replace function public.save_project_modules(p_project_id uuid, p_changes jsonb, p_expected jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  cur project_data%rowtype;
  k text;
  conflicts text[] := '{}';
  new_versions jsonb;
  allowed text[] := array['upme', 'energizacion', 'cronograma', 'presupuesto', 'pagos', 'balance', 'info'];
begin
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception 'p_changes debe ser un objeto';
  end if;

  -- "for update" bloquea la fila hasta terminar: dos guardados simultáneos se atienden en orden.
  -- Con RLS, si la persona no puede editar este proyecto la fila simplemente no aparece.
  select * into cur from project_data where project_id = p_project_id for update;
  if not found then
    raise exception 'No tienes permiso para editar este proyecto (o no existe)' using errcode = '42501';
  end if;

  for k in select jsonb_object_keys(p_changes) loop
    if not (k = any(allowed)) then
      raise exception 'Módulo inválido: %', k;
    end if;
    if jsonb_typeof(p_changes -> k) <> 'object' then
      raise exception 'El módulo % debe ser un objeto', k;
    end if;
    if coalesce((cur.module_versions ->> k)::int, 0) <> coalesce((p_expected ->> k)::int, 0) then
      conflicts := array_append(conflicts, k);
    end if;
  end loop;

  if array_length(conflicts, 1) > 0 then
    return jsonb_build_object('ok', false, 'conflicts', to_jsonb(conflicts), 'row', to_jsonb(cur));
  end if;

  new_versions := coalesce(cur.module_versions, '{}'::jsonb);
  for k in select jsonb_object_keys(p_changes) loop
    new_versions := jsonb_set(new_versions, array[k], to_jsonb(coalesce((cur.module_versions ->> k)::int, 0) + 1));
  end loop;

  update project_data set
    upme         = case when p_changes ? 'upme'         then p_changes -> 'upme'         else upme end,
    energizacion = case when p_changes ? 'energizacion' then p_changes -> 'energizacion' else energizacion end,
    cronograma   = case when p_changes ? 'cronograma'   then p_changes -> 'cronograma'   else cronograma end,
    presupuesto  = case when p_changes ? 'presupuesto'  then p_changes -> 'presupuesto'  else presupuesto end,
    pagos        = case when p_changes ? 'pagos'        then p_changes -> 'pagos'        else pagos end,
    balance      = case when p_changes ? 'balance'      then p_changes -> 'balance'      else balance end,
    info         = case when p_changes ? 'info'         then p_changes -> 'info'         else info end,
    module_versions = new_versions,
    updated_at = now(),
    updated_by = auth.uid()
  where project_id = p_project_id;

  if not found then
    raise exception 'No tienes permiso para editar este proyecto' using errcode = '42501';
  end if;

  return jsonb_build_object('ok', true, 'versions', new_versions);
end;
$$;

grant execute on function public.save_project_modules(uuid, jsonb, jsonb) to authenticated;

-- Sube la versión de cualquier módulo cuyo contenido cambie aunque el cambio NO venga de
-- save_project_modules (pestañas abiertas con la versión vieja de la app, scripts en el SQL
-- Editor…). Así la app nueva siempre se entera y nunca pisa esos cambios.
create or replace function public.bump_module_versions()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  m text;
  v jsonb := coalesce(new.module_versions, '{}'::jsonb);
begin
  foreach m in array array['upme', 'energizacion', 'cronograma', 'presupuesto', 'pagos', 'balance', 'info'] loop
    if (to_jsonb(new) -> m) is distinct from (to_jsonb(old) -> m)
       and (v -> m) is not distinct from (old.module_versions -> m) then
      v := jsonb_set(v, array[m], to_jsonb(coalesce((old.module_versions ->> m)::int, 0) + 1));
    end if;
  end loop;
  new.module_versions := v;
  return new;
end;
$$;

drop trigger if exists before_project_data_update_versions on project_data;
create trigger before_project_data_update_versions
  before update on project_data
  for each row execute procedure public.bump_module_versions();

-- Historial automático. security definer: escribe en project_history aunque la app ya no pueda.
create or replace function public.log_project_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed text[] := '{}';
  actor uuid := auth.uid();
  actor_email text;
  snap jsonb;
  last_row project_history%rowtype;
begin
  if tg_op = 'UPDATE' then
    if new.upme         is distinct from old.upme         then changed := array_append(changed, 'upme'); end if;
    if new.energizacion is distinct from old.energizacion then changed := array_append(changed, 'energizacion'); end if;
    if new.cronograma   is distinct from old.cronograma   then changed := array_append(changed, 'cronograma'); end if;
    if new.presupuesto  is distinct from old.presupuesto  then changed := array_append(changed, 'presupuesto'); end if;
    if new.pagos        is distinct from old.pagos        then changed := array_append(changed, 'pagos'); end if;
    if new.balance      is distinct from old.balance      then changed := array_append(changed, 'balance'); end if;
    if new.info         is distinct from old.info         then changed := array_append(changed, 'info'); end if;
    if array_length(changed, 1) is null then
      return new; -- nada de contenido cambió (p. ej. solo updated_at)
    end if;
  end if;

  snap := jsonb_build_object(
    'upme', new.upme, 'energizacion', new.energizacion, 'cronograma', new.cronograma,
    'presupuesto', new.presupuesto, 'pagos', new.pagos, 'balance', new.balance, 'info', new.info
  );

  if actor is null then
    actor_email := 'sistema (SQL Editor)';
  else
    select email into actor_email from profiles where id = actor;
  end if;

  select * into last_row from project_history
    where project_id = new.project_id
    order by created_at desc
    limit 1;

  -- Misma persona dentro de la misma ventana de 10 min → actualizar esa foto. La ventana NO se
  -- corre (created_at no cambia), así que una sesión larga deja una foto cada 10 min y el estado
  -- previo a los cambios de otra persona siempre queda guardado en su propia fila.
  if found
     and last_row.updated_by is not distinct from actor
     and last_row.created_at > now() - interval '10 minutes' then
    update project_history
      set data = snap,
          changed_modules = (select array_agg(distinct m) from unnest(coalesce(last_row.changed_modules, '{}') || changed) as m)
      where id = last_row.id;
  else
    insert into project_history (project_id, data, updated_by, updated_by_email, changed_modules)
    values (new.project_id, snap, actor, actor_email, case when tg_op = 'INSERT' then null else changed end);
  end if;

  return new;
end;
$$;

drop trigger if exists on_project_data_changed on project_data;
create trigger on_project_data_changed
  after insert or update on project_data
  for each row execute procedure public.log_project_history();

-- La app ya no escribe el historial: solo lectura para los miembros del proyecto.
drop policy if exists "member editor insert project_history" on project_history;
drop policy if exists "member editor update project_history" on project_history;
drop policy if exists "editor insert project_history" on project_history;
drop policy if exists "editor update project_history" on project_history;

-- Verificación (debería devolver la columna nueva y la función):
-- select column_name from information_schema.columns where table_name = 'project_data' and column_name = 'module_versions';
-- select proname from pg_proc where proname in ('save_project_modules', 'log_project_history');

-- =========================================================
-- Seguridad: permisos por módulo y aprobación de pagos (copia de supabase/seguridad_permisos.sql).
-- =========================================================
-- =========================================================
-- Seguridad: permisos por módulo y aprobación de pagos impuestos por la base de datos.
-- Correr en Supabase → SQL Editor DESPUÉS de proteger_datos.sql. Se puede volver a correr.
-- No modifica ningún dato de los proyectos.
--
-- Antes, la base de datos solo exigía "puede editar ALGO": la restricción por pestaña la hacía
-- la pantalla, y con trucos técnicos se podía saltar. Ahora:
-- 1. Cada módulo (UPME, Energización, Cronograma, Presupuesto, Pagos, Balance) solo lo guarda
--    quien tiene la casilla de ese módulo en su cargo. La información del proyecto (Resumen), quien
--    puede editar algo. El admin puede todo; los cambios desde el SQL Editor no se restringen.
-- 2. Aprobar, desaprobar, borrar o cambiar el valor de un pago APROBADO exige "Aprobar pagos", y
--    el nombre de quien aprueba tiene que ser el de la persona conectada (no se puede falsificar).
--    Quien solo tiene "Aprobar pagos" ya puede guardar sus aprobaciones (antes no podía).
-- 3. Al crear un proyecto, el creador registrado tiene que ser quien lo crea.
-- 4. Quien gestiona usuarios sin ser admin no puede cambiarse su propio cargo ni editar las
--    casillas del cargo que tiene (antes se podía dar a sí mismo todos los permisos).
-- =========================================================

-- Pagos sin los campos de aprobación (para saber si cambió algo más que la aprobación).
create or replace function public.pagos_sin_aprobacion(p jsonb)
returns jsonb
language sql immutable
set search_path = public
as $$
  select case when jsonb_typeof(p -> 'ordenes') = 'array' then
    jsonb_set(p, '{ordenes}', coalesce((
      select jsonb_agg(
        case when jsonb_typeof(o -> 'pagos') = 'array' then
          jsonb_set(o, '{pagos}', coalesce((
            select jsonb_agg(pg - 'aprobado' - 'aprobadoPor' - 'aprobadoEn' order by i)
            from jsonb_array_elements(o -> 'pagos') with ordinality as x(pg, i)
          ), '[]'::jsonb))
        else o end
        order by j)
      from jsonb_array_elements(p -> 'ordenes') with ordinality as y(o, j)
    ), '[]'::jsonb))
  else p end
$$;

-- Pagos aprobados: { idPago: { aprobadoPor, aprobadoEn, valor } }.
create or replace function public.pagos_aprobados(p jsonb)
returns jsonb
language sql immutable
set search_path = public
as $$
  select coalesce(jsonb_object_agg(
    coalesce(pg ->> 'id', ''),
    jsonb_build_object('aprobadoPor', pg -> 'aprobadoPor', 'aprobadoEn', pg -> 'aprobadoEn', 'valor', pg -> 'valor')
  ), '{}'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(p -> 'ordenes') = 'array' then p -> 'ordenes' else '[]'::jsonb end) as o,
       jsonb_array_elements(case when jsonb_typeof(o -> 'pagos') = 'array' then o -> 'pagos' else '[]'::jsonb end) as pg
  where pg -> 'aprobado' = 'true'::jsonb
$$;

create or replace function public.enforce_module_permissions()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  m text;
  labels jsonb := '{"upme":"UPME","energizacion":"Energización","cronograma":"Cronograma","presupuesto":"Presupuesto","balance":"Balance financiero"}';
  old_ap jsonb;
  new_ap jsonb;
  k text;
  v jsonb;
  my_name text;
  my_email text;
begin
  -- SQL Editor / service role (sin usuario) y admin: sin restricción.
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  foreach m in array array['upme', 'energizacion', 'cronograma', 'presupuesto', 'balance'] loop
    if (to_jsonb(new) -> m) is distinct from (to_jsonb(old) -> m)
       and not public.tiene_permiso('puede_editar_' || m) then
      raise exception 'No tienes permiso para editar %.', labels ->> m using errcode = '42501';
    end if;
  end loop;

  if new.info is distinct from old.info and not public.puede_editar_algo() then
    raise exception 'No tienes permiso para editar la información del proyecto.' using errcode = '42501';
  end if;

  if new.pagos is distinct from old.pagos then
    if public.pagos_sin_aprobacion(new.pagos) is distinct from public.pagos_sin_aprobacion(old.pagos)
       and not public.tiene_permiso('puede_editar_pagos') then
      raise exception 'No tienes permiso para editar Pagos.' using errcode = '42501';
    end if;

    old_ap := public.pagos_aprobados(old.pagos);
    new_ap := public.pagos_aprobados(new.pagos);
    if new_ap is distinct from old_ap then
      if not public.tiene_permiso('puede_aprobar_pagos') then
        raise exception 'Solo quien tiene permiso de aprobar pagos puede aprobar, desaprobar, borrar o cambiar el valor de un pago aprobado.'
          using errcode = '42501';
      end if;
      select nullif(trim(full_name), ''), email into my_name, my_email from profiles where id = auth.uid();
      for k, v in select * from jsonb_each(new_ap) loop
        if (old_ap -> k) is distinct from v
           and (v ->> 'aprobadoPor') is distinct from my_name
           and (v ->> 'aprobadoPor') is distinct from my_email then
          raise exception 'El nombre de quien aprueba un pago tiene que ser el tuyo.' using errcode = '42501';
        end if;
      end loop;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists before_project_data_enforce_permissions on project_data;
create trigger before_project_data_enforce_permissions
  before update on project_data
  for each row execute procedure public.enforce_module_permissions();

-- Quien solo puede aprobar pagos también necesita poder guardar (el trigger de arriba limita qué).
drop policy if exists "member editor update project_data" on project_data;
create policy "member editor update project_data" on project_data
  for update using (
    (public.puede_editar_algo() or public.tiene_permiso('puede_aprobar_pagos'))
    and public.can_access_project(project_id)
  );

drop policy if exists "editor insert projects" on projects;
create policy "editor insert projects" on projects
  for insert with check (public.puede_editar_algo() and created_by = auth.uid());

drop policy if exists "manager update profiles" on profiles;
create policy "manager update profiles" on profiles
  for update using (
    public.is_admin() or public.tiene_permiso('puede_gestionar_usuarios')
  )
  with check (
    (public.is_admin() or public.tiene_permiso('puede_gestionar_usuarios'))
    and role = (select p2.role from profiles p2 where p2.id = profiles.id)
    and (
      public.is_admin()
      or profiles.id <> auth.uid()
      or cargo_id is not distinct from (select p2.cargo_id from profiles p2 where p2.id = profiles.id)
    )
  );

drop policy if exists "manager write cargos" on cargos;
drop policy if exists "manager insert cargos" on cargos;
drop policy if exists "manager update cargos" on cargos;
drop policy if exists "manager delete cargos" on cargos;
create policy "manager insert cargos" on cargos
  for insert with check (public.is_admin() or public.tiene_permiso('puede_gestionar_usuarios'));
create policy "manager update cargos" on cargos
  for update using (
    public.is_admin()
    or (public.tiene_permiso('puede_gestionar_usuarios')
        and id is distinct from (select cargo_id from profiles where profiles.id = auth.uid()))
  )
  with check (public.is_admin() or public.tiene_permiso('puede_gestionar_usuarios'));
create policy "manager delete cargos" on cargos
  for delete using (
    public.is_admin()
    or (public.tiene_permiso('puede_gestionar_usuarios')
        and id is distinct from (select cargo_id from profiles where profiles.id = auth.uid()))
  );

-- =========================================================
-- Restaurar desde el historial (copia de supabase/restaurar_historial.sql; reemplaza
-- log_project_history definido más arriba).
-- =========================================================
-- =========================================================
-- Restaurar desde el historial: devuelve los módulos elegidos de un proyecto a como estaban en
-- una versión del historial. Correr en Supabase → SQL Editor DESPUÉS de proteger_datos.sql y
-- seguridad_permisos.sql. Se puede volver a correr. No modifica datos de los proyectos.
--
-- - restore_project_modules(id_version, modulos): corre con los permisos de quien llama, así que
--   cada persona solo puede restaurar los módulos que su cargo le deja editar (lo impone
--   enforce_module_permissions, igual que un guardado normal).
-- - Antes de restaurar se guarda en el historial una foto del estado actual ("Antes de restaurar"),
--   y la restauración queda como su propia fila ("Restauración") — así siempre se puede deshacer.
-- =========================================================

alter table project_history add column if not exists kind text;               -- null = guardado normal
alter table project_history add column if not exists source_history_id uuid;  -- versión desde la que se restauró

create or replace function public.log_project_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed text[] := '{}';
  actor uuid := auth.uid();
  actor_email text;
  snap jsonb;
  last_row project_history%rowtype;
  restoring boolean := coalesce(current_setting('app.restore_source', true), '') <> '';
begin
  if tg_op = 'UPDATE' then
    if new.upme         is distinct from old.upme         then changed := array_append(changed, 'upme'); end if;
    if new.energizacion is distinct from old.energizacion then changed := array_append(changed, 'energizacion'); end if;
    if new.cronograma   is distinct from old.cronograma   then changed := array_append(changed, 'cronograma'); end if;
    if new.presupuesto  is distinct from old.presupuesto  then changed := array_append(changed, 'presupuesto'); end if;
    if new.pagos        is distinct from old.pagos        then changed := array_append(changed, 'pagos'); end if;
    if new.balance      is distinct from old.balance      then changed := array_append(changed, 'balance'); end if;
    if new.info         is distinct from old.info         then changed := array_append(changed, 'info'); end if;
    if array_length(changed, 1) is null then
      return new; -- nada de contenido cambió (p. ej. solo updated_at)
    end if;
  end if;

  snap := jsonb_build_object(
    'upme', new.upme, 'energizacion', new.energizacion, 'cronograma', new.cronograma,
    'presupuesto', new.presupuesto, 'pagos', new.pagos, 'balance', new.balance, 'info', new.info
  );

  if actor is null then
    actor_email := 'sistema (SQL Editor)';
  else
    select email into actor_email from profiles where id = actor;
  end if;

  -- Restauración: foto del estado anterior + fila de la restauración, siempre filas nuevas.
  if restoring and tg_op = 'UPDATE' then
    insert into project_history (project_id, data, updated_by, updated_by_email, changed_modules, kind)
    values (new.project_id,
            jsonb_build_object('upme', old.upme, 'energizacion', old.energizacion, 'cronograma', old.cronograma,
                               'presupuesto', old.presupuesto, 'pagos', old.pagos, 'balance', old.balance, 'info', old.info),
            actor, actor_email, changed, 'antes_de_restaurar');
    insert into project_history (project_id, data, updated_by, updated_by_email, changed_modules, kind, source_history_id, created_at)
    values (new.project_id, snap, actor, actor_email, changed, 'restauracion',
            current_setting('app.restore_source', true)::uuid, now() + interval '1 millisecond');
    return new;
  end if;

  select * into last_row from project_history
    where project_id = new.project_id
    order by created_at desc
    limit 1;

  -- Misma persona dentro de la misma ventana de 10 min → actualizar esa foto (solo si es un
  -- guardado normal: las filas de restauración no se tocan nunca).
  if found
     and last_row.kind is null
     and last_row.updated_by is not distinct from actor
     and last_row.created_at > now() - interval '10 minutes' then
    update project_history
      set data = snap,
          changed_modules = (select array_agg(distinct m) from unnest(coalesce(last_row.changed_modules, '{}') || changed) as m)
      where id = last_row.id;
  else
    insert into project_history (project_id, data, updated_by, updated_by_email, changed_modules)
    values (new.project_id, snap, actor, actor_email, case when tg_op = 'INSERT' then null else changed end);
  end if;

  return new;
end;
$$;

create or replace function public.restore_project_modules(p_history_id uuid, p_modules text[])
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  h project_history%rowtype;
  m text;
  allowed text[] := array['upme', 'energizacion', 'cronograma', 'presupuesto', 'pagos', 'balance', 'info'];
begin
  if p_modules is null or array_length(p_modules, 1) is null then
    raise exception 'Elige al menos un módulo para restaurar.';
  end if;

  -- RLS: solo se ve el historial de proyectos a los que se tiene acceso.
  select * into h from project_history where id = p_history_id;
  if not found then
    raise exception 'No se encontró esa versión del historial.' using errcode = 'P0002';
  end if;

  foreach m in array p_modules loop
    if not (m = any(allowed)) then
      raise exception 'Módulo inválido: %', m;
    end if;
    if jsonb_typeof(h.data -> m) is distinct from 'object' then
      raise exception 'Esa versión no tiene datos de %.', m;
    end if;
  end loop;

  perform set_config('app.restore_source', p_history_id::text, true);

  update project_data set
    upme         = case when 'upme'         = any(p_modules) then h.data -> 'upme'         else upme end,
    energizacion = case when 'energizacion' = any(p_modules) then h.data -> 'energizacion' else energizacion end,
    cronograma   = case when 'cronograma'   = any(p_modules) then h.data -> 'cronograma'   else cronograma end,
    presupuesto  = case when 'presupuesto'  = any(p_modules) then h.data -> 'presupuesto'  else presupuesto end,
    pagos        = case when 'pagos'        = any(p_modules) then h.data -> 'pagos'        else pagos end,
    balance      = case when 'balance'      = any(p_modules) then h.data -> 'balance'      else balance end,
    info         = case when 'info'         = any(p_modules) then h.data -> 'info'         else info end,
    updated_at = now(),
    updated_by = auth.uid()
  where project_id = h.project_id;

  if not found then
    raise exception 'No tienes permiso para editar este proyecto.' using errcode = '42501';
  end if;

  perform set_config('app.restore_source', '', true);
  return jsonb_build_object('ok', true, 'project_id', h.project_id);
end;
$$;

grant execute on function public.restore_project_modules(uuid, text[]) to authenticated;
