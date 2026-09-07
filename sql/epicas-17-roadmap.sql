-- Fechas objetivo de una épica para la vista /roadmap (línea de tiempo). Las de un Feature NO
-- necesitan columna nueva: van dentro del jsonb `features` que ya existe (start/due por feature).
alter table epicas add column if not exists roadmap_start date;
alter table epicas add column if not exists roadmap_end date;
