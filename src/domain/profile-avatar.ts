export type AvatarCrop = {
  zoom: number;
  centerX: number;
  centerY: number;
};

export type ProfileAvatarData = {
  avatarBlob: Blob;
  avatarSourceBlob?: Blob;
  avatarCrop?: AvatarCrop;
  avatarRevision?: number;
  avatarUpdatedAt?: string;
  avatarRemotePath?: string;
  avatarSourceRemotePath?: string;
  avatarSyncState?: 'local-only' | 'pending' | 'hydrating' | 'synced';
};

export type ProfileAvatarMutation = {
  profileId: string;
  operation: 'upsert' | 'delete';
  avatar?: ProfileAvatarData;
  revision: number;
  updatedAt: string;
  storageVersion?: string;
};

export type ProfileAvatarStoragePaths = {
  avatarPath: string | null;
  sourcePath: string | null;
};

function avatarExtension(blob: Blob) {
  switch (blob.type.toLocaleLowerCase('en-US')) {
    case 'image/webp':
      return 'webp';
    case 'image/jpeg':
      return 'jpg';
    default:
      throw new Error('O formato processado da foto não é compatível.');
  }
}

export function getProfileAvatarStoragePaths(
  mutation: ProfileAvatarMutation,
): ProfileAvatarStoragePaths {
  if (mutation.operation === 'delete') return { avatarPath: null, sourcePath: null };
  if (!mutation.avatar) throw new Error('A operação não contém a foto de perfil.');

  const storageVersion = mutation.storageVersion ?? String(mutation.revision);
  const source = mutation.avatar.avatarSourceBlob ?? mutation.avatar.avatarBlob;
  return {
    avatarPath: `${mutation.profileId}/${storageVersion}/avatar.${avatarExtension(mutation.avatar.avatarBlob)}`,
    sourcePath: `${mutation.profileId}/${storageVersion}/source.${avatarExtension(source)}`,
  };
}

export const DEFAULT_AVATAR_CROP: AvatarCrop = {
  zoom: 1,
  centerX: 0.5,
  centerY: 0.5,
};
