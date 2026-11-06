-- Contenido editable de «Rutinas y dietas» en /peso: la rutina (con sus fotos), la dieta y el plan maestro son datos
-- que se cambian desde la propia página. Una fila por documento (id = 'rutina' | 'dieta' | 'plan'); `data` es el
-- documento completo en JSON. Sin fila, la página muestra el original que viene en el código; «Restaurar original»
-- borra la fila. Sin esta tabla /peso funciona igual (se ve todo, solo que no se pueden guardar cambios).
-- Es idempotente: se puede pegar de nuevo.
create table if not exists peso_contenido (
  id text primary key check (id in ('rutina', 'dieta', 'plan')),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now()
);

create or replace function peso_contenido_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists peso_contenido_touch_trg on peso_contenido;
create trigger peso_contenido_touch_trg before update on peso_contenido
  for each row execute function peso_contenido_touch_updated_at();

-- Son tus planes de salud: solo se accede desde el servidor con la service key (igual que peso_plan, peso_analisis,
-- peso_planes y peso_perfil). Con RLS activado y SIN políticas, la llave pública (anon) y cualquier sesión de usuario
-- no ven ni escriben nada ("default deny"). El candado de quién entra está en el middleware, no en la fila.
alter table peso_contenido enable row level security;

-- Defensa en profundidad: ni siquiera permisos de tabla para los roles públicos.
revoke all on table peso_contenido from anon, authenticated;

-- Que la API de Supabase vea la tabla nueva al instante (si no, un par de segundos da "schema cache").
notify pgrst, 'reload schema';
