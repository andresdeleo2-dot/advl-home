-- Features dentro de una Épica (Épica → Feature → Tarea, como Epic → Story).
-- `epicas.features`: lista de Features de la épica (nombre, color, y sus propios KPIs —
-- mismo formato que `epicas.kpis`). `tareas.feature_id`: a qué Feature pertenece la tarea
-- (opcional; una tarea puede quedar sin Feature, sólo dentro de su épica).
alter table epicas add column if not exists features jsonb not null default '[]'::jsonb;
alter table tareas add column if not exists feature_id text;
create index if not exists tareas_feature_idx on tareas (feature_id);
