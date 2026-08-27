import type { RealtimeChannel } from '@supabase/supabase-js';
import type { UserProfile } from '../../domain/online-house';
import {
  getProfileAvatarStoragePaths,
  type AvatarCrop,
  type ProfileAvatarMutation,
} from '../../domain/profile-avatar';
import { getSupabaseClient } from '../../lib/supabase/client';
import type { Database, Json } from '../../lib/supabase/database.types';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];

export interface RemoteProfileAvatarStore {
  getCurrentUserId(): Promise<string | undefined>;
  getProfile(profileId: string): Promise<UserProfile>;
  apply(mutation: ProfileAvatarMutation): Promise<UserProfile>;
  download(profile: UserProfile): Promise<{
    avatarBlob: Blob;
    avatarSourceBlob?: Blob;
    avatarCrop: AvatarCrop;
  }>;
  subscribe(profileId: string, receive: (profile: UserProfile) => void): () => void;
}

function mapCrop(value: Json | null): AvatarCrop | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const crop = value as Record<string, Json | undefined>;
  return typeof crop.zoom === 'number' &&
    typeof crop.centerX === 'number' &&
    typeof crop.centerY === 'number'
    ? { zoom: crop.zoom, centerX: crop.centerX, centerY: crop.centerY }
    : null;
}

export function mapProfileAvatarRow(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    displayName: row.display_name,
    avatarPath: row.avatar_path,
    avatarSourcePath: row.avatar_source_path,
    avatarCrop: mapCrop(row.avatar_crop),
    avatarRevision: row.avatar_revision,
    avatarUpdatedAt: row.avatar_updated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const channelId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

const sameInstant = (left: string | null, right: string) =>
  left !== null && Date.parse(left) === Date.parse(right);

export class SupabaseProfileAvatarRepository implements RemoteProfileAvatarStore {
  private readonly bucket = 'profile-avatars';

  private get client() {
    return getSupabaseClient();
  }

  async getCurrentUserId() {
    const { data } = await this.client.auth.getSession();
    return data.session?.user.id;
  }

  async getProfile(profileId: string) {
    const { data, error } = await this.client
      .from('profiles')
      .select('*')
      .eq('id', profileId)
      .single();
    if (error) throw error;
    return mapProfileAvatarRow(data);
  }

  async apply(mutation: ProfileAvatarMutation) {
    const previous = await this.getProfile(mutation.profileId);
    const paths = getProfileAvatarStoragePaths(mutation);

    if (mutation.operation === 'upsert') {
      const avatar = mutation.avatar;
      if (!avatar) throw new Error('A operação não contém a foto de perfil.');
      const source = avatar.avatarSourceBlob ?? avatar.avatarBlob;
      await Promise.all([
        this.upload(paths.avatarPath!, avatar.avatarBlob),
        this.upload(paths.sourcePath!, source),
      ]);
    }

    const { data, error } = await this.client.rpc('apply_profile_avatar', {
      target_profile_id: mutation.profileId,
      item_avatar_path: paths.avatarPath,
      item_avatar_source_path: paths.sourcePath,
      item_avatar_crop:
        mutation.operation === 'upsert'
          ? ((mutation.avatar?.avatarCrop ?? {
              zoom: 1,
              centerX: 0.5,
              centerY: 0.5,
            }) as unknown as Json)
          : null,
      item_avatar_revision: mutation.revision,
      item_avatar_updated_at: mutation.updatedAt,
    });
    if (error) throw error;
    const authoritative = data?.[0];
    if (!authoritative) throw new Error('O servidor não confirmou a foto de perfil.');
    const profile = mapProfileAvatarRow(authoritative);
    const accepted =
      profile.avatarRevision === mutation.revision &&
      sameInstant(profile.avatarUpdatedAt, mutation.updatedAt) &&
      profile.avatarPath === paths.avatarPath &&
      profile.avatarSourcePath === paths.sourcePath;

    if (!accepted && paths.avatarPath && paths.sourcePath) {
      await this.remove([paths.avatarPath, paths.sourcePath]);
    } else if (accepted) {
      await this.remove(
        [previous.avatarPath, previous.avatarSourcePath].filter((path): path is string =>
          Boolean(path && path !== paths.avatarPath && path !== paths.sourcePath),
        ),
      );
    }
    return profile;
  }

  async download(profile: UserProfile) {
    if (!profile.avatarPath || !profile.avatarCrop) {
      throw new Error('O perfil não possui uma foto sincronizada válida.');
    }
    const [avatar, source] = await Promise.all([
      this.client.storage.from(this.bucket).download(profile.avatarPath),
      profile.avatarSourcePath
        ? this.client.storage.from(this.bucket).download(profile.avatarSourcePath)
        : Promise.resolve({ data: null, error: new Error('Source remoto ausente.') }),
    ]);
    if (avatar.error) throw avatar.error;
    return {
      avatarBlob: avatar.data,
      avatarSourceBlob: source.error ? undefined : source.data,
      avatarCrop: profile.avatarCrop,
    };
  }

  subscribe(profileId: string, receive: (profile: UserProfile) => void) {
    const channel: RealtimeChannel = this.client
      .channel(`profile-avatar:${profileId}:${channelId()}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${profileId}`,
        },
        (payload) => receive(mapProfileAvatarRow(payload.new as ProfileRow)),
      )
      .subscribe();
    return () => void this.client.removeChannel(channel);
  }

  private async upload(path: string, blob: Blob) {
    const { error } = await this.client.storage.from(this.bucket).upload(path, blob, {
      cacheControl: '31536000',
      contentType: blob.type,
      upsert: true,
    });
    if (error) throw error;
  }

  private async remove(paths: string[]) {
    if (!paths.length) return;
    const { error } = await this.client.storage.from(this.bucket).remove(paths);
    if (error) {
      // A metadata já aponta para a revisão correta; limpeza é retomável e não pode apagar o cache.
      console.warn('Não foi possível remover uma revisão antiga da foto de perfil.');
    }
  }
}
