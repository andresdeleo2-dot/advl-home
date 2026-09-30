-- Candado RLS en las tablas cuyos SQL originales no lo activaban. La app solo las toca desde el
-- servidor con la service key (que se salta RLS), así que activarlo sin políticas no rompe nada y
-- nadie puede leerlas ni escribirlas con la llave pública (anon), que viaja en el JS del login.
-- 2026-09-30: en la base real ya estaban protegidas (la anon ve 0 filas); esto deja el repo igual
-- a la base por si algún día se recrean desde estos archivos. Se puede correr las veces que sea.
alter table if exists tiempo_estado enable row level security;
alter table if exists features      enable row level security;
alter table if exists objetivos     enable row level security;
alter table if exists iniciativas   enable row level security;
alter table if exists ideas         enable row level security;
alter table if exists peso_plan     enable row level security;
