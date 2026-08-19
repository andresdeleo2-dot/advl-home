-- Estimado PROPIO por tarea (minutos): cuánto crees TÚ que te tomará la actividad.
-- Si una tarea no lo tiene, se usa el default por dificultad (fácil 45m · media 2h · difícil 4h).
-- Alimenta la carga estimada del día ("~Xh") para planear.
alter table tareas add column if not exists est_min int;
