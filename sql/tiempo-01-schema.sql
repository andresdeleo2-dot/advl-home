-- ─────────────────────────────────────────────────────────────────────────────
-- Tiempo · Etapa 1: actividades personales del día (sección /tiempo, estilo "Margen").
--
-- Estas actividades son PROPIAS de esta sección y no tienen relación con las
-- tareas de Épicas: son cosas personales/diarias que se acomodan en el tiempo.
-- Una actividad = un renglón. `inicio` en NULL = está en el "por acomodar" del día.
--
-- Correr en: Supabase → SQL Editor → New query → pegar y RUN. Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.tiempo_actividades (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) default auth.uid(),

  titulo      text not null default '',
  area        text not null default 'ocio',   -- trabajo | cuerpo | ocio | personas | cierre | sueno
  fecha       date not null,                  -- día al que pertenece (YYYY-MM-DD, local)
  inicio      integer,                        -- minutos desde medianoche (NULL = sin agendar)
  dur         integer not null default 30,    -- duración en minutos
  nota        text,
  hecho       boolean not null default false,
  orden       integer,                        -- desempate/orden dentro del "por acomodar"

  creada      timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists tiempo_actividades_fecha_idx on public.tiempo_actividades (fecha);

-- Mantener updated_at fresco en cada UPDATE.
create or replace function public.tiempo_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists tiempo_actividades_touch on public.tiempo_actividades;
create trigger tiempo_actividades_touch
  before update on public.tiempo_actividades
  for each row execute function public.tiempo_touch_updated_at();

-- Nota: la sección corre detrás del middleware de auth (mismo patrón que /peso y
-- /epicas) y la API usa la service key en el servidor, así que no se activa RLS.
