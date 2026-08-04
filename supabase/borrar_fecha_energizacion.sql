-- Borra la fecha de inicio de energización en TODOS los proyectos existentes (queda vacía, como
-- los proyectos nuevos). Así se quitan los avisos falsos de atraso hasta que se asigne la fecha real.
update project_data
set energizacion = jsonb_set(energizacion, '{fechaInicio}', '""'::jsonb),
    updated_at = now()
where energizacion ? 'fechaInicio';
