-- Objetivos como tabla propia (antes epicas.kpis y epicas.features[].kpis, ambos jsonb con el
-- mismo shape). Un objetivo pertenece a UNA épica O a UN feature, nunca ambos ni ninguno
-- (objetivos_owner_xor). tipo='hito' para objetivos sin target/current (ya se usaban así, vía
-- done/doneAt, para metas binarias); tipo='metrica' es el caso de siempre.
create table if not exists objetivos (
  id text primary key,
  epica_id uuid references epicas(id) on delete cascade,
  feature_id text references features(id) on delete cascade,
  tipo text not null default 'metrica' check (tipo in ('metrica','hito')),
  t text not null default '',

  -- Campos de métrica (tipo = 'metrica')
  target numeric,
  current numeric,
  unidad text check (unidad is null or unidad in
    ('pesos','usd','dias','meses','porcentaje','unidades','kg','horas','otro')),
  unidad_libre text,             -- etiqueta original cuando unidad = 'otro' (no se pierde el dato)
  fecha_objetivo date,           -- antes `due`
  medir_con_tareas_cerradas boolean not null default false,   -- antes `auto === 'tareas'`
  menos_es_mejor boolean not null default false,               -- antes `lowerIsBetter`
  valor_inicio numeric,          -- antes `start` (baseline para metas que bajan)
  task_ids jsonb not null default '[]'::jsonb,   -- antes `taskIds`

  -- Campos de hito (tipo = 'hito')
  hito_estado text check (hito_estado is null or hito_estado in ('pendiente','en_curso','logrado')),
  fecha_logrado date,

  -- Comunes a ambos tipos
  cumplido boolean not null default false,   -- antes `done`
  cumplido_at date,                          -- antes `doneAt`
  orden int,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint objetivos_owner_xor check (((epica_id is not null)::int + (feature_id is not null)::int) = 1)
);

create index if not exists objetivos_epica_idx on objetivos (epica_id, orden);
create index if not exists objetivos_feature_idx on objetivos (feature_id, orden);

drop trigger if exists objetivos_touch_trg on objetivos;
create trigger objetivos_touch_trg
  before update on objetivos
  for each row execute function touch_updated_at();
