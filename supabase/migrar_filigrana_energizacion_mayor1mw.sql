-- Cambia el proyecto FILIGRANA al nuevo trámite de energización para proyectos >1MW (ante el
-- CND, con FPO manual) — arranca en blanco, como se acordó. Corre esto en Supabase → SQL Editor.
-- Los proyectos nuevos que crees de aquí en adelante con capacidad >1 MWp ya toman este trámite
-- solos, sin necesidad de este script — esto es solo para el caso de Filigrana, que ya existía.
update project_data
set energizacion = jsonb_build_object(
  'fechaInicio', '',
  'tipo', 'mayor1mw',
  'fpoManual', '',
  'milestones', (select jsonb_agg(jsonb_build_object('done', false, 'fecha', '')) from generate_series(1, 40))
),
updated_at = now()
from projects p
where project_data.project_id = p.id and upper(p.name) = 'FILIGRANA';
