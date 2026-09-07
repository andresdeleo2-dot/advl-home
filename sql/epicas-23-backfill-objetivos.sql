-- Backfill: epicas.kpis + epicas.features[].kpis (jsonb) → tabla objetivos. Correr DESPUÉS de
-- epicas-22-backfill-features.sql (los objetivos de feature necesitan que `features` ya exista,
-- por el FK). Idempotente (on conflict do nothing).
--
-- Clasificación: sin target y sin current → tipo='hito' (hito_estado derivado de `done`); si no,
-- tipo='metrica'. `unit` libre se mapea a la lista cerrada por alias conocidos; lo que no matchea
-- cae en 'otro' y se preserva el texto original en unidad_libre (no se pierde el dato).

-- Objetivos de ÉPICA (antes epicas.kpis)
insert into objetivos (
  id, epica_id, feature_id, tipo, t,
  target, current, unidad, unidad_libre, fecha_objetivo,
  medir_con_tareas_cerradas, menos_es_mejor, valor_inicio, task_ids,
  hito_estado, fecha_logrado, cumplido, cumplido_at, orden
)
select
  k.elem->>'id',
  e.id,
  null,
  case when (k.elem->>'target') is null and (k.elem->>'current') is null then 'hito' else 'metrica' end,
  coalesce(nullif(trim(k.elem->>'t'), ''), 'Objetivo'),
  nullif(k.elem->>'target', '')::numeric,
  nullif(k.elem->>'current', '')::numeric,
  case lower(trim(coalesce(k.elem->>'unit', '')))
    when '' then null
    when 'kg' then 'kg' when 'kilos' then 'kg' when 'kilogramos' then 'kg'
    when '%' then 'porcentaje' when 'pct' then 'porcentaje' when 'porciento' then 'porcentaje' when 'porcentaje' then 'porcentaje'
    when 'mxn' then 'pesos' when 'pesos' then 'pesos' when '$' then 'pesos'
    when 'usd' then 'usd' when 'dolares' then 'usd' when 'dólares' then 'usd' when 'us$' then 'usd'
    when 'dia' then 'dias' when 'dias' then 'dias' when 'día' then 'dias' when 'días' then 'dias'
    when 'mes' then 'meses' when 'meses' then 'meses'
    when 'hora' then 'horas' when 'horas' then 'horas' when 'hr' then 'horas' when 'hrs' then 'horas' when 'h' then 'horas'
    when 'tarea' then 'unidades' when 'tareas' then 'unidades' when 'unidad' then 'unidades' when 'unidades' then 'unidades'
    else 'otro'
  end,
  case when lower(trim(coalesce(k.elem->>'unit', ''))) not in
    ('', 'kg','kilos','kilogramos','%','pct','porciento','porcentaje','mxn','pesos','$','usd','dolares','dólares','us$',
     'dia','dias','día','días','mes','meses','hora','horas','hr','hrs','h','tarea','tareas','unidad','unidades')
    then trim(k.elem->>'unit') else null end,
  nullif(k.elem->>'due', '')::date,
  coalesce((k.elem->>'auto') = 'tareas', false),
  coalesce((k.elem->>'lowerIsBetter')::boolean, false),
  nullif(k.elem->>'start', '')::numeric,
  coalesce(k.elem->'taskIds', '[]'::jsonb),
  case when (k.elem->>'target') is null and (k.elem->>'current') is null
    then (case when coalesce((k.elem->>'done')::boolean, false) then 'logrado' else 'pendiente' end)
    else null end,
  case when (k.elem->>'target') is null and (k.elem->>'current') is null
    then nullif(k.elem->>'doneAt', '')::date else null end,
  coalesce((k.elem->>'done')::boolean, false),
  nullif(k.elem->>'doneAt', '')::date,
  (k.ord - 1) * 10
from epicas e,
     jsonb_array_elements(coalesce(e.kpis, '[]'::jsonb)) with ordinality as k(elem, ord)
where coalesce(trim(k.elem->>'id'), '') <> ''
on conflict (id) do nothing;

-- Objetivos de FEATURE (antes epicas.features[].kpis) -- misma lógica, feature_id en vez de epica_id
insert into objetivos (
  id, epica_id, feature_id, tipo, t,
  target, current, unidad, unidad_libre, fecha_objetivo,
  medir_con_tareas_cerradas, menos_es_mejor, valor_inicio, task_ids,
  hito_estado, fecha_logrado, cumplido, cumplido_at, orden
)
select
  k.elem->>'id',
  null,
  f.elem->>'id',
  case when (k.elem->>'target') is null and (k.elem->>'current') is null then 'hito' else 'metrica' end,
  coalesce(nullif(trim(k.elem->>'t'), ''), 'Objetivo'),
  nullif(k.elem->>'target', '')::numeric,
  nullif(k.elem->>'current', '')::numeric,
  case lower(trim(coalesce(k.elem->>'unit', '')))
    when '' then null
    when 'kg' then 'kg' when 'kilos' then 'kg' when 'kilogramos' then 'kg'
    when '%' then 'porcentaje' when 'pct' then 'porcentaje' when 'porciento' then 'porcentaje' when 'porcentaje' then 'porcentaje'
    when 'mxn' then 'pesos' when 'pesos' then 'pesos' when '$' then 'pesos'
    when 'usd' then 'usd' when 'dolares' then 'usd' when 'dólares' then 'usd' when 'us$' then 'usd'
    when 'dia' then 'dias' when 'dias' then 'dias' when 'día' then 'dias' when 'días' then 'dias'
    when 'mes' then 'meses' when 'meses' then 'meses'
    when 'hora' then 'horas' when 'horas' then 'horas' when 'hr' then 'horas' when 'hrs' then 'horas' when 'h' then 'horas'
    when 'tarea' then 'unidades' when 'tareas' then 'unidades' when 'unidad' then 'unidades' when 'unidades' then 'unidades'
    else 'otro'
  end,
  case when lower(trim(coalesce(k.elem->>'unit', ''))) not in
    ('', 'kg','kilos','kilogramos','%','pct','porciento','porcentaje','mxn','pesos','$','usd','dolares','dólares','us$',
     'dia','dias','día','días','mes','meses','hora','horas','hr','hrs','h','tarea','tareas','unidad','unidades')
    then trim(k.elem->>'unit') else null end,
  nullif(k.elem->>'due', '')::date,
  coalesce((k.elem->>'auto') = 'tareas', false),
  coalesce((k.elem->>'lowerIsBetter')::boolean, false),
  nullif(k.elem->>'start', '')::numeric,
  coalesce(k.elem->'taskIds', '[]'::jsonb),
  case when (k.elem->>'target') is null and (k.elem->>'current') is null
    then (case when coalesce((k.elem->>'done')::boolean, false) then 'logrado' else 'pendiente' end)
    else null end,
  case when (k.elem->>'target') is null and (k.elem->>'current') is null
    then nullif(k.elem->>'doneAt', '')::date else null end,
  coalesce((k.elem->>'done')::boolean, false),
  nullif(k.elem->>'doneAt', '')::date,
  (k.ord - 1) * 10
from epicas e,
     jsonb_array_elements(coalesce(e.features, '[]'::jsonb)) with ordinality as f(elem, ford),
     jsonb_array_elements(coalesce(f.elem->'kpis', '[]'::jsonb)) with ordinality as k(elem, ord)
where coalesce(trim(k.elem->>'id'), '') <> '' and coalesce(trim(f.elem->>'id'), '') <> ''
on conflict (id) do nothing;
