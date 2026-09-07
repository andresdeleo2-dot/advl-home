-- Dependencia REAL entre tareas, independiente de "Esperando" (esa ya existe vía waiting_task_id
-- pero exige marcar la tarea 'Esperando'). Esta es para secuenciar tu propio trabajo: "primero
-- termino A, luego puedo B" — B puede estar en cualquier estado (Por hacer, En curso…), no hace
-- falta ponerla en espera. blocked_by_task_id = la tarea que hay que terminar antes.
alter table tareas add column if not exists blocked_by_task_id text;
create index if not exists tareas_blocked_by_idx on tareas (blocked_by_task_id);
