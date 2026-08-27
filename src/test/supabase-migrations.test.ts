import { describe, expect, it } from 'vitest';
import foundation from '../../supabase/migrations/202608240001_foundation.sql?raw';
import onlineIdentity from '../../supabase/migrations/202608260001_online_identity.sql?raw';
import shoppingSync from '../../supabase/migrations/202608260002_shopping_list_sync.sql?raw';
import catalogSync from '../../supabase/migrations/202608260003_catalog_stores_sync.sql?raw';
import purchaseLiveSync from '../../supabase/migrations/202608260004_purchase_live_sync.sql?raw';
import budgetSync from '../../supabase/migrations/202608260005_budget_sync.sql?raw';
import profileAvatarStorage from '../../supabase/migrations/202608270006_profile_avatar_storage.sql?raw';
import houseOwnerRoleGuard from '../../supabase/migrations/202608270007_fix_house_owner_role_guard.sql?raw';
import handleNewUserHardening from '../../supabase/migrations/202608270008_harden_handle_new_user.sql?raw';
import safariProfileAvatarUpload from '../../supabase/migrations/202608270009_support_safari_profile_avatar_upload.sql?raw';

describe('migrations da fundação Supabase', () => {
  it('mantém unicidade de membership e cria convite sem persistir token aberto', () => {
    expect(foundation).toContain('primary key (house_id, user_id)');
    expect(onlineIdentity).toContain('token_hash bytea not null unique');
    expect(onlineIdentity).not.toMatch(/\btoken text not null\b/);
    expect(onlineIdentity).toContain('expires_at timestamptz not null');
    expect(onlineIdentity).toContain('used_at timestamptz');
  });

  it('cria Lista com UUID, tombstone, RLS, Realtime e aplicação idempotente', () => {
    expect(shoppingSync).toContain('create table public.shopping_items');
    expect(shoppingSync).toContain('id uuid primary key');
    expect(shoppingSync).toContain('house_id uuid not null');
    expect(shoppingSync).toContain('deleted_at timestamptz');
    expect(shoppingSync).toContain('alter table public.shopping_items enable row level security');
    expect(shoppingSync).toContain('private.is_house_member(house_id)');
    expect(shoppingSync).toContain('on conflict (id) do update');
    expect(shoppingSync).toContain('excluded.updated_at > public.shopping_items.updated_at');
    expect(shoppingSync).toContain(
      'alter publication supabase_realtime add table public.shopping_items',
    );
  });

  it('ativa RLS e restringe mutações sensíveis a RPCs autenticadas', () => {
    for (const table of ['profiles', 'houses', 'house_members']) {
      expect(foundation).toContain(`alter table public.${table} enable row level security`);
    }
    expect(onlineIdentity).toContain('alter table public.house_invites enable row level security');
    expect(onlineIdentity).toContain('security definer');
    expect(onlineIdentity).toContain("set search_path = ''");
    expect(onlineIdentity).toContain('revoke all on table public.profiles');
    expect(onlineIdentity).toContain(
      'grant execute on function public.accept_house_invite(text) to authenticated',
    );
  });

  it('cria Casa e owner membership na mesma função transacional', () => {
    const createHouseFunction = onlineIdentity.slice(
      onlineIdentity.indexOf('create function public.create_house'),
      onlineIdentity.indexOf('create function public.create_house_invite'),
    );
    expect(createHouseFunction).toContain('insert into public.houses');
    expect(createHouseFunction).toContain('insert into public.house_members');
    expect(createHouseFunction).toContain("'owner', 'active'");
  });

  it('sincroniza catálogo e mercados com defaults idempotentes, tombstones, RLS e Realtime', () => {
    for (const table of ['categories', 'products', 'stores']) {
      expect(catalogSync).toContain(`create table public.${table}`);
      expect(catalogSync).toContain(`alter table public.${table} enable row level security`);
      expect(catalogSync).toContain(
        `alter publication supabase_realtime add table public.${table}`,
      );
    }
    for (const key of [
      'mercearia',
      'hortifruti',
      'laticinios',
      'limpeza',
      'higiene',
      'bebidas',
      'padaria',
      'acougue',
      'congelados',
      'pet',
      'outros',
    ]) {
      expect(catalogSync).toContain(`('${key}',`);
    }
    expect(catalogSync).toContain(
      'select private.ensure_default_categories(id, created_by) from public.houses',
    );
    expect(catalogSync).toContain(
      'perform private.ensure_default_categories(new_house_id, auth.uid())',
    );
    expect(catalogSync).toContain('excluded.updated_at > public.products.updated_at');
    expect(catalogSync).toContain('deleted_at timestamptz');
    expect(catalogSync).toContain('products_category_same_house_fk');
    expect(catalogSync).toContain('pg_advisory_xact_lock');
    expect(catalogSync).toContain(
      'revoke all on function private.ensure_default_categories(uuid, uuid)',
    );
  });

  it('sincroniza compras compartilhadas com dono, histórico, RLS e Realtime', () => {
    for (const table of ['purchase_sessions', 'purchase_items']) {
      expect(purchaseLiveSync).toContain(`create table public.${table}`);
      expect(purchaseLiveSync).toContain(`alter table public.${table} enable row level security`);
      expect(purchaseLiveSync).toContain(
        `alter publication supabase_realtime add table public.${table}`,
      );
    }
    expect(purchaseLiveSync).toContain("status in ('active', 'completed', 'cancelled')");
    expect(purchaseLiveSync).toContain('started_by = (select auth.uid())');
    expect(purchaseLiveSync).toContain('session.started_by = auth.uid()');
    expect(purchaseLiveSync).toContain('private.is_house_member(house_id)');
    expect(purchaseLiveSync).toContain('on conflict (id) do update');
    expect(purchaseLiveSync).toContain('excluded.updated_at > public.purchase_sessions.updated_at');
    expect(purchaseLiveSync).toContain('excluded.updated_at > public.purchase_items.updated_at');
    expect(purchaseLiveSync).not.toMatch(/delete from public\.purchase_(sessions|items)/);
  });

  it('sincroniza um único orçamento mensal por Casa com RLS e Realtime', () => {
    expect(budgetSync).toContain('create table public.house_budgets');
    expect(budgetSync).toContain('unique (house_id, year, month)');
    expect(budgetSync).toContain('amount_cents bigint not null');
    expect(budgetSync).toContain('alter table public.house_budgets enable row level security');
    expect(budgetSync).toContain('private.is_house_member(house_id)');
    expect(budgetSync).toContain('on conflict (house_id, year, month) do update');
    expect(budgetSync).toContain('excluded.updated_at > public.house_budgets.updated_at');
    expect(budgetSync).toContain(
      'alter publication supabase_realtime add table public.house_budgets',
    );
    expect(budgetSync).not.toMatch(/delete from public\.house_budgets/);
  });

  it('mantém avatars privados por usuário com source, crop, revisão e Realtime', () => {
    expect(profileAvatarStorage).toContain("values ('profile-avatars', 'profile-avatars', false");
    expect(profileAvatarStorage).toContain('allowed_mime_types = excluded.allowed_mime_types');
    expect(profileAvatarStorage).toContain("lower(storage.extension(name)) = 'webp'");
    expect(profileAvatarStorage).toContain(
      '(storage.foldername(name))[1] = (select auth.uid())::text',
    );
    expect(profileAvatarStorage).toContain('private.shares_house_with');
    expect(profileAvatarStorage).toContain('avatar_source_path text');
    expect(profileAvatarStorage).toContain('avatar_crop jsonb');
    expect(profileAvatarStorage).toContain('avatar_revision bigint');
    expect(profileAvatarStorage).toContain('target_profile_id <> auth.uid()');
    expect(profileAvatarStorage).toContain(
      'revoke update (avatar_path) on public.profiles from authenticated',
    );
    expect(profileAvatarStorage).toContain(
      'alter publication supabase_realtime add table public.profiles',
    );
    expect(profileAvatarStorage).not.toMatch(/service_role|createSignedUrl|signed_url/i);
  });

  it('protege o último owner com identificador inequívoco e lock por Casa', () => {
    expect(houseOwnerRoleGuard).toContain(
      'create or replace function public.update_house_member_role',
    );
    expect(houseOwnerRoleGuard).toContain('selected_member_role public.house_role');
    expect(houseOwnerRoleGuard).not.toMatch(/declare\s+current_role\b/i);
    expect(houseOwnerRoleGuard).toMatch(
      /from public\.houses\s+where id = target_house_id\s+for update/i,
    );
    expect(houseOwnerRoleGuard).toContain("membership.status = 'active'");
    expect(houseOwnerRoleGuard).toContain("membership.role = 'owner'");
    expect(houseOwnerRoleGuard).toContain("raise exception 'last_house_owner'");
    expect(houseOwnerRoleGuard).toContain('security definer');
    expect(houseOwnerRoleGuard).toContain("set search_path = ''");
    expect(houseOwnerRoleGuard).toContain('from public, anon');
    expect(houseOwnerRoleGuard).toContain('to authenticated');
  });

  it('impede clientes de executar diretamente a trigger function de cadastro', () => {
    expect(handleNewUserHardening).toMatch(
      /revoke execute on function public\.handle_new_user\(\) from public, anon, authenticated/i,
    );
    expect(handleNewUserHardening).not.toMatch(
      /create|replace|alter|drop|insert|update|delete|truncate|grant/i,
    );
  });

  it('aceita o fallback JPEG do Safari sem tornar avatars públicos ou ampliar leitura', () => {
    expect(safariProfileAvatarUpload).toContain(
      "allowed_mime_types = array['image/webp', 'image/jpeg']",
    );
    expect(safariProfileAvatarUpload).toContain("in ('webp', 'jpg', 'jpeg')");
    expect(safariProfileAvatarUpload).toContain("bucket_id = 'profile-avatars'");
    expect(safariProfileAvatarUpload).toContain(
      '(storage.foldername(name))[1] = (select auth.uid())::text',
    );
    expect(safariProfileAvatarUpload).toContain('set public = false');
    expect(safariProfileAvatarUpload).not.toMatch(/profile_avatars_select_authorized/);
    expect(safariProfileAvatarUpload).not.toMatch(/profile_avatars_delete_self/);
    expect(safariProfileAvatarUpload).not.toMatch(
      /apply_profile_avatar|service_role|signed|public\s*=\s*true/i,
    );
  });
});
