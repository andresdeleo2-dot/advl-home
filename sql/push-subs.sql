-- Suscripciones de PUSH (recordatorios con la app CERRADA). Una fila por navegador/dispositivo.
-- El endpoint del navegador es único → sirve de llave primaria (re-suscribir hace upsert).
create table if not exists push_subs (
  endpoint    text primary key,
  sub         jsonb not null,          -- el PushSubscription completo (keys p256dh/auth incluidas)
  created_at  timestamptz not null default now()
);

-- RLS ACTIVADO, SIN políticas (default deny): esta tabla la lee/escribe SÓLO el servidor con la
-- service key (que salta RLS), nunca el cliente. La NEXT_PUBLIC_SUPABASE_ANON_KEY sí viaja al
-- navegador — sin RLS activado, cualquiera con esa key podría leer o borrar por PostgREST el
-- `PushSubscription` completo (endpoint + claves p256dh/auth) de cada dispositivo directamente,
-- sin pasar por /api/push/*. "Sin políticas" es intencional aquí, no un "por mientras".
alter table push_subs enable row level security;
