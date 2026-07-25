-- Agrega la columna para la nueva pestaña "Balance financiero" (hitos de pago del cliente,
-- ingresos, y cuánta plata queda). Corre esto en Supabase → SQL Editor.
-- No afecta los proyectos existentes: simplemente arrancan con la lista de hitos vacía.
alter table project_data add column if not exists balance jsonb not null default '{}'::jsonb;
