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
  updated_at timestamptz default now(),
  updated_by uuid references auth.users(id)
);

-- Si esta tabla ya existía de una instalación anterior, agrega las columnas nuevas sin borrar nada:
alter table project_data add column if not exists presupuesto jsonb not null default '{}'::jsonb;
alter table project_data add column if not exists pagos jsonb not null default '{}'::jsonb;

-- Perfil simple para mostrar nombre de quien hizo cada cambio (opcional)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text
);

-- Crea automáticamente un perfil cuando alguien se registra
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =========================================================
-- Row Level Security: cualquier usuario autenticado (con cuenta
-- creada por ti) puede ver y editar todos los proyectos.
-- Esto replica el modo "compartido" del artifact, pero ahora con
-- identidad real (updated_by) y sin límites de descarga/exportación.
-- =========================================================
alter table projects enable row level security;
alter table project_data enable row level security;
alter table profiles enable row level security;

create policy "authenticated read projects" on projects
  for select using (auth.role() = 'authenticated');
create policy "authenticated insert projects" on projects
  for insert with check (auth.role() = 'authenticated');
create policy "authenticated update projects" on projects
  for update using (auth.role() = 'authenticated');
create policy "authenticated delete projects" on projects
  for delete using (auth.role() = 'authenticated');

create policy "authenticated read project_data" on project_data
  for select using (auth.role() = 'authenticated');
create policy "authenticated insert project_data" on project_data
  for insert with check (auth.role() = 'authenticated');
create policy "authenticated update project_data" on project_data
  for update using (auth.role() = 'authenticated');
create policy "authenticated delete project_data" on project_data
  for delete using (auth.role() = 'authenticated');

create policy "authenticated read profiles" on profiles
  for select using (auth.role() = 'authenticated');

-- =========================================================
-- Realtime: permite que los cambios de un compañero aparezcan
-- en pantalla de los demás sin recargar la página.
-- =========================================================
alter publication supabase_realtime add table projects;
alter publication supabase_realtime add table project_data;
