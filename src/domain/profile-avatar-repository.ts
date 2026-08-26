import type { ProfileAvatarData } from './profile-avatar';

export interface ProfileAvatarRepository {
  get(profileId: string): Promise<ProfileAvatarData | undefined>;
  save(profileId: string, avatar: ProfileAvatarData | null): Promise<void>;
}
