-- Campo "Resumen" de cada tarea: descripción breve de la actividad / de lo que se quiere lograr.
-- Distinto de `nota` (bitácora libre). Seguro de correr varias veces.
alter table public.tareas add column if not exists resumen text;
