-- Comentarios rápidos por tarea (se agregan desde el detalle, sin abrir el editor).
-- Cada comentario es { at: ISO, text }. Sin esta columna el guardado normal NO se
-- rompe: el cliente sólo escribe `comentarios` cuando la columna existe (gate).
alter table tareas add column if not exists comentarios jsonb;
