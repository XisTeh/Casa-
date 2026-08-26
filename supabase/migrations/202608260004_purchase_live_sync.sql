begin;

create table public.purchase_sessions (
  id uuid primary key,
  house_id uuid not null references public.houses (id) on delete cascade,
  started_by uuid not null references public.profiles (id) on delete restrict,
  started_by_name text not null check (char_length(trim(started_by_name)) between 1 and 160),
  store_id uuid references public.stores (id) on delete set null,
  store_name_snapshot text not null check (char_length(trim(store_name_snapshot)) between 1 and 160),
  entry_mode text not null check (entry_mode in ('list', 'quick')),
  status text not null check (status in ('active', 'completed', 'cancelled')),
  started_at timestamptz not null,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  constraint purchase_sessions_house_id_id_unique unique (house_id, id),
  constraint purchase_sessions_terminal_state_valid check (
    (status = 'active' and completed_at is null and cancelled_at is null)
    or (status = 'completed' and completed_at is not null and cancelled_at is null)
    or (status = 'cancelled' and cancelled_at is not null and completed_at is null)
  ),
  constraint purchase_sessions_deleted_after_created check (deleted_at is null or deleted_at >= created_at),
  constraint purchase_sessions_updated_after_created check (updated_at >= created_at)
);

create index purchase_sessions_house_active_idx
  on public.purchase_sessions (house_id, started_at desc, id) where status = 'active' and deleted_at is null;
create index purchase_sessions_house_updated_idx
  on public.purchase_sessions (house_id, updated_at, id);

create table public.purchase_items (
  id uuid primary key,
  purchase_session_id uuid not null references public.purchase_sessions (id) on delete cascade,
  house_id uuid not null references public.houses (id) on delete cascade,
  origin text not null check (origin in ('shopping-list', 'manual')),
  source_shopping_item_id uuid,
  product_id uuid references public.products (id) on delete set null,
  product_name_snapshot text not null check (char_length(trim(product_name_snapshot)) between 1 and 200),
  brand_snapshot text not null default '',
  category_key_snapshot text not null check (category_key_snapshot in ('mercearia', 'hortifruti', 'acougue', 'padaria', 'bebidas', 'laticinios', 'congelados', 'limpeza', 'higiene', 'pet', 'outros')),
  category_name_snapshot text,
  priority_snapshot text not null check (priority_snapshot in ('low', 'normal', 'high')),
  notes_snapshot text not null default '',
  planned_quantity numeric(12, 3) not null check (planned_quantity > 0),
  purchased_quantity numeric(12, 3) not null check (purchased_quantity > 0),
  unit_snapshot text not null check (unit_snapshot in ('unidade', 'pacote', 'caixa', 'kg', 'g', 'litro', 'ml', 'garrafa', 'lata', 'dúzia')),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  total_price_cents bigint not null check (total_price_cents >= 0),
  store_id uuid references public.stores (id) on delete set null,
  store_name_snapshot text not null,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_by_name_snapshot text not null,
  purchased_at timestamptz not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  constraint purchase_items_session_same_house_fk
    foreign key (house_id, purchase_session_id)
    references public.purchase_sessions (house_id, id) on delete cascade,
  constraint purchase_items_deleted_after_created check (deleted_at is null or deleted_at >= created_at),
  constraint purchase_items_updated_after_created check (updated_at >= created_at)
);

create index purchase_items_session_updated_idx on public.purchase_items (purchase_session_id, updated_at, id);
create index purchase_items_house_updated_idx on public.purchase_items (house_id, updated_at, id);

alter table public.purchase_sessions enable row level security;
alter table public.purchase_items enable row level security;
alter table public.purchase_sessions replica identity full;
alter table public.purchase_items replica identity full;

create policy "purchase_sessions_select_house_members"
on public.purchase_sessions for select to authenticated
using ((select private.is_house_member(house_id)));

