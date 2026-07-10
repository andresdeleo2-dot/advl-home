-- ============================================================
-- Épicas (grandes frentes) — una sola tabla con columnas JSONB.
-- Correr en el SQL editor de Supabase (proyecto de advl-home).
-- RLS activado + políticas por CLAUDE.md. La app usa la
-- service key (salta RLS); las políticas protegen accesos anon/authed.
-- ============================================================

create table if not exists public.epicas (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) default auth.uid(),
  name         text not null,
  color        text not null default '#2E5A9E',
  description  text,
  status       text not null default 'En curso',   -- En curso | En riesgo | Al día | En pausa
  source_table text,
  source_sync  text,
  epic_order   int  default 0,
  kpis         jsonb not null default '[]'::jsonb,  -- [{v,l}]
  routines     jsonb not null default '[]'::jsonb,  -- [{t,days:bool[7] Lun→Dom}]
  tasks        jsonb not null default '[]'::jsonb,  -- [{t,status,due,note}]
  links        jsonb not null default '[]'::jsonb,  -- [{l,url,type,primary}]
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

alter table public.epicas enable row level security;

drop policy if exists "epicas_select" on public.epicas;
drop policy if exists "epicas_insert" on public.epicas;
drop policy if exists "epicas_update" on public.epicas;
drop policy if exists "epicas_delete" on public.epicas;

create policy "epicas_select" on public.epicas for select using (auth.uid() = user_id);
create policy "epicas_insert" on public.epicas for insert with check (auth.uid() = user_id);
create policy "epicas_update" on public.epicas for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "epicas_delete" on public.epicas for delete using (auth.uid() = user_id);

