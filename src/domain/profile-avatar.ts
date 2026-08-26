export type AvatarCrop = {
  zoom: number;
  centerX: number;
  centerY: number;
};

export type ProfileAvatarData = {
  avatarBlob: Blob;
  avatarSourceBlob?: Blob;
  avatarCrop?: AvatarCrop;
};

export const DEFAULT_AVATAR_CROP: AvatarCrop = {
  zoom: 1,
  centerX: 0.5,
  centerY: 0.5,
};
