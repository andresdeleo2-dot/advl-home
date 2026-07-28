-- Orden propio de la barra de favoritos (independiente del catálogo).
-- Permite arrastrar los accesos rápidos y guardar su posición sin tocar el
-- orden dentro de cada sección (item_order / section_order).
alter table items add column if not exists fav_order integer;

-- Siembra un orden inicial con el orden actual (sección, luego item) para que
-- los favoritos ya existentes no salten al arrastrar el primero.
with ord as (
  select id, row_number() over (order by section_order, item_order) * 10 as n
  from items
  where featured = true
)
update items i set fav_order = ord.n
from ord
where i.id = ord.id and i.fav_order is null;
