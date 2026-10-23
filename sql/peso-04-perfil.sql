-- Perfil personal del tracker de Peso: estatura, fecha de nacimiento, sexo, actividad, hábitos y notas de
-- cuidado. Con esto /peso calcula el IMC, los pesos objetivo, el gasto energético y los rangos de grasa, y la
-- IA y los prompts de rutina/dieta dejan de asumir datos. UNA sola fila (id fijo 'main'), como peso_plan.
-- Sin esta tabla /peso funciona igual con los datos supuestos de siempre (estatura 181 cm, hombre, etc.); solo
-- que la pestaña "Mi perfil" avisa que falta correr este archivo. Es idempotente: se puede pegar de nuevo.
create table if not exists peso_perfil (
  id text primary key default 'main' check (id = 'main'),   -- una sola fila: no hay multiusuario aquí
  estatura_cm numeric not null check (estatura_cm between 120 and 230),
  fecha_nacimiento date,
  sexo text not null check (sexo in ('hombre', 'mujer')),
  actividad text not null check (actividad in ('sedentario', 'ligera', 'moderada', 'alta')),
  dias_entrenamiento int not null check (dias_entrenamiento between 0 and 7),
  experiencia text check (experiencia in ('principiante', 'intermedio', 'avanzado')),
  equipo text check (equipo in ('gimnasio', 'casa_mancuernas', 'sin_equipo')),
  comidas_dia int check (comidas_dia between 1 and 8),
  alcohol text check (alcohol in ('nunca', 'ocasional', 'frecuente')),
  sueno_horas int check (sueno_horas between 3 and 12),
  -- Textos libres (los que se mandan a la IA y a los prompts): tope de 500 caracteres, igual que el formulario.
  lesiones text check (char_length(lesiones) <= 500),
  restricciones text check (char_length(restricciones) <= 500),
  preferencias text check (char_length(preferencias) <= 500),
  notas_salud text check (char_length(notas_salud) <= 500),
  updated_at timestamptz not null default now()
);

create or replace function peso_perfil_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists peso_perfil_touch_trg on peso_perfil;
create trigger peso_perfil_touch_trg before update on peso_perfil
  for each row execute function peso_perfil_touch_updated_at();

-- SON DATOS DE SALUD: solo se accede desde el servidor con la service key (igual que peso_plan, peso_analisis y
-- peso_planes). Con RLS activado y SIN políticas, la llave pública (anon) y cualquier sesión de usuario no ven ni
-- escriben nada: es el "default deny" que pide CLAUDE.md. No lleva user_id porque es de un solo usuario: el
-- candado de quién entra está en el middleware (cuentas de Andrés), no en la fila, y agregar políticas por
-- auth.uid() solo abriría una puerta que hoy está cerrada.
alter table peso_perfil enable row level security;

-- Defensa en profundidad: ni siquiera permisos de tabla para los roles públicos.
revoke all on table peso_perfil from anon, authenticated;

-- Que la API de Supabase vea la tabla nueva al instante (si no, un par de segundos da "schema cache").
notify pgrst, 'reload schema';
