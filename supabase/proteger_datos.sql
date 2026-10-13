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
