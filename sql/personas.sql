-- ============================================================
-- Mi Vida · Archivo de Personas
-- Correr una sola vez en el SQL Editor de Supabase (proyecto dxooogegqyrulrxlijsr).
-- Crea las tablas `categorias` y `personas` en el MISMO proyecto que `vida`.
-- ============================================================

-- 1) Categorías de personas (algunas pueden estar protegidas con contraseña)
create table if not exists public.categorias (
  id         text primary key,          -- slug: 'amigos', 'sangre', 'c1720...'
  name       text not null,
  locked     boolean not null default false,
  password   text default '',           -- ⚠ texto plano: ok para app personal single-user
  orden      int2 default 0,
  created_at timestamptz default now()
);

-- 2) Personas (archivo de vínculos / mini-CRM de relaciones)
create table if not exists public.personas (
  id                  uuid primary key default gen_random_uuid(),
  nombre              text not null,
  categoria           text references public.categorias(id) on delete set null,
  importancia         int2 default 3,        -- 1 Distante … 5 Núcleo
  excepcional         boolean default false,
  significado         text,                  -- "Qué significa para mí"
  conocimos           text,                  -- "Cómo nos conocimos"
  gusta               text,                  -- "Qué me gusta hacer con ella/él"
  notas               text,                  -- "Información de la persona"
  ultima_vez          date,
  cumple              date,
  celular             text,
  email               text,
  direccion_actual    text,
  direcciones_previas text[]  default '{}',
  links               jsonb   default '[]'::jsonb,  -- [{ "label": "", "url": "" }]
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create index if not exists personas_categoria_idx on public.personas (categoria);

-- 3) RLS — mismo patrón single-user que `vida`: cualquier usuario autenticado accede.
alter table public.categorias enable row level security;
alter table public.personas   enable row level security;

drop policy if exists "categorias auth all" on public.categorias;
drop policy if exists "personas auth all"   on public.personas;

create policy "categorias auth all" on public.categorias
  for all to authenticated using (true) with check (true);
create policy "personas auth all" on public.personas
  for all to authenticated using (true) with check (true);

-- 4) Categorías base (idempotente)
insert into public.categorias (id, name, locked, password, orden) values
  ('sangre',   'Familia Sangre',    false, '',     1),
  ('verdad',   'Familia de verdad', false, '',     2),
  ('hermanos', 'Hermanos',          false, '',     3),
  ('amigos',   'Amigos',            false, '',     4),
  ('mentores', 'Mentores',          false, '',     5),
  ('otros',    'Otros',             false, '',     6),
  ('privado',  'Vínculos privados', true,  'leon', 7)
on conflict (id) do nothing;
