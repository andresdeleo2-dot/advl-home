-- Dependencia real entre tareas: "En espera" puede apuntar a OTRA tarea (no sólo texto libre).
-- waiting_task_id vive junto a waiting_for (mismo patrón, sql/epicas-11-waiting-for.sql) — sólo se
-- usa cuando waiting_for = 'tarea'. Sin FK real (tareas.id es uuid pero la app ya valida en código,
-- igual que el resto de referencias sueltas de esta tabla) para poder borrarla sin arrastrar reglas.
alter table tareas add column if not exists waiting_task_id uuid;
create index if not exists tareas_waiting_task_idx on tareas (waiting_task_id);