create policy "purchase_sessions_insert_owner"
on public.purchase_sessions for insert to authenticated
with check ((select private.is_house_member(house_id)) and started_by = (select auth.uid()));

create policy "purchase_sessions_update_owner"
on public.purchase_sessions for update to authenticated
using (started_by = (select auth.uid()) and (select private.is_house_member(house_id)))
with check (started_by = (select auth.uid()) and (select private.is_house_member(house_id)));

create policy "purchase_items_select_house_members"
on public.purchase_items for select to authenticated
using ((select private.is_house_member(house_id)));

create policy "purchase_items_insert_session_owner"
on public.purchase_items for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (select private.is_house_member(house_id))
  and exists (
    select 1 from public.purchase_sessions session
    where session.id = purchase_session_id
      and session.house_id = house_id
      and session.started_by = (select auth.uid())
      and session.status = 'active'
  )
);

create policy "purchase_items_update_session_owner"
on public.purchase_items for update to authenticated
using (
  (select private.is_house_member(house_id))
  and exists (
    select 1 from public.purchase_sessions session
    where session.id = purchase_session_id and session.started_by = (select auth.uid())
  )
)
with check (
  created_by = (select auth.uid())
  and (select private.is_house_member(house_id))
  and exists (
    select 1 from public.purchase_sessions session
    where session.id = purchase_session_id
      and session.house_id = house_id
      and session.started_by = (select auth.uid())
      and session.status = 'active'
  )
);

grant select, insert, update on public.purchase_sessions, public.purchase_items to authenticated;

create function public.apply_purchase_session(
  item_id uuid, target_house_id uuid, item_started_by_name text, item_store_id uuid,
  item_store_name text, item_entry_mode text, item_status text, item_started_at timestamptz,
  item_completed_at timestamptz, item_cancelled_at timestamptz, item_created_at timestamptz,
  item_updated_at timestamptz, item_deleted_at timestamptz
) returns setof public.purchase_sessions language plpgsql set search_path = '' as $$
declare current_owner uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if not private.is_house_member(target_house_id) then raise exception 'house_membership_required'; end if;
  select started_by into current_owner from public.purchase_sessions where id = item_id;
  if current_owner is not null and current_owner <> auth.uid() then raise exception 'purchase_owner_required'; end if;

  return query insert into public.purchase_sessions (
    id, house_id, started_by, started_by_name, store_id, store_name_snapshot, entry_mode,
    status, started_at, completed_at, cancelled_at, created_at, updated_at, deleted_at
  ) values (
    item_id, target_house_id, auth.uid(), trim(item_started_by_name), item_store_id,
    trim(item_store_name), item_entry_mode, item_status, item_started_at, item_completed_at,
    item_cancelled_at, item_created_at, item_updated_at, item_deleted_at
  ) on conflict (id) do update set
    started_by_name = excluded.started_by_name, store_id = excluded.store_id,
    store_name_snapshot = excluded.store_name_snapshot, entry_mode = excluded.entry_mode,
    status = excluded.status, completed_at = excluded.completed_at,
    cancelled_at = excluded.cancelled_at, updated_at = excluded.updated_at,
    deleted_at = excluded.deleted_at
  where public.purchase_sessions.house_id = excluded.house_id
    and public.purchase_sessions.started_by = auth.uid()
    and (
      excluded.updated_at > public.purchase_sessions.updated_at
      or (excluded.updated_at = public.purchase_sessions.updated_at
        and excluded.deleted_at is not null and public.purchase_sessions.deleted_at is null)
    )
  returning *;
  if not found then
    return query select * from public.purchase_sessions
      where id = item_id and house_id = target_house_id;
  end if;
end; $$;

