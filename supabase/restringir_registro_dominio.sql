-- Bloquea el registro abierto: solo se pueden crear cuentas nuevas con correo @gumarp.com.co.
-- Corre esto en Supabase → SQL Editor. No afecta a nadie que ya tenga cuenta — solo aplica a
-- registros NUEVOS a partir de ahora.
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
