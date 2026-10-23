-- Último análisis con IA del tracker de Peso. Una sola fila (id fijo 'main'): el análisis vigente,
-- con la huella de los datos con los que se hizo (firma) para saber cuándo ya quedó viejo.
-- Sin esta tabla todo funciona igual; sólo que el análisis no queda guardado entre visitas.
create table if not exists peso_analisis (
  id text primary key default 'main',
  firma text not null,
  fuente text not null default 'ia',        -- 'ia' (Gemini) o 'reglas' (plan B cuando la IA no respondió)
  fecha_base date not null,                  -- fecha de la última medición considerada
  n_registros int not null,
  contenido jsonb not null,
  created_at timestamptz not null default now()
);

-- Solo se accede desde el servidor con la service key (igual que peso_plan); sin políticas, la llave
-- pública no ve nada. Es de un solo usuario, por eso no lleva user_id.
alter table peso_analisis enable row level security;
