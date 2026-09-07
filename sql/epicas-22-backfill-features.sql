-- Backfill: epicas.features (jsonb) → tabla features. Idempotente (on conflict do nothing),
-- se puede re-correr sin duplicar. Preserva el id original de cada elemento tal cual -- crítico:
-- tareas.feature_id ya apunta a esos ids y no se toca ni una fila de tareas.
--
-- Antes de correr, opcional: revisa si algún feature quedaría fuera por no tener id (no debería
-- pasar -- normalize() en el cliente siempre asigna uid() -- pero es gratis verificarlo primero):
--   select e.id, e.name
--   from epicas e, jsonb_array_elements(e.features) f
--   where coalesce(trim(f->>'id'), '') = '';

insert into features (id, epica_id, t, color, fecha_inicio, fecha_fin_objetivo, orden)
select
  f.elem->>'id',
  e.id,
  coalesce(nullif(trim(f.elem->>'t'), ''), 'Sin nombre'),
  nullif(f.elem->>'color', ''),
  nullif(f.elem->>'roadmapStart', '')::date,
  nullif(f.elem->>'roadmapEnd', '')::date,
  (f.ord - 1) * 10
from epicas e,
     jsonb_array_elements(coalesce(e.features, '[]'::jsonb)) with ordinality as f(elem, ord)
where coalesce(trim(f.elem->>'id'), '') <> ''
on conflict (id) do nothing;
