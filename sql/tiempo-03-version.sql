-- ─────────────────────────────────────────────────────────────────────────────
-- Tiempo · Etapa 3: que un equipo no pise lo que hiciste en otro.
--
-- Antes ganaba el último que guardaba: si terminabas una sesión en el celular y a
-- los pocos segundos la laptop (que aún no se enteraba) guardaba algo, la laptop
-- regresaba la sesión y borraba el registro del celular.
--
-- Ahora cada equipo dice desde qué versión guarda (p_base). Si el servidor ya tiene
-- una más nueva, NO escribe y devuelve -1: la app trae la versión nueva, le aplica
-- encima sólo lo que cambiaste tú y vuelve a guardar.
--
-- Correr en: Supabase → SQL Editor → New query → pegar y RUN. Idempotente.
-- Requiere sql/tiempo-02-estado.sql (ya corrido). Mientras no se corra, la app
-- sigue funcionando como antes.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.tiempo_estado_put_si(p_data jsonb, p_base bigint)
returns bigint language plpgsql as $$
declare cur_ts bigint; next_ts bigint;
begin
  -- Candado de la fila: dos guardados al mismo tiempo se forman, no se cruzan.
  select ts into cur_ts from public.tiempo_estado where id = 'main' for update;
  if coalesce(cur_ts, 0) > p_base then
    return -1;   -- alguien guardó una versión más nueva que la que este equipo vio
  end if;
  next_ts := greatest(coalesce(cur_ts, 0) + 1, (extract(epoch from now()) * 1000)::bigint);
  insert into public.tiempo_estado (id, data, ts, updated_at)
    values ('main', p_data, next_ts, now())
    on conflict (id) do update
      set data = excluded.data, ts = excluded.ts, updated_at = excluded.updated_at;
  return next_ts;
end $$;

-- Solo la API del servidor (service key) la llama.
revoke all on function public.tiempo_estado_put_si(jsonb, bigint) from public, anon, authenticated;
