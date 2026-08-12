-- Corrige un gap de seguridad: puede_editar_algo() y tiene_permiso() no revisaban
-- profiles.role, así que un usuario con role='lector' que además tuviera un cargo
-- con permisos de edición podría escribir datos llamando la API de Supabase
-- directo, saltándose el bloqueo de solo-lectura que hoy solo hace cumplir la
-- interfaz. Esto lo corrige a nivel de base de datos (la restricción real).
-- Corre esto en Supabase → SQL Editor.

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
