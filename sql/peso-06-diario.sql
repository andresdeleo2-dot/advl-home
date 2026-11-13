-- Diario de «Rutinas y dietas» en /peso: una fila por día con lo que comiste (las comidas de tu dieta), tus gustos fuera
-- del plan (alcohol, chocolate, pastel…) y tu ejercicio. `data` es el día completo en JSON; /peso saca de ahí cuánto
-- ganaste o perdiste por día, semana, mes y año. Sin esta tabla /peso funciona igual (se ve el diario, pero no se puede
-- anotar). Es idempotente: se puede pegar de nuevo.
create table if not exists peso_diario (
  fecha date primary key,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now()
);

create or replace function peso_diario_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists peso_diario_touch_trg on peso_diario;
create trigger peso_diario_touch_trg before update on peso_diario
  for each row execute function peso_diario_touch_updated_at();

-- Es información de salud: solo se accede desde el servidor con la service key (igual que peso_plan, peso_analisis,
-- peso_planes, peso_perfil y peso_contenido). Con RLS activado y SIN políticas, la llave pública (anon) y cualquier
-- sesión de usuario no ven ni escriben nada ("default deny"). El candado de quién entra está en el middleware.
alter table peso_diario enable row level security;

-- Defensa en profundidad: ni siquiera permisos de tabla para los roles públicos.
revoke all on table peso_diario from anon, authenticated;

-- Que la API de Supabase vea la tabla nueva al instante (si no, un par de segundos da "schema cache").
notify pgrst, 'reload schema';
