begin;

create table public.shopping_items (
  id uuid primary key,
  house_id uuid not null references public.houses (id) on delete cascade,
  product_id uuid,
  category_id uuid,
  name text not null check (char_length(trim(name)) between 1 and 200),
  normalized_name text not null check (char_length(trim(normalized_name)) between 1 and 200),
  quantity numeric(12, 3) not null check (quantity > 0),
  unit text not null check (unit in ('unidade', 'pacote', 'caixa', 'kg', 'g', 'litro', 'ml', 'garrafa', 'lata', 'dúzia')),
  category_key text not null check (category_key in ('mercearia', 'hortifruti', 'acougue', 'padaria', 'bebidas', 'laticinios', 'congelados', 'limpeza', 'higiene', 'pet', 'outros')),
  category_name text,
  preferred_brand text not null default '',
  notes text not null default '',
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  status text not null default 'pending' check (status in ('pending', 'purchased')),
  added_by_name text not null,
  created_by uuid not null references public.profiles (id) on delete restrict,
  updated_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  constraint shopping_items_deleted_after_created check (deleted_at is null or deleted_at >= created_at)
);

create index shopping_items_house_updated_idx
  on public.shopping_items (house_id, updated_at, id);
create index shopping_items_house_active_idx
  on public.shopping_items (house_id, created_at)
  where deleted_at is null;

alter table public.shopping_items enable row level security;
alter table public.shopping_items replica identity full;

create policy "shopping_items_select_active_members"
on public.shopping_items for select to authenticated
using ((select private.is_house_member(house_id)));

create policy "shopping_items_insert_active_members"
on public.shopping_items for insert to authenticated
with check (
  (select private.is_house_member(house_id))
  and created_by = (select auth.uid())
  and updated_by = (select auth.uid())
);

create policy "shopping_items_update_active_members"
on public.shopping_items for update to authenticated
using ((select private.is_house_member(house_id)))
with check (
  (select private.is_house_member(house_id))
  and updated_by = (select auth.uid())
);

create policy "shopping_items_delete_active_members"
on public.shopping_items for delete to authenticated
using ((select private.is_house_member(house_id)));

grant select, delete on public.shopping_items to authenticated;
grant insert (
  id, house_id, product_id, category_id, name, normalized_name, quantity, unit,
  category_key, category_name, preferred_brand, notes, priority, status,
  added_by_name, created_by, updated_by, created_at, updated_at, deleted_at
) on public.shopping_items to authenticated;
grant update (
  product_id, category_id, name, normalized_name, quantity, unit, category_key,
  category_name, preferred_brand, notes, priority, status, added_by_name,
  updated_by, updated_at, deleted_at
) on public.shopping_items to authenticated;

create function public.apply_shopping_item(
  item_id uuid,
  target_house_id uuid,
  target_product_id uuid,
  target_category_id uuid,
  item_name text,
  item_normalized_name text,
  item_quantity numeric,
  item_unit text,
  item_category_key text,
  item_category_name text,
  item_preferred_brand text,
  item_notes text,
  item_priority text,
  item_status text,
  item_added_by_name text,
  item_created_at timestamptz,
  item_updated_at timestamptz,
  item_deleted_at timestamptz
)
returns setof public.shopping_items
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if not private.is_house_member(target_house_id) then raise exception 'house_membership_required'; end if;

  return query
  insert into public.shopping_items (
    id, house_id, product_id, category_id, name, normalized_name, quantity, unit,
    category_key, category_name, preferred_brand, notes, priority, status,
    added_by_name, created_by, updated_by, created_at, updated_at, deleted_at
  ) values (
    item_id, target_house_id, target_product_id, target_category_id, trim(item_name),
    trim(item_normalized_name), item_quantity, item_unit, item_category_key,
    nullif(trim(item_category_name), ''), coalesce(trim(item_preferred_brand), ''),
    coalesce(trim(item_notes), ''), item_priority, item_status, trim(item_added_by_name),
    auth.uid(), auth.uid(), item_created_at, item_updated_at, item_deleted_at
  )
  on conflict (id) do update set
    product_id = excluded.product_id,
    category_id = excluded.category_id,
    name = excluded.name,
    normalized_name = excluded.normalized_name,
    quantity = excluded.quantity,
    unit = excluded.unit,
    category_key = excluded.category_key,
    category_name = excluded.category_name,
    preferred_brand = excluded.preferred_brand,
    notes = excluded.notes,
    priority = excluded.priority,
    status = excluded.status,
    added_by_name = excluded.added_by_name,
    updated_by = auth.uid(),
    updated_at = excluded.updated_at,
    deleted_at = excluded.deleted_at
  where public.shopping_items.house_id = excluded.house_id
    and (
      excluded.updated_at > public.shopping_items.updated_at
      or (
        excluded.updated_at = public.shopping_items.updated_at
        and excluded.deleted_at is not null
        and public.shopping_items.deleted_at is null
      )
    )
  returning *;

  if not found then
    return query select * from public.shopping_items where id = item_id and house_id = target_house_id;
  end if;
end;
$$;

revoke execute on function public.apply_shopping_item(
  uuid, uuid, uuid, uuid, text, text, numeric, text, text, text, text, text,
  text, text, text, timestamptz, timestamptz, timestamptz
) from public, anon;
grant execute on function public.apply_shopping_item(
  uuid, uuid, uuid, uuid, text, text, numeric, text, text, text, text, text,
  text, text, text, timestamptz, timestamptz, timestamptz
) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'shopping_items'
  ) then
    alter publication supabase_realtime add table public.shopping_items;
  end if;
end;
$$;

commit;
