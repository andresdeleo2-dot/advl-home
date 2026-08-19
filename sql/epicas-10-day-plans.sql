-- Sesiones por día: la MISMA tarea agendada en varios días, cada uno con SUS horas, SU dificultad
-- y su propio "hecho ese día" (sin cerrar toda la tarea). Guardado como jsonb:
--   [{ "day": "2026-08-20", "estMin": 60, "difficulty": "media", "done": false }, ...]
alter table tareas add column if not exists day_plans jsonb;
