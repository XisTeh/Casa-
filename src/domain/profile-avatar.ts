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

export const DEFAULT_AVATAR_CROP: AvatarCrop = {
  zoom: 1,
  centerX: 0.5,
  centerY: 0.5,
};
