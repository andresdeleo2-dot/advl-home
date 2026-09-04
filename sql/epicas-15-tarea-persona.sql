-- Liga una tarea a una persona del archivo "Mi Vida" (misma base de Supabase, tabla `personas`) —
-- ej. "Comprar regalo" ligada a "Mamá". persona_nombre va denormalizado (el nombre AL ligarla) para
-- mostrar el chip sin otro fetch; si la persona cambia de nombre después no se actualiza sola.
alter table tareas add column if not exists persona_id text;
alter table tareas add column if not exists persona_nombre text;
create index if not exists tareas_persona_idx on tareas (persona_id);
