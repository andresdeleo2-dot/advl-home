-- Links por feature (dashboards, carpetas, hojas…): mismo formato que epicas.links
-- ({ l: nombre, url, type: Dashboard|Supabase|Excel|Drive|Otro }). Sin correr esto, la app muestra
-- los features igual y solo avisa al intentar guardar un link. Se puede correr las veces que sea.
alter table features add column if not exists links jsonb not null default '[]'::jsonb;
