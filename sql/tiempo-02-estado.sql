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

-- Escritura ATÓMICA con "gana el más nuevo": el ts lo asigna el SERVIDOR (monótono),
-- no el reloj del cliente. Esto evita (a) la carrera TOCTOU de un read-modify-write y
-- (b) que un dispositivo con el reloj desfasado descarte/pierda ediciones ajenas.
create or replace function public.tiempo_estado_put(p_data jsonb)
returns bigint language plpgsql as $$
declare next_ts bigint;
begin
  select greatest(coalesce((select ts from public.tiempo_estado where id = 'main'), 0) + 1,
                  (extract(epoch from now()) * 1000)::bigint)
    into next_ts;
  insert into public.tiempo_estado (id, data, ts, updated_at)
    values ('main', p_data, next_ts, now())
    on conflict (id) do update
      set data = excluded.data, ts = excluded.ts, updated_at = excluded.updated_at;
  return next_ts;
end $$;

-- Limpieza: la tabla de la primera versión (equivocada) ya no se usa.
drop table if exists public.tiempo_actividades;

-- Nota: corre detrás del middleware de auth y la API usa la service key (sin RLS).
