begin;

create or replace function public.update_house_member_role(
  target_house_id uuid,
  target_user_id uuid,
  new_role public.house_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_member_role public.house_role;
begin
  if not private.is_house_owner(target_house_id) then
    raise exception 'house_owner_required';
  end if;

  -- Serializa todas as mudanças de papel da mesma Casa. Depois deste lock,
  -- a contagem de owners ativos permanece válida até o fim da transação.
  perform 1
  from public.houses
  where id = target_house_id
  for update;

  select membership.role
  into selected_member_role
  from public.house_members as membership
  where membership.house_id = target_house_id
    and membership.user_id = target_user_id
    and membership.status = 'active'
  for update;

  if not found then
    raise exception 'house_member_not_found';
  end if;

  if selected_member_role = 'owner' and new_role = 'member' and (
    select count(*)
    from public.house_members as membership
    where membership.house_id = target_house_id
      and membership.role = 'owner'
      and membership.status = 'active'
  ) <= 1 then
    raise exception 'last_house_owner';
  end if;

  update public.house_members as membership
  set role = new_role
  where membership.house_id = target_house_id
    and membership.user_id = target_user_id;
end;
$$;

revoke execute on function public.update_house_member_role(uuid, uuid, public.house_role)
from public, anon;
grant execute on function public.update_house_member_role(uuid, uuid, public.house_role)
to authenticated;

commit;
