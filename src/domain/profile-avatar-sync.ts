import type { ProfileAvatarMutation } from './profile-avatar';

export type ProfileAvatarSyncOutboxEntry = {
  id: string;
  entityType: 'profile-avatar';
  entityId: string;
  houseId: string;
  actorId: string;
  operation: ProfileAvatarMutation['operation'];
  payload: ProfileAvatarMutation;
  version: string;
  createdAt: string;
  attempts: number;
  lastAttemptAt?: string;
  lastError?: string;
  nextAttemptAt?: string;
};
