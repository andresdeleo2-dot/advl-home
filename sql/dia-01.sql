-- «Mi día» (/dia): lo que Claude arma cada madrugada desde tu diario de Obsidian y tus épicas, y lo que
-- tú respondes en la página. Las notas siguen en Obsidian: aquí solo hay resúmenes y respuestas.
-- Sin estas tablas /dia se ve vacío y avisa; el resto de la app no cambia. Idempotente: se puede pegar de nuevo.

-- Un renglón por día PARA el que se armó (p. ej. el 2026-11-25 lleva el resumen del diario del 24).
create table if not exists dia_resumen (
  fecha        date primary key,
  data         jsonb not null check (jsonb_typeof(data) = 'object'),
  tokens       integer,
  procesado_at timestamptz not null default now()
);

-- Tus respuestas a las tarjetas (Decide, Por decidir, mover notas del inbox). id = '<fecha>:<id de la tarjeta>'.
-- estado: aceptada | pospuesta | descartada | respondida. aplicada_at la pone el cierre de la madrugada.
create table if not exists dia_respuestas (
  id          text primary key,
  fecha       date not null,
  item_id     text not null,
  tipo        text not null,
  estado      text not null,
  respuesta   jsonb,
  tarea_id    uuid,
  created_at  timestamptz not null default now(),
  aplicada_at timestamptz
);
create index if not exists dia_respuestas_fecha_idx on dia_respuestas (fecha);

-- Lo que anotas o dictas en la página. tipo: nota | cierre | pregunta. Llega a tu nota del día a las 3:00.
create table if not exists dia_capturas (
  id           uuid primary key default gen_random_uuid(),
  fecha        date not null,
  tipo         text not null default 'nota',
  texto        text not null check (length(texto) between 1 and 20000),
  created_at   timestamptz not null default now(),
  procesada_at timestamptz
);
create index if not exists dia_capturas_pendientes_idx on dia_capturas (procesada_at) where procesada_at is null;

-- Cierre del día: calificación 1–10.
create table if not exists dia_cierre (
  fecha        date primary key,
  calificacion smallint check (calificacion between 1 and 10),
  updated_at   timestamptz not null default now()
);

-- Datos sueltos del cierre: 'boveda' (por-revisar en datos), 'corrida' (última corrida), 'evitar' (lo que no se vuelve a proponer).
create table if not exists dia_kv (
  clave      text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- Igual que las tablas de /peso: solo se accede desde el servidor (service key) y desde el script de la Mac.
-- RLS activado SIN políticas: la llave pública y cualquier sesión no ven ni escriben nada. El candado es el middleware.
alter table dia_resumen    enable row level security;
alter table dia_respuestas enable row level security;
alter table dia_capturas   enable row level security;
alter table dia_cierre     enable row level security;
alter table dia_kv         enable row level security;
revoke all on table dia_resumen, dia_respuestas, dia_capturas, dia_cierre, dia_kv from anon, authenticated;

notify pgrst, 'reload schema';
