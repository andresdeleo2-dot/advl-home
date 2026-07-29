-- Historial de días de plan de cada tarea (para el Resumen semanal: detectar las
-- tareas que estaban planeadas en una semana, no se cumplieron y se movieron a otra).
-- Se llena solo hacia adelante: cada vez que se reprograma una tarea, el día viejo
-- se guarda aquí. Sin esta columna, el guardado normal sigue funcionando (el cliente
-- no empieza a registrar el historial hasta que la columna existe).
alter table tareas add column if not exists plan_hist jsonb;
