import type { ProfileAvatarSyncOutboxEntry } from '../../domain/profile-avatar-sync';
import {
  CASAE_STORES,
  CasaeLocalDatabase,
  requestToPromise,
  transactionToPromise,
} from '../local-database/CasaeLocalDatabase';
import { SupabaseProfileAvatarRepository } from '../supabase/SupabaseProfileAvatarRepository';
import { LocalProfileAvatarRepository } from './LocalProfileAvatarRepository';

async function avatarOutbox(database: CasaeLocalDatabase, profileId: string) {
  const id = `profile-avatar:${profileId}`;
  const native = await database.getNativeDatabase();
  const value = native
    ? await (async () => {
        const transaction = native.transaction(CASAE_STORES.syncOutbox, 'readonly');
        const result = await requestToPromise(
          transaction.objectStore(CASAE_STORES.syncOutbox).get(id),
        );
        await transactionToPromise(transaction);
        return result;
      })()
    : database.getMemoryDatabase().syncOutbox.get(id);
  return value?.entityType === 'profile-avatar'
    ? (value as ProfileAvatarSyncOutboxEntry)
    : undefined;
}

const blobSummary = (blob?: Blob) =>
  blob
    ? { present: true, size: blob.size, type: blob.type }
    : { present: false, size: 0, type: '' };

export async function exportProfileAvatarDiagnostics() {
  const database = new CasaeLocalDatabase();
  const localRepository = new LocalProfileAvatarRepository(database);
  const remoteRepository = new SupabaseProfileAvatarRepository();
  const userId = await remoteRepository.getCurrentUserId();
  if (!userId) throw new Error('Nenhum usuário autenticado foi encontrado neste navegador.');
  const [local, remote, outbox] = await Promise.all([
    localRepository.get(userId),
    remoteRepository.getProfile(userId),
    avatarOutbox(database, userId),
  ]);
  let remoteAssets:
    { avatar: ReturnType<typeof blobSummary>; source: ReturnType<typeof blobSummary> } | undefined;
  if (remote.avatarPath && remote.avatarCrop) {
    try {
      const downloaded = await remoteRepository.download(remote);
      remoteAssets = {
        avatar: blobSummary(downloaded.avatarBlob),
        source: blobSummary(downloaded.avatarSourceBlob),
      };
    } catch {
      remoteAssets = { avatar: blobSummary(), source: blobSummary() };
    }
  }

  return {
    userId,
    remote: {
      revision: remote.avatarRevision,
      updatedAt: remote.avatarUpdatedAt,
      avatarPath: remote.avatarPath,
      sourcePath: remote.avatarSourcePath,
      crop: remote.avatarCrop,
      assets: remoteAssets,
    },
    local: {
      revision: local?.avatarRevision,
      updatedAt: local?.avatarUpdatedAt,
      avatarPath: local?.avatarRemotePath,
      sourcePath: local?.avatarSourceRemotePath,
      syncState: local?.avatarSyncState,
      crop: local?.avatarCrop,
      avatar: blobSummary(local?.avatarBlob),
      source: blobSummary(local?.avatarSourceBlob),
    },
    outbox: outbox
      ? {
          operation: outbox.operation,
          revision: outbox.payload.revision,
          updatedAt: outbox.payload.updatedAt,
          attempts: outbox.attempts,
          lastError: outbox.lastError,
        }
      : null,
  };
}

export function installProfileAvatarDiagnostics() {
  Object.defineProperty(window, '__CASAE_EXPORT_PROFILE_AVATAR_SYNC__', {
    configurable: true,
    value: exportProfileAvatarDiagnostics,
  });
}

declare global {
  interface Window {
    __CASAE_EXPORT_PROFILE_AVATAR_SYNC__?: typeof exportProfileAvatarDiagnostics;
  }
}
