import type { HouseMemberRole } from '../../domain/house';
import type { OnlineHouseRepository } from '../../domain/online-house-repository';
import type { OnlineHouse, OnlineHouseMember, UserProfile } from '../../domain/online-house';
import { getSupabaseClient } from '../../lib/supabase/client';

function fail(error: { message: string; code?: string } | null) {
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
}

export class SupabaseHouseRepository implements OnlineHouseRepository {
  private readonly client = getSupabaseClient();

  async getProfile(userId: string) {
    const { data, error } = await this.client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    fail(error);
    if (!data) throw new Error('Perfil não encontrado.');
    return this.mapProfile(data);
  }

  async updateProfile(userId: string, displayName: string) {
    const { data, error } = await this.client
      .from('profiles')
      .update({ display_name: displayName })
      .eq('id', userId)
      .select('*')
      .single();
    fail(error);
    if (!data) throw new Error('Perfil não encontrado.');
    return this.mapProfile(data);
  }

  async listHouses(userId: string) {
    const memberships = await this.client
      .from('house_members')
      .select('house_id')
      .eq('user_id', userId)
      .eq('status', 'active');
    fail(memberships.error);
    const ids = (memberships.data ?? []).map((membership) => membership.house_id);
    if (!ids.length) return [];
    const { data, error } = await this.client.from('houses').select('*').in('id', ids);
    fail(error);
    return (data ?? [])
      .map((house) => this.mapHouse(house))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }

  async listMembers(houseId: string) {
    const memberships = await this.client
      .from('house_members')
      .select('*')
      .eq('house_id', houseId)
      .eq('status', 'active');
    fail(memberships.error);
    const membershipRows = memberships.data ?? [];
    const userIds = membershipRows.map((membership) => membership.user_id);
    if (!userIds.length) return [];
    const profiles = await this.client.from('profiles').select('*').in('id', userIds);
    fail(profiles.error);
    const byId = new Map(
      (profiles.data ?? []).map((profile) => [profile.id, this.mapProfile(profile)]),
    );
    return membershipRows
      .map((membership) => {
        const profile = byId.get(membership.user_id);
        if (!profile) return null;
        return {
          id: membership.id,
          houseId: membership.house_id,
          userId: membership.user_id,
          role: membership.role,
          status: membership.status,
          joinedAt: membership.joined_at,
          profile,
        } satisfies OnlineHouseMember;
      })
      .filter((member): member is OnlineHouseMember => Boolean(member));
  }

  async createHouse(name: string) {
    const { data, error } = await this.client.rpc('create_house', { house_name: name });
    fail(error);
    if (!data) throw new Error('A Casa não foi criada.');
    return data;
  }

  async updateHouse(houseId: string, name: string) {
    const { error } = await this.client.from('houses').update({ name }).eq('id', houseId);
    fail(error);
  }

  async createInvite(houseId: string) {
    const { data, error } = await this.client
      .rpc('create_house_invite', { target_house_id: houseId })
      .single();
    fail(error);
    if (!data) throw new Error('O convite não foi criado.');
    return { token: data.token, expiresAt: data.expires_at };
  }

  async acceptInvite(token: string) {
    const { data, error } = await this.client.rpc('accept_house_invite', { invite_token: token });
    fail(error);
    if (!data) throw new Error('O convite não foi aceito.');
    return data;
  }

  async updateMemberRole(houseId: string, userId: string, role: HouseMemberRole) {
    const { error } = await this.client.rpc('update_house_member_role', {
      target_house_id: houseId,
      target_user_id: userId,
      new_role: role,
    });
    fail(error);
  }

  async removeMember(houseId: string, userId: string) {
    const { error } = await this.client.rpc('remove_house_member', {
      target_house_id: houseId,
      target_user_id: userId,
    });
    fail(error);
  }

  private mapProfile(row: {
    id: string;
    display_name: string;
    avatar_path: string | null;
    avatar_source_path: string | null;
    avatar_crop: unknown;
    avatar_revision: number;
    avatar_updated_at: string | null;
    created_at: string;
    updated_at: string;
  }): UserProfile {
    return {
      id: row.id,
      displayName: row.display_name,
      avatarPath: row.avatar_path,
      avatarSourcePath: row.avatar_source_path,
      avatarCrop: this.mapAvatarCrop(row.avatar_crop),
      avatarRevision: row.avatar_revision,
      avatarUpdatedAt: row.avatar_updated_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapAvatarCrop(value: unknown) {
    if (!value || typeof value !== 'object') return null;
    const crop = value as Record<string, unknown>;
    return typeof crop.zoom === 'number' &&
      typeof crop.centerX === 'number' &&
      typeof crop.centerY === 'number'
      ? { zoom: crop.zoom, centerX: crop.centerX, centerY: crop.centerY }
      : null;
  }

  private mapHouse(row: {
    id: string;
    name: string;
    created_by: string;
    created_at: string;
    updated_at: string;
  }): OnlineHouse {
    return {
      id: row.id,
      name: row.name,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
