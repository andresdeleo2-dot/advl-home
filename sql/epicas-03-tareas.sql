-- ─────────────────────────────────────────────────────────────────────────────
-- Tareas como tabla propia (una tarea = un renglón), en vez de un bloque JSON
-- dentro de epicas.tasks.
--
-- Este script es ADITIVO: crea la tabla nueva y no toca `epicas`. La columna
-- `epicas.tasks` se conserva intacta como respaldo hasta que decidas borrarla.
--
-- Correr en: Supabase → SQL Editor → New query → pegar y RUN.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.tareas (
  id                uuid primary key default gen_random_uuid(),
  epica_id          uuid not null references public.epicas(id) on delete cascade,
  user_id           uuid references auth.users(id) default auth.uid(),

  -- Lo básico
  titulo            text not null default '',
  estado            text not null default 'Por hacer',   -- Por hacer | En curso | Esperando | Terminada | Archivada
  prioridad         text,                                -- alta | media | baja
  dificultad        text,                                -- facil | media | dificil
  nota              text,
  avance            smallint check (avance is null or (avance >= 0 and avance <= 100)),

  -- Fechas (fechas de verdad, no texto)
  plan              date,        -- "Hacer": el día para el que está planeada
  plan_order        integer,     -- orden dentro de ese día
  vence             date,        -- "Vence": fecha de entrega
  done_at           date,        -- cuándo se terminó
  creada            date,        -- cuándo se creó (dato de negocio, no de fila)

  -- Estado previo (para deshacer completar / despegar del plan)
  plan_prev         text,
  plan_status_prev  text,

  -- Recurrencia
  repeat_every      smallint,
  repeat_unit       text check (repeat_unit is null or repeat_unit in ('dia','semana','mes')),
  repeat_until      date,
  repeat_done       jsonb not null default '[]'::jsonb,

  -- Listas anidadas: se quedan como JSON a propósito (nunca se consultan solas)
  subtasks          jsonb not null default '[]'::jsonb,
  links             jsonb not null default '[]'::jsonb,
  progress_log      jsonb not null default '[]'::jsonb,

  -- Control de fila
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Índices para las consultas que hace la app
create index if not exists tareas_epica_idx  on public.tareas (epica_id);
create index if not exists tareas_plan_idx   on public.tareas (plan);
create index if not exists tareas_vence_idx  on public.tareas (vence);
create index if not exists tareas_estado_idx on public.tareas (estado);

-- updated_at se actualiza solo en cada UPDATE
create or replace function public.tareas_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists tareas_touch_trg on public.tareas;
create trigger tareas_touch_trg
  before update on public.tareas
  for each row execute function public.tareas_touch();

-- ── Seguridad ────────────────────────────────────────────────────────────────
-- RLS activado con políticas atadas a auth.uid(). La app NO habla directo con
-- esta tabla desde el navegador: pasa por las rutas /api del servidor, que usan
-- la service key (y por tanto saltan RLS). Es la misma postura que ya tiene
-- `epicas`. Con RLS activado, cualquier acceso directo con la anon key queda
-- bloqueado, que es justo lo que queremos.
alter table public.tareas enable row level security;

drop policy if exists tareas_select on public.tareas;
create policy tareas_select on public.tareas
  for select using (auth.uid() = user_id);

drop policy if exists tareas_insert on public.tareas;
create policy tareas_insert on public.tareas
  for insert with check (auth.uid() = user_id);

drop policy if exists tareas_update on public.tareas;
create policy tareas_update on public.tareas
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists tareas_delete on public.tareas;
create policy tareas_delete on public.tareas
  for delete using (auth.uid() = user_id);
