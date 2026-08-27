begin;

create table public.house_budgets (
  id uuid primary key,
  house_id uuid not null references public.houses (id) on delete cascade,
  year integer not null check (year between 2000 and 9999),
  month integer not null check (month between 1 and 12),
  amount_cents bigint not null check (amount_cents > 0),
  created_by uuid not null references public.profiles (id) on delete restrict,
  updated_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint house_budgets_house_year_month_unique unique (house_id, year, month),
  constraint house_budgets_updated_after_created check (updated_at >= created_at)
);

create index house_budgets_house_updated_idx
  on public.house_budgets (house_id, updated_at, id);

alter table public.house_budgets enable row level security;
alter table public.house_budgets replica identity full;

create policy "house_budgets_select_house_members"
on public.house_budgets for select to authenticated
using ((select private.is_house_member(house_id)));

create policy "house_budgets_insert_house_members"
on public.house_budgets for insert to authenticated
with check (
  (select private.is_house_member(house_id))
  and created_by = (select auth.uid())
  and updated_by = (select auth.uid())
);

create policy "house_budgets_update_house_members"
on public.house_budgets for update to authenticated
using ((select private.is_house_member(house_id)))
with check (
  (select private.is_house_member(house_id))
  and updated_by = (select auth.uid())
);

grant select, insert, update on public.house_budgets to authenticated;

create function public.apply_house_budget(
  item_id uuid,
  target_house_id uuid,
  item_year integer,
  item_month integer,
  item_amount_cents bigint,
  item_created_at timestamptz,
  item_updated_at timestamptz
) returns setof public.house_budgets language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if not private.is_house_member(target_house_id) then raise exception 'house_membership_required'; end if;

  return query insert into public.house_budgets (
    id, house_id, year, month, amount_cents, created_by, updated_by, created_at, updated_at
  ) values (
    item_id, target_house_id, item_year, item_month, item_amount_cents,
    auth.uid(), auth.uid(), item_created_at, item_updated_at
  ) on conflict (house_id, year, month) do update set
    amount_cents = excluded.amount_cents,
    updated_by = auth.uid(),
    updated_at = excluded.updated_at
  where excluded.updated_at > public.house_budgets.updated_at
  returning *;

  if not found then
    return query select * from public.house_budgets
      where house_id = target_house_id and year = item_year and month = item_month;
  end if;
end; $$;

revoke execute on function public.apply_house_budget(uuid,uuid,integer,integer,bigint,timestamptz,timestamptz) from public, anon;
grant execute on function public.apply_house_budget(uuid,uuid,integer,integer,bigint,timestamptz,timestamptz) to authenticated;

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'house_budgets'
  ) then
    alter publication supabase_realtime add table public.house_budgets;
  end if;
end $$;

commit;
