-- updated_at es el sello que usa /api/tareas/sync para detectar "esta tarea cambió en otra pestaña".
-- /api/tareas/wait-since (espejo de "esperando desde") y el cron de push (waiting_nudged_at) escriben
-- columnas de seguimiento por fuera del guardado normal; si eso sube updated_at, el guardado de la
-- tarea que va justo detrás choca y se pierde la edición (nota, subtareas, estado). Aquí, un UPDATE
-- que solo cambia esas columnas (o nada) conserva el sello anterior. Se puede correr las veces que sea.
create or replace function public.tareas_touch()
returns trigger language plpgsql as $$
begin
  if (to_jsonb(new) - 'updated_at' - 'waiting_since' - 'waiting_nudged_at')
     = (to_jsonb(old) - 'updated_at' - 'waiting_since' - 'waiting_nudged_at') then
    new.updated_at = old.updated_at;
  else
    new.updated_at = now();
  end if;
  return new;
end $$;
