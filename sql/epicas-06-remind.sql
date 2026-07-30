-- Recordatorio opcional por tarea. Al llegar la hora (con la app abierta) dispara
-- una notificación del navegador + aviso in-app, y se limpia (recordatorio de una vez).
-- Sin esta columna el guardado normal NO se rompe: el cliente sólo escribe remind_at
-- cuando la columna existe (gate remindReady, igual que plan_hist / orden).
alter table tareas add column if not exists remind_at timestamptz;