create function public.apply_purchase_item(
  item_id uuid, target_session_id uuid, target_house_id uuid, item_origin text,
  item_source_shopping_id uuid, item_product_id uuid, item_product_name text,
  item_brand text, item_category_key text, item_category_name text, item_priority text,
  item_notes text, item_planned_quantity numeric, item_purchased_quantity numeric,
  item_unit text, item_unit_price_cents bigint, item_total_price_cents bigint,
  item_store_id uuid, item_store_name text, item_created_by_name text,
  item_purchased_at timestamptz, item_created_at timestamptz, item_updated_at timestamptz,
  item_deleted_at timestamptz
) returns setof public.purchase_items language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if not private.is_house_member(target_house_id) then raise exception 'house_membership_required'; end if;
  if not exists (
    select 1 from public.purchase_sessions session
    where session.id = target_session_id and session.house_id = target_house_id
      and session.started_by = auth.uid() and session.status = 'active'
  ) then raise exception 'active_purchase_owner_required'; end if;

  return query insert into public.purchase_items (
    id, purchase_session_id, house_id, origin, source_shopping_item_id, product_id,
    product_name_snapshot, brand_snapshot, category_key_snapshot, category_name_snapshot,
    priority_snapshot, notes_snapshot, planned_quantity, purchased_quantity, unit_snapshot,
    unit_price_cents, total_price_cents, store_id, store_name_snapshot, created_by,
    created_by_name_snapshot, purchased_at, created_at, updated_at, deleted_at
  ) values (
    item_id, target_session_id, target_house_id, item_origin, item_source_shopping_id,
    item_product_id, trim(item_product_name), coalesce(trim(item_brand), ''), item_category_key,
    nullif(trim(item_category_name), ''), item_priority, coalesce(trim(item_notes), ''),
    item_planned_quantity, item_purchased_quantity, item_unit, item_unit_price_cents,
    item_total_price_cents, item_store_id, trim(item_store_name), auth.uid(),
    trim(item_created_by_name), item_purchased_at, item_created_at, item_updated_at, item_deleted_at
  ) on conflict (id) do update set
    product_id = excluded.product_id, product_name_snapshot = excluded.product_name_snapshot,
    brand_snapshot = excluded.brand_snapshot, category_key_snapshot = excluded.category_key_snapshot,
    category_name_snapshot = excluded.category_name_snapshot, priority_snapshot = excluded.priority_snapshot,
    notes_snapshot = excluded.notes_snapshot, planned_quantity = excluded.planned_quantity,
    purchased_quantity = excluded.purchased_quantity, unit_snapshot = excluded.unit_snapshot,
    unit_price_cents = excluded.unit_price_cents, total_price_cents = excluded.total_price_cents,
    updated_at = excluded.updated_at, deleted_at = excluded.deleted_at
  where public.purchase_items.house_id = excluded.house_id
    and public.purchase_items.purchase_session_id = excluded.purchase_session_id
    and (
      excluded.updated_at > public.purchase_items.updated_at
      or (excluded.updated_at = public.purchase_items.updated_at
        and excluded.deleted_at is not null and public.purchase_items.deleted_at is null)
    )
  returning *;
  if not found then
    return query select * from public.purchase_items
      where id = item_id and house_id = target_house_id;
  end if;
end; $$;

revoke execute on function public.apply_purchase_session(uuid,uuid,text,uuid,text,text,text,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz) from public, anon;
revoke execute on function public.apply_purchase_item(uuid,uuid,uuid,text,uuid,uuid,text,text,text,text,text,text,numeric,numeric,text,bigint,bigint,uuid,text,text,timestamptz,timestamptz,timestamptz,timestamptz) from public, anon;
grant execute on function public.apply_purchase_session(uuid,uuid,text,uuid,text,text,text,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz) to authenticated;
grant execute on function public.apply_purchase_item(uuid,uuid,uuid,text,uuid,uuid,text,text,text,text,text,text,numeric,numeric,text,bigint,bigint,uuid,text,text,timestamptz,timestamptz,timestamptz,timestamptz) to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='purchase_sessions') then
    alter publication supabase_realtime add table public.purchase_sessions;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='purchase_items') then
    alter publication supabase_realtime add table public.purchase_items;
  end if;
end $$;

commit;
