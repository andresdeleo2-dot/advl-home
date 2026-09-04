-- Sección "Ideas": libreta de captura rápida, sin estructura. Cada Enter en el textarea de
-- /ideas crea una fila. Con el tiempo se revisan: se les puede poner épica/feature (etiqueta,
-- independiente de convertir — sirve para agrupar/filtrar aunque no sea tarea todavía), agregar
-- links y comentarios (mismo popup), y luego sí convertirlas en tarea real o descartarlas.
-- tarea_id se llena SOLO al convertir (epica_id/feature_id entonces ya no cambian: quedan como
-- registro de a dónde se convirtió). descartada=true = no viable (se puede deshacer).
create table if not exists ideas (
  id text primary key,
  texto text not null,
  creada timestamptz not null default now(),
  tarea_id text,
  epica_id text,
  feature_id text,
  links jsonb not null default '[]'::jsonb,
  comentarios jsonb not null default '[]'::jsonb,
  descartada boolean not null default false
);
create index if not exists ideas_creada_idx on ideas (creada desc);
