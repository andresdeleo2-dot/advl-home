-- ─────────────────────────────────────────────────────────────────────────────
-- Orden manual de las tareas DENTRO de su épica ("cuál va primero").
--
-- Es distinto de `plan_order`, que ordena las tareas dentro de un día del
-- enfoque. `orden` es el orden propio de la épica.
--
-- Aditivo y seguro: si no lo corres, la app sigue funcionando (las tareas se
-- ordenan por fecha de creación); sólo el reordenar quedaría sin guardar.
--
-- Correr en: Supabase → SQL Editor → New query → pegar y RUN.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.tareas
  add column if not exists orden integer;

create index if not exists tareas_orden_idx on public.tareas (epica_id, orden);
