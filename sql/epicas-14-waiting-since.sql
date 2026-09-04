-- Espejo en servidor de "esperando desde" (antes sólo vivía en localStorage — el cron de push no
-- podía verlo, así que una tarea "en espera" con la app cerrada nunca avisaba aunque llevara semanas).
-- waiting_since: cuándo entró a "Esperando" (se limpia al salir). waiting_nudged_at: última vez que
-- el cron ya avisó de ESTA espera — evita mandar el mismo aviso cada pocos minutos.
alter table tareas add column if not exists waiting_since timestamptz;
alter table tareas add column if not exists waiting_nudged_at timestamptz;
