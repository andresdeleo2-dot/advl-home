-- Iniciativas: un nivel más fino dentro de un Feature (Feature → Iniciativa → Tarea). Concepto
-- nuevo, sin equivalente jsonb previo -- tabla nueva, sin filas que proteger. feature_id/epica_id
-- son FKs reales; epica_id va denormalizado para no necesitar un join extra al filtrar por épica.
create table if not exists iniciativas (
  id text primary key,
  feature_id text not null references features(id) on delete cascade,
  epica_id uuid not null references epicas(id) on delete cascade,
  nombre text not null default '',
  descripcion text,
  estado text not null default 'pendiente'
    check (estado in ('pendiente','en_curso','bloqueada','cerrada','cancelada')),
  fecha_inicio date,
  fecha_fin_objetivo date,
  responsable text,
  orden int,
  bloqueada_por text references iniciativas(id) on delete set null
    check (bloqueada_por is null or bloqueada_por <> id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists iniciativas_feature_idx on iniciativas (feature_id, orden);
create index if not exists iniciativas_epica_idx on iniciativas (epica_id);
create index if not exists iniciativas_bloqueada_por_idx on iniciativas (bloqueada_por);

drop trigger if exists iniciativas_touch_trg on iniciativas;
create trigger iniciativas_touch_trg
  before update on iniciativas
  for each row execute function touch_updated_at();
