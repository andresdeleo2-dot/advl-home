-- Plan de rutina/dieta + meta del tracker de Peso. Una sola fila (id fijo 'main') — no hay
-- multiusuario aquí, así que no hace falta una tabla de settings más elaborada.
create table if not exists peso_plan (
  id text primary key default 'main',
  rutina text,
  dieta text,
  notas text,
  meta_peso numeric,
  meta_fecha date,
  meta_grasa numeric,
  updated_at timestamptz not null default now()
);

create or replace function peso_plan_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists peso_plan_touch_trg on peso_plan;
create trigger peso_plan_touch_trg before update on peso_plan
  for each row execute function peso_plan_touch_updated_at();
