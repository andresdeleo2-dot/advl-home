-- Features como tabla propia (antes vivían en epicas.features, jsonb). Tabla nueva, sin filas
-- que proteger. id sigue TEXT (no uuid): lo genera el cliente con uid() (components/epicas/core.tsx)
-- y tareas.feature_id -- que ya apunta a estos mismos ids -- debe seguir funcionando sin reescribir
-- ni una fila. epicas.features (jsonb) NO se toca ni se borra: queda como respaldo histórico.
create table if not exists features (
  id text primary key,
  epica_id uuid not null references epicas(id) on delete cascade,
  t text not null default '',
  color text,
  estado text not null default 'en_curso'
    check (estado in ('en_curso','en_riesgo','al_dia','en_pausa','cerrado')),
  fecha_inicio date,
  fecha_fin_objetivo date,
  orden int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists features_epica_idx on features (epica_id, orden);

-- Función genérica reusada por features/objetivos/iniciativas.
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists features_touch_trg on features;
create trigger features_touch_trg
  before update on features
  for each row execute function touch_updated_at();
