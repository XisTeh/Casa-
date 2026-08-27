import type { ProfileAvatarData } from './profile-avatar';
import type { UserProfile } from './online-house';

export interface ProfileAvatarRepository {
  get(profileId: string): Promise<ProfileAvatarData | undefined>;
  save(profileId: string, avatar: ProfileAvatarData | null): Promise<void>;
  reconcile?(profile: UserProfile): Promise<ProfileAvatarData | undefined>;
  subscribe?(profileId: string, changed: () => void): () => void;
  hasLegacyCandidate?(profile: UserProfile): Promise<boolean>;
  syncLegacy?(profileId: string): Promise<void>;
  dismissLegacy?(profileId: string): Promise<void>;
}
