export interface ProfileAvatarRepository {
  get(profileId: string): Promise<Blob | undefined>;
  save(profileId: string, avatarBlob: Blob | null): Promise<void>;
}
