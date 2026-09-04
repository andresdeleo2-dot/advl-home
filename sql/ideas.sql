-- Sección "Ideas": libreta de captura rápida, sin estructura. Cada Enter en el textarea de
-- /ideas crea una fila. Con el tiempo se revisan: se convierten en tarea (épica + feature
-- opcional) o se descartan. tarea_id/epica_id quedan puestos cuando se convierte (para el
-- enlace de vuelta); descartada=true cuando se decide que no es viable (se puede deshacer).
create table if not exists ideas (
  id text primary key,
  texto text not null,
  creada timestamptz not null default now(),
  tarea_id text,
  epica_id text,
  descartada boolean not null default false
);
create index if not exists ideas_creada_idx on ideas (creada desc);
