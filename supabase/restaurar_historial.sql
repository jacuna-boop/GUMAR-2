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
