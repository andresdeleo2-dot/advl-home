-- Sólo hace falta si ya habías corrido la versión anterior de sql/ideas.sql (sin estas
-- columnas). Si vas a correr ideas.sql por primera vez, este archivo no hace falta —
-- ideas.sql ya las incluye. Es seguro correrlo de todas formas (add column if not exists).
alter table ideas add column if not exists feature_id text;
alter table ideas add column if not exists links jsonb not null default '[]'::jsonb;
alter table ideas add column if not exists comentarios jsonb not null default '[]'::jsonb;
