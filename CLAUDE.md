@AGENTS.md

---

# Seguridad — Supabase

## Reglas permanentes

### Row Level Security (RLS)
1. Toda tabla nueva debe tener RLS activado en la misma migración. Sin excepción.
2. Default deny: tabla con RLS activado y sin políticas no devuelve nada. Correcto. Nunca dejes RLS apagado "por mientras".
3. Toda tabla con datos del usuario necesita `user_id uuid` con default `auth.uid()` y FK a `auth.users(id)`.
4. Políticas explícitas para `select`, `insert`, `update` y `delete` atadas a `auth.uid() = user_id`.
5. Al crear una tabla nueva, genera en el mismo paso su migración RLS + políticas.

### Manejo de llaves
6. La `service_role`/`secret` key SOLO del lado servidor — en env vars de Vercel SIN prefijo `NEXT_PUBLIC_`. Nunca en cliente, nunca en un commit.
7. La `anon`/`publishable` key sí puede ir al cliente (`NEXT_PUBLIC_SUPABASE_ANON_KEY`). Solo es segura porque hay RLS encima.
8. Nunca imprimas ni logues el contenido de la `service_role`/`secret` key.
9. `.env.local` va en `.gitignore`. Verificar antes de cualquier commit con env vars.

### Cliente de Supabase
10. Dos clientes separados:
    - Navegador → `anon`/`publishable` key.
    - Servidor → puede usar `service_role` solo cuando de verdad necesites saltar RLS (tareas admin). Si no, usa el cliente con la sesión del usuario.
11. Nunca uses `service_role` "para que funcione rápido". Si falla por permisos, el problema es una política RLS faltante.

### Checklist antes de cerrar cualquier cambio de DB
- [ ] ¿RLS activado en todas las tablas tocadas?
- [ ] ¿Cada tabla tiene políticas para select/insert/update/delete?
- [ ] ¿Las políticas atan la fila a `auth.uid()`?
- [ ] ¿La `service_role`/`secret` key sigue solo del lado servidor?
- [ ] ¿`.env.local` ignorado en git?

### SQL de referencia (plantilla por tabla)
```sql
alter table public.mi_tabla
  add column if not exists user_id uuid references auth.users(id) default auth.uid();

update public.mi_tabla set user_id = 'TU-UUID-AQUI' where user_id is null;

alter table public.mi_tabla enable row level security;

create policy "select_propias" on public.mi_tabla for select using (auth.uid() = user_id);
create policy "insert_propias" on public.mi_tabla for insert with check (auth.uid() = user_id);
create policy "update_propias" on public.mi_tabla for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete_propias" on public.mi_tabla for delete using (auth.uid() = user_id);
```
