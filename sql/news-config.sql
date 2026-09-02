-- Temas de la sección Noticias del Panel (qué buscar por tema: GTA VI, Microsoft, México…).
-- Una sola fila con el arreglo completo, como tiempo_estado — se edita desde el Panel, no aquí.
create table if not exists news_config (
  id          text primary key default 'main',
  tracks      jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);

-- RLS ACTIVADO, SIN políticas (default deny): esta tabla la lee/escribe SÓLO el servidor con la
-- service key (que salta RLS), nunca el cliente directo. Igual que push_subs.
alter table news_config enable row level security;
