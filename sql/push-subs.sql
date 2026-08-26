-- Suscripciones de PUSH (recordatorios con la app CERRADA). Una fila por navegador/dispositivo.
-- El endpoint del navegador es único → sirve de llave primaria (re-suscribir hace upsert).
create table if not exists push_subs (
  endpoint    text primary key,
  sub         jsonb not null,          -- el PushSubscription completo (keys p256dh/auth incluidas)
  created_at  timestamptz not null default now()
);
-- Se lee/escribe SÓLO desde el servidor con la service key (no necesita RLS para el cliente).
