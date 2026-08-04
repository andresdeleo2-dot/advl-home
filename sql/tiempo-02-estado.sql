-- ─────────────────────────────────────────────────────────────────────────────
-- Tiempo · Etapa 2: estado durable de "Margen" (rutina protegida, hora de dormir,
-- sueño objetivo, sesión en curso e historial) en Supabase, para que no se pierda
-- al limpiar el navegador y esté en todos tus dispositivos.
--
-- Un solo blob JSON (app personal de un usuario). El cliente sigue usando
-- localStorage como caché offline; esto es la fuente durable.
--
-- Correr en: Supabase → SQL Editor → New query → pegar y RUN. Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.tiempo_estado (
  id          text primary key default 'main',
  data        jsonb not null default '{}'::jsonb,   -- AppData { blocks, bed, sleep, session, history }
  ts          bigint not null default 0,            -- marca de tiempo del cliente (ms) para "gana el más nuevo"
  updated_at  timestamptz not null default now()
);

-- Limpieza: la tabla de la primera versión (equivocada) ya no se usa.
drop table if exists public.tiempo_actividades;

-- Nota: corre detrás del middleware de auth y la API usa la service key (sin RLS).
