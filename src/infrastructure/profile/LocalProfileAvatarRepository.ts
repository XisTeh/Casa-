import type { ProfileAvatarRepository } from '../../domain/profile-avatar-repository';
import type { ProfileAvatarData } from '../../domain/profile-avatar';
import {
  CASAE_STORES,
  CasaeLocalDatabase,
  requestToPromise,
  transactionToPromise,
  type LocalProfileAvatar,
} from '../local-database/CasaeLocalDatabase';

export class LocalProfileAvatarRepository implements ProfileAvatarRepository {
  constructor(private readonly database: CasaeLocalDatabase = new CasaeLocalDatabase()) {}

  async get(profileId: string) {
    await this.database.initialize();
    const native = await this.database.getNativeDatabase();
    if (!native) {
      const record = this.database.getMemoryDatabase().profileAvatars.get(profileId);
      return record
        ? {
            avatarBlob: record.avatarBlob,
            avatarSourceBlob: record.avatarSourceBlob,
            avatarCrop: record.avatarCrop,
            avatarRevision: record.avatarRevision,
            avatarUpdatedAt: record.avatarUpdatedAt,
            avatarRemotePath: record.avatarRemotePath,
            avatarSourceRemotePath: record.avatarSourceRemotePath,
            avatarSyncState: record.avatarSyncState,
          }
        : undefined;
    }
    const transaction = native.transaction(CASAE_STORES.profileAvatars, 'readonly');
    const record = await requestToPromise(
      transaction.objectStore(CASAE_STORES.profileAvatars).get(profileId) as IDBRequest<
        LocalProfileAvatar | undefined
      >,
    );
    await transactionToPromise(transaction);
    return record
      ? {
          avatarBlob: record.avatarBlob,
          avatarSourceBlob: record.avatarSourceBlob,
          avatarCrop: record.avatarCrop,
          avatarRevision: record.avatarRevision,
          avatarUpdatedAt: record.avatarUpdatedAt,
          avatarRemotePath: record.avatarRemotePath,
          avatarSourceRemotePath: record.avatarSourceRemotePath,
          avatarSyncState: record.avatarSyncState,
        }
      : undefined;
  }

  async save(profileId: string, avatar: ProfileAvatarData | null) {
    await this.database.initialize();
    const native = await this.database.getNativeDatabase();
    if (!native) {
      if (avatar) {
        this.database.getMemoryDatabase().profileAvatars.set(profileId, {
          profileId,
          ...avatar,
          updatedAt: new Date().toISOString(),
        });
      } else {
        this.database.getMemoryDatabase().profileAvatars.delete(profileId);
      }
      return;
    }
    const transaction = native.transaction(CASAE_STORES.profileAvatars, 'readwrite');
    const store = transaction.objectStore(CASAE_STORES.profileAvatars);
    if (avatar) {
      store.put({
        profileId,
        ...avatar,
        updatedAt: new Date().toISOString(),
      } satisfies LocalProfileAvatar);
    } else {
      store.delete(profileId);
    }
    await transactionToPromise(transaction);
  }
}