-- ─── Seed: tus frentes reales (links a los dashboards que ya tienes) ───
-- Idempotente: solo inserta si la tabla está vacía.
insert into public.epicas (name, color, description, status, source_table, source_sync, epic_order, kpis, routines, tasks, links)
select * from (values
  ('Inmuebles', '#C2933A', 'Cartera de propiedades: rentas, escrituras, avalúos y trámites notariales.', 'En curso', 'inmuebles', 'hace 5 min', 0,
    '[{"v":"8","l":"Propiedades"},{"v":"3","l":"Rentas x cobrar"},{"v":"2","l":"Escrituras"}]'::jsonb,
    '[{"t":"Revisar mensajes de inquilinos","days":[true,true,false,true,true,false,false]}]'::jsonb,
    '[{"t":"Escriturar depto Roma Norte","status":"Esperando","due":"2026-07-12","note":"Notaría"},{"t":"Renovar contrato Polanco","status":"En curso","due":"2026-07-10","note":""},{"t":"Cobrar renta atrasada (2)","status":"Por hacer","due":"","note":"Cobranza"},{"t":"Avalúo terreno Querétaro","status":"Por hacer","due":"2026-07-20","note":""},{"t":"Publicar depto vacante","status":"Terminada","due":"","note":""}]'::jsonb,
    '[{"l":"Dashboard","url":"https://inmuebles-dashboard.vercel.app","primary":true,"type":"Dashboard"},{"l":"Supabase","url":"#","type":"Supabase"}]'::jsonb),
  ('Flujo', '#3E8E8E', 'Flujo de efectivo, pagos programados y proyección mensual.', 'En riesgo', 'flujo_caja', 'hace 12 min', 1,
    '[{"v":"$124k","l":"Proyectado"},{"v":"5","l":"Pagos pend."},{"v":"-$18k","l":"Faltante"}]'::jsonb,
    '[{"t":"Revisar saldo bancario","days":[true,true,true,true,false,false,false]}]'::jsonb,
    '[{"t":"Programar pago a proveedores","status":"En curso","due":"2026-07-09","note":"Vence hoy"},{"t":"Cubrir faltante -$18k","status":"Esperando","due":"2026-07-11","note":"Depende de cobros"},{"t":"Conciliar banco mayo","status":"Por hacer","due":"","note":""},{"t":"Proyección junio","status":"Terminada","due":"","note":""}]'::jsonb,
    '[{"l":"Dashboard","url":"https://dashboard-finanzas-liart.vercel.app","primary":true,"type":"Dashboard"},{"l":"Supabase","url":"#","type":"Supabase"}]'::jsonb),
  ('Inversiones', '#2E5A9E', 'Portafolio, posiciones y rebalanceo de instrumentos.', 'Al día', 'portafolio', 'hace 1 h', 2,
    '[{"v":"+11.4%","l":"YTD"},{"v":"6","l":"Posiciones"},{"v":"$2.1M","l":"Portafolio"}]'::jsonb,
    '[{"t":"Revisar mercado","days":[true,true,true,false,true,false,false]}]'::jsonb,
    '[{"t":"Rebalancear portafolio","status":"Por hacer","due":"2026-07-15","note":"Trimestral"},{"t":"Revisar posición CETES","status":"En curso","due":"2026-06-30","note":""},{"t":"Reinvertir dividendos","status":"Terminada","due":"","note":""}]'::jsonb,
    '[{"l":"Dashboard","url":"https://portafolio-dashboard-six.vercel.app","primary":true,"type":"Dashboard"},{"l":"Supabase","url":"#","type":"Supabase"}]'::jsonb),
  ('Fiscal', '#7A6FB0', 'Declaraciones, requerimientos y deducciones ante el SAT.', 'En riesgo', 'fiscal_sat', 'hace 3 h', 3,
    '[{"v":"3","l":"Declaraciones"},{"v":"2","l":"Requerimientos"},{"v":"15 jul","l":"Vence"}]'::jsonb,
    '[]'::jsonb,
    '[{"t":"Atender requerimiento SAT","status":"Esperando","due":"2026-07-15","note":"Contador"},{"t":"Declaración mensual","status":"En curso","due":"2026-07-17","note":""},{"t":"Juntar facturas deducibles","status":"Por hacer","due":"","note":""}]'::jsonb,
    '[{"l":"Dashboard","url":"#","primary":true,"type":"Dashboard"},{"l":"Drive","url":"#","type":"Drive"}]'::jsonb),
  ('Créditos', '#5B6B86', 'Créditos, tarjetas y refinanciamientos activos.', 'En curso', 'creditos', 'hace 25 min', 4,
    '[{"v":"4","l":"Créditos"},{"v":"$38k","l":"Mensual"},{"v":"1","l":"Refinanciar"}]'::jsonb,
    '[]'::jsonb,
    '[{"t":"Pago tarjeta corporativa","status":"En curso","due":"2026-07-08","note":""},{"t":"Refinanciar crédito auto","status":"Esperando","due":"","note":"Cotizando"},{"t":"Revisar tasa hipoteca","status":"Por hacer","due":"","note":""}]'::jsonb,
    '[{"l":"Dashboard","url":"#","primary":true,"type":"Dashboard"},{"l":"Excel","url":"#","type":"Excel"}]'::jsonb),
  ('Legal', '#B07A56', 'Contratos, poderes y seguimiento de asuntos legales.', 'En curso', 'legal_asuntos', 'hace 1 día', 5,
    '[{"v":"2","l":"Contratos"},{"v":"1","l":"Litigio"},{"v":"3","l":"Poderes"}]'::jsonb,
    '[]'::jsonb,
    '[{"t":"Firmar contrato arrendamiento","status":"En curso","due":"2026-07-11","note":""},{"t":"Seguimiento litigio mercantil","status":"Esperando","due":"","note":"Abogado"},{"t":"Renovar poderes notariales","status":"Por hacer","due":"","note":""}]'::jsonb,
    '[{"l":"Drive","url":"#","primary":true,"type":"Drive"}]'::jsonb),
  ('Salud & Peso', '#3E8E8E', 'Metas de peso, nutrición y hábitos, conectado a tu tracker.', 'Al día', 'peso_registros', 'hace 8 min', 6,
    '[{"v":"-4.2","l":"kg"},{"v":"12","l":"Semanas"},{"v":"3","l":"Metas"}]'::jsonb,
    '[{"t":"Registrar peso","days":[true,true,true,true,true,false,false]},{"t":"Ejercicio 30 min","days":[true,false,true,false,true,false,false]}]'::jsonb,
    '[{"t":"Plan de nutrición","status":"En curso","due":"","note":""},{"t":"Meta 12 semanas","status":"Por hacer","due":"2026-09-01","note":""}]'::jsonb,
    '[{"l":"Peso","url":"/peso","primary":true,"type":"Dashboard"},{"l":"Supabase","url":"#","type":"Supabase"}]'::jsonb),
  ('Documentos', '#5B6B86', 'Escrituras, identificaciones y respaldos digitales.', 'Al día', 'documentos', 'hace 40 min', 7,
    '[{"v":"240","l":"Documentos"},{"v":"5","l":"Por firmar"},{"v":"3","l":"Vencen"}]'::jsonb,
    '[]'::jsonb,
    '[{"t":"Firmar 5 documentos","status":"Esperando","due":"2026-07-10","note":""},{"t":"Respaldar en Drive","status":"Por hacer","due":"","note":"Mensual"},{"t":"Organizar escrituras","status":"Terminada","due":"","note":""}]'::jsonb,
    '[{"l":"Drive","url":"#","primary":true,"type":"Drive"}]'::jsonb),
  ('Proyectos', '#2E5A9E', 'Iniciativas y productos en desarrollo.', 'En curso', 'proyectos', 'hace 2 h', 8,
    '[{"v":"5","l":"Proyectos"},{"v":"2","l":"En diseño"},{"v":"1","l":"Lanzando"}]'::jsonb,
    '[{"t":"Standup diario","days":[true,true,false,true,false,false,false]}]'::jsonb,
    '[{"t":"Definir alcance MVP","status":"En curso","due":"2026-07-14","note":""},{"t":"Diseño de dashboard","status":"Esperando","due":"","note":"Diseñador"},{"t":"Preparar lanzamiento","status":"Por hacer","due":"","note":"Bloqueado"}]'::jsonb,
    '[{"l":"Dashboard","url":"#","primary":true,"type":"Dashboard"},{"l":"Supabase","url":"#","type":"Supabase"}]'::jsonb)
) as v(name, color, description, status, source_table, source_sync, epic_order, kpis, routines, tasks, links)
where not exists (select 1 from public.epicas);
