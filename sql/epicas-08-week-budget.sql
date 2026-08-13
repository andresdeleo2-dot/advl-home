-- Presupuesto semanal de horas por épica (feature "presupuesto de tiempo").
-- Antes vivía sólo en localStorage (por dispositivo); con esta columna se sincroniza
-- entre celular y compu igual que el resto. Correr en el SQL Editor de Supabase.
alter table epicas add column if not exists week_budget int;
