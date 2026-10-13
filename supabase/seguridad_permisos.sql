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
