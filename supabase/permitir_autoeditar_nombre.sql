-- Permite que cualquier persona edite su PROPIO nombre ("Editar mi nombre" en el sidebar) sin
-- necesitar ser admin ni tener "puede_gestionar_usuarios" — hoy la política de profiles solo
-- dejaba editar perfiles a un manager. El check evita que alguien se auto-asigne un cargo o un
-- role distinto colándose por esta política (eso sigue siendo solo cosa de un manager).
-- Corre esto en Supabase → SQL Editor.
create policy "self update own name" on profiles
  for update using (
    auth.uid() = id
  )
  with check (
    auth.uid() = id
    and role = (select p2.role from profiles p2 where p2.id = profiles.id)
    and cargo_id is not distinct from (select p2.cargo_id from profiles p2 where p2.id = profiles.id)
  );
