-- Agrega la columna para la ficha del proyecto (equipo de trabajo, ficha técnica de equipos, y
-- qué proveedores cuentan como contratista para los cortes de obra) — datos que alimentan el
-- informe semanal PP-I-01. Corre esto en Supabase → SQL Editor.
-- No afecta los proyectos existentes: simplemente arrancan con esta info vacía.
alter table project_data add column if not exists info jsonb not null default '{}'::jsonb;
