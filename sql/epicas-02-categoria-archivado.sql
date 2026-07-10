-- ============================================================
-- Épicas · Etapa 2: categoría + archivado
-- Correr en el SQL editor de Supabase (proyecto dxooogegqyrulrxlijsr).
-- Idempotente.
-- ============================================================

alter table public.epicas add column if not exists categoria text;
alter table public.epicas add column if not exists archived boolean not null default false;

-- (opcional) categorías iniciales sugeridas para las épicas sembradas
update public.epicas set categoria = 'Patrimonio' where categoria is null and name in ('Inmuebles');
update public.epicas set categoria = 'Finanzas'   where categoria is null and name in ('Flujo','Inversiones','Créditos');
update public.epicas set categoria = 'Legal/Admin' where categoria is null and name in ('Fiscal','Legal','Documentos');
update public.epicas set categoria = 'Personal'   where categoria is null and name in ('Salud & Peso');
update public.epicas set categoria = 'Proyectos'  where categoria is null and name in ('Proyectos');
