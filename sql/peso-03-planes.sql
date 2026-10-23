-- Biblioteca de rutinas y dietas del tracker de Peso: documentos HTML que Andrés sube (los genera con
-- Claude u otra herramienta) y que /peso proyecta dentro de un iframe aislado. Una fila por documento.
-- Sin esta tabla /peso funciona igual; sólo que la pestaña "Rutinas y dietas" avisa que falta correr
-- este archivo. Es idempotente: se puede pegar de nuevo sin romper nada.
create table if not exists peso_planes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('rutina', 'dieta', 'otro')),
  titulo text not null check (char_length(titulo) between 1 and 200),
  descripcion text,
  html text not null,                        -- el documento TAL CUAL se subió (se sirve con CSP sandbox, nunca se sanitiza)
  bytes int not null check (bytes > 0),      -- tamaño en UTF-8; la lista lo muestra sin tener que traer el html
  activo boolean not null default false,     -- "en uso": a lo más uno por tipo (índice único de abajo)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- La lista ordena por tipo y fecha; nunca selecciona la columna html (pesa hasta varios MB).
create index if not exists peso_planes_tipo_created_idx on peso_planes (tipo, created_at desc);

-- A lo más un plan "en uso" por tipo, garantizado por la base y no sólo por el código: aunque dos
-- peticiones se crucen, la segunda falla con 23505 en vez de dejar dos activos.
create unique index if not exists peso_planes_un_activo_por_tipo on peso_planes (tipo) where activo;

create or replace function peso_planes_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists peso_planes_touch_trg on peso_planes;
create trigger peso_planes_touch_trg before update on peso_planes
  for each row execute function peso_planes_touch_updated_at();

-- Solo se accede desde el servidor con la service key (igual que peso_plan y peso_analisis); con RLS
-- activado y sin políticas, la llave pública no ve ni escribe nada. No lleva user_id porque es de un
-- solo usuario: el candado de quién entra está en el middleware (cuentas de Andrés), no en la fila.
alter table peso_planes enable row level security;

-- Defensa en profundidad: ni siquiera permisos de tabla para los roles públicos.
revoke all on table peso_planes from anon, authenticated;

-- Que la API de Supabase vea la tabla nueva al instante (si no, un par de segundos da "schema cache").
notify pgrst, 'reload schema';
