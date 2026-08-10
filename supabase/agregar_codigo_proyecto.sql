-- Agrega el código corto del proyecto (ej. "GP084"), opcional — se usa en "Centro de costos/
-- proyecto" del informe PP-I-01. Corre esto en Supabase → SQL Editor.
-- No afecta los proyectos existentes: simplemente arrancan sin código hasta que lo edites a mano
-- desde "Editar proyecto".
alter table projects add column if not exists code text;
