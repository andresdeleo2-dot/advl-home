-- Liga una tarea a una Iniciativa (y opcionalmente a un responsable en texto libre). Mismo
-- criterio que tareas.feature_id/blocked_by_task_id: referencia de TEXTO sin FK real -- tareas
-- ya está en producción y las referencias sueltas son la convención establecida.
alter table tareas add column if not exists iniciativa_id text;
alter table tareas add column if not exists responsable text;
create index if not exists tareas_iniciativa_idx on tareas (iniciativa_id);
