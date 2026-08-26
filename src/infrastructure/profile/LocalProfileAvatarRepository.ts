import type { ProfileAvatarRepository } from '../../domain/profile-avatar-repository';
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
      return this.database.getMemoryDatabase().profileAvatars.get(profileId)?.avatarBlob;
    }
    const transaction = native.transaction(CASAE_STORES.profileAvatars, 'readonly');
    const record = await requestToPromise(
      transaction.objectStore(CASAE_STORES.profileAvatars).get(profileId) as IDBRequest<
        LocalProfileAvatar | undefined
      >,
    );
    await transactionToPromise(transaction);
    return record?.avatarBlob;
  }

  async save(profileId: string, avatarBlob: Blob | null) {
    await this.database.initialize();
    const native = await this.database.getNativeDatabase();
    if (!native) {
      if (avatarBlob) {
        this.database.getMemoryDatabase().profileAvatars.set(profileId, {
          profileId,
          avatarBlob,
          updatedAt: new Date().toISOString(),
        });
      } else {
        this.database.getMemoryDatabase().profileAvatars.delete(profileId);
      }
      return;
    }
    const transaction = native.transaction(CASAE_STORES.profileAvatars, 'readwrite');
    const store = transaction.objectStore(CASAE_STORES.profileAvatars);
    if (avatarBlob) {
      store.put({
        profileId,
        avatarBlob,
        updatedAt: new Date().toISOString(),
      } satisfies LocalProfileAvatar);
    } else {
      store.delete(profileId);
    }
    await transactionToPromise(transaction);
  }
}
