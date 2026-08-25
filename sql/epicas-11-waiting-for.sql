-- "En espera / Por revisar": qué esperas de la tarea en vez de trabajarla.
-- Valores típicos: 'email' | 'respuesta' | 'comentario' | 'otro' (o texto libre).
-- Vacío/NULL = la tarea NO está en espera. La MARCA de "en espera" se ve igual con el
-- estado 'Esperando' (sin migrar); esta columna sólo guarda el DETALLE de qué esperas.
alter table tareas add column if not exists waiting_for text;
