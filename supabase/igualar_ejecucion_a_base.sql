-- Para cada proyecto existente, copia los ítems de "base" tal cual a "ejecución"
-- (mismos id, cantidad, valor unitario, etc.) — sobrescribe lo que haya hoy en ejecución.
-- No se puede deshacer.
update project_data
set presupuesto = jsonb_set(
  presupuesto,
  '{ejecucion}',
  coalesce(
    (select jsonb_agg(item) from jsonb_array_elements(presupuesto->'base') as item),
    '[]'::jsonb
  )
),
updated_at = now()
where presupuesto ? 'base';
