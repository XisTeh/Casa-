import type { UserProfile } from '../../domain/online-house';
import type { ProfileAvatarRepository } from '../../domain/profile-avatar-repository';
import type { ProfileAvatarData, ProfileAvatarMutation } from '../../domain/profile-avatar';
import type { ProfileAvatarSyncOutboxEntry } from '../../domain/profile-avatar-sync';
import type { ShoppingSyncRuntime } from '../shopping/OfflineFirstShoppingRepository';
import type { RemoteProfileAvatarStore } from '../supabase/SupabaseProfileAvatarRepository';
import {
  CASAE_STORES,
  CasaeLocalDatabase,
  requestToPromise,
  transactionToPromise,
} from '../local-database/CasaeLocalDatabase';
import { LocalProfileAvatarRepository } from './LocalProfileAvatarRepository';

const defaultRuntime: ShoppingSyncRuntime = {
  isOnline: () => typeof navigator === 'undefined' || navigator.onLine,
  now: () => new Date(),
  addOnlineListener(listener) {
    if (typeof window === 'undefined') return () => undefined;
    window.addEventListener('online', listener);
    return () => window.removeEventListener('online', listener);
  },
  addVisibleListener(listener) {
    if (typeof document === 'undefined') return () => undefined;
    const handler = () => document.visibilityState === 'visible' && listener();
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  },
  schedule: (listener, delay) => setTimeout(listener, delay),
  cancel: (timer) => clearTimeout(timer),
};

const outboxId = (profileId: string) => `profile-avatar:${profileId}`;

export class OfflineFirstProfileAvatarRepository implements ProfileAvatarRepository {
  private readonly local: LocalProfileAvatarRepository;
  private readonly listeners = new Map<string, Set<() => void>>();
  private readonly disconnectByProfile = new Map<string, () => void>();
  private readonly running = new Map<string, Promise<void>>();
  private readonly dirty = new Set<string>();
  private readonly hydrationRetryTimers = new Map<
    string,
    ReturnType<ShoppingSyncRuntime['schedule']>
  >();
  private readonly hydrationAttempts = new Map<string, number>();

  constructor(
    private readonly database: CasaeLocalDatabase,
    private readonly remote: RemoteProfileAvatarStore,
    private readonly runtime: ShoppingSyncRuntime = defaultRuntime,
  ) {
    this.local = new LocalProfileAvatarRepository(database);
  }

  get(profileId: string) {
    return this.local.get(profileId);
  }

  async save(profileId: string, avatar: ProfileAvatarData | null) {
    if ((await this.remote.getCurrentUserId()) !== profileId) {
      throw new Error('Somente o próprio usuário pode alterar esta foto de perfil.');
    }
    const current = await this.local.get(profileId);
    const now = this.runtime.now();
    const currentUpdatedAt = Date.parse(current?.avatarUpdatedAt ?? '');
    const updatedAtTime = Math.max(
      now.getTime(),
      Number.isFinite(currentUpdatedAt) ? currentUpdatedAt + 1 : 0,
    );
    const updatedAt = new Date(updatedAtTime).toISOString();
    const revision = updatedAtTime * 1000 + this.revisionEntropy();
    const mutation: ProfileAvatarMutation = {
      profileId,
      operation: avatar ? 'upsert' : 'delete',
      avatar: avatar
        ? {
            avatarBlob: avatar.avatarBlob,
            avatarSourceBlob: avatar.avatarSourceBlob ?? avatar.avatarBlob,
            avatarCrop: avatar.avatarCrop ?? { zoom: 1, centerX: 0.5, centerY: 0.5 },
          }
        : undefined,
      revision,
      updatedAt,
      storageVersion: `${revision}-${this.uniqueId()}`,
    };
    if (mutation.avatar) {
      await this.local.save(profileId, {
        ...mutation.avatar,
        avatarRevision: revision,
        avatarUpdatedAt: updatedAt,
        avatarSyncState: 'pending',
      });
    } else {
      await this.local.save(profileId, null);
    }
    await this.enqueue(mutation);
    this.changed(profileId);
    await this.syncNow(profileId);
  }

  async reconcile(profile: UserProfile) {
    const pending = await this.getOutbox(profile.id);
    if (pending?.actorId === profile.id) {
      return pending.operation === 'delete' ? undefined : this.local.get(profile.id);
    }
    const local = await this.local.get(profile.id);
    if (
      local?.avatarUpdatedAt &&
      profile.avatarUpdatedAt &&
      local.avatarUpdatedAt > profile.avatarUpdatedAt &&
      (local.avatarSyncState === 'synced' || local.avatarSyncState === 'hydrating')
    ) {
      return local;
    }
    if (
      profile.avatarRevision > 0 &&
      profile.avatarPath &&
      profile.avatarCrop &&
      profile.avatarUpdatedAt
    ) {
      const cacheMatchesRemote =
        local?.avatarRevision === profile.avatarRevision &&
        local.avatarUpdatedAt === profile.avatarUpdatedAt &&
        local.avatarRemotePath === profile.avatarPath &&
        local.avatarSourceRemotePath === profile.avatarSourcePath;
      if (
        cacheMatchesRemote &&
        local.avatarSyncState === 'synced' &&
        local.avatarBlob &&
        local.avatarSourceBlob &&
        local.avatarCrop
      ) {
        this.cancelHydrationRetry(profile.id);
        return local;
      }
      try {
        const downloaded = await this.remote.download(profile);
        const synced: ProfileAvatarData = {
          ...downloaded,
          avatarRevision: profile.avatarRevision,
          avatarUpdatedAt: profile.avatarUpdatedAt,
          avatarRemotePath: profile.avatarPath,
          avatarSourceRemotePath: profile.avatarSourcePath ?? undefined,
          avatarSyncState: downloaded.avatarSourceBlob ? 'synced' : 'hydrating',
        };
        await this.local.save(profile.id, synced);
        if (downloaded.avatarSourceBlob) this.cancelHydrationRetry(profile.id);
        else this.scheduleHydrationRetry(profile.id);
        return synced;
      } catch {
        this.scheduleHydrationRetry(profile.id);
        return local;
      }
    }
    if (local?.avatarSyncState === 'synced' || local?.avatarSyncState === 'hydrating') {
      this.cancelHydrationRetry(profile.id);
      await this.local.save(profile.id, null);
      return undefined;
    }
    return local;
  }

  subscribe(profileId: string, changed: () => void) {
    const listeners = this.listeners.get(profileId) ?? new Set();
    listeners.add(changed);
    this.listeners.set(profileId, listeners);
    if (!this.disconnectByProfile.has(profileId)) {
      const trigger = () => void this.syncNow(profileId);
      const removeOnline = this.runtime.addOnlineListener(trigger);
      const removeVisible = this.runtime.addVisibleListener(trigger);
      const removeRealtime = this.remote.subscribe(profileId, trigger);
      this.disconnectByProfile.set(profileId, () => {
        removeOnline();
        removeVisible();
        removeRealtime();
        this.cancelHydrationRetry(profileId);
      });
      trigger();
    }
    return () => {
      listeners.delete(changed);
      if (!listeners.size) {
        this.listeners.delete(profileId);
        this.disconnectByProfile.get(profileId)?.();
        this.disconnectByProfile.delete(profileId);
      }
    };
  }

  syncNow(profileId: string) {
    const current = this.running.get(profileId);
    if (current) {
      this.dirty.add(profileId);
      return current;
    }
    const task = (async () => {
      do {
        this.dirty.delete(profileId);
        await this.performSync(profileId);
      } while (this.dirty.delete(profileId));
    })().finally(() => this.running.delete(profileId));
    this.running.set(profileId, task);
    return task;
  }

  private async performSync(profileId: string) {
    if (!this.runtime.isOnline()) return;
    try {
      const entry = await this.getOutbox(profileId);
      if (entry) {
        if ((await this.remote.getCurrentUserId()) !== profileId) return;
        if (entry.nextAttemptAt && entry.nextAttemptAt > this.runtime.now().toISOString()) return;
        try {
          const authoritative = await this.remote.apply(entry.payload);
          await this.removeOutboxIfVersion(entry.id, entry.version);
          const storageVersion = entry.payload.storageVersion ?? String(entry.payload.revision);
          if (
            entry.operation === 'upsert' &&
            authoritative.avatarRevision === entry.payload.revision &&
            authoritative.avatarUpdatedAt &&
            authoritative.avatarPath === `${profileId}/${storageVersion}/avatar.webp` &&
            authoritative.avatarSourcePath === `${profileId}/${storageVersion}/source.webp`
          ) {
            await this.local.save(profileId, {
              ...entry.payload.avatar!,
              avatarRevision: authoritative.avatarRevision,
              avatarUpdatedAt: authoritative.avatarUpdatedAt,
              avatarRemotePath: authoritative.avatarPath ?? undefined,
              avatarSourceRemotePath: authoritative.avatarSourcePath ?? undefined,
              avatarSyncState: 'synced',
            });
          } else {
            await this.reconcile(authoritative);
          }
        } catch (error) {
          await this.recordFailure(entry, error);
          return;
        }
      } else {
        await this.reconcile(await this.remote.getProfile(profileId));
      }
      this.changed(profileId);
    } catch {
      // O Blob local permanece sendo a fonte visual; online/visibility tentam novamente.
    }
  }

  private async enqueue(payload: ProfileAvatarMutation) {
    const entry: ProfileAvatarSyncOutboxEntry = {
      id: outboxId(payload.profileId),
      entityType: 'profile-avatar',
      entityId: payload.profileId,
      houseId: payload.profileId,
      actorId: payload.profileId,
      operation: payload.operation,
      payload: structuredClone(payload),
      version: payload.updatedAt,
      createdAt: this.runtime.now().toISOString(),
      attempts: 0,
    };
    const native = await this.database.getNativeDatabase();
    if (!native) this.database.getMemoryDatabase().syncOutbox.set(entry.id, entry);
    else {
      const transaction = native.transaction(CASAE_STORES.syncOutbox, 'readwrite');
      transaction.objectStore(CASAE_STORES.syncOutbox).put(entry);
      await transactionToPromise(transaction);
    }
  }

  private async getOutbox(profileIdOrId: string) {
    const id = profileIdOrId.startsWith('profile-avatar:')
      ? profileIdOrId
      : outboxId(profileIdOrId);
    const native = await this.database.getNativeDatabase();
    const value = native
      ? await (async () => {
          const transaction = native.transaction(CASAE_STORES.syncOutbox, 'readonly');
          const found = await requestToPromise(
            transaction.objectStore(CASAE_STORES.syncOutbox).get(id),
          );
          await transactionToPromise(transaction);
          return found;
        })()
      : this.database.getMemoryDatabase().syncOutbox.get(id);
    return value?.entityType === 'profile-avatar'
      ? (value as ProfileAvatarSyncOutboxEntry)
      : undefined;
  }

  private async removeOutboxIfVersion(id: string, version: string) {
    const current = await this.getOutbox(id);
    if (!current || current.version !== version) return;
    const native = await this.database.getNativeDatabase();
    if (!native) this.database.getMemoryDatabase().syncOutbox.delete(id);
    else {
      const transaction = native.transaction(CASAE_STORES.syncOutbox, 'readwrite');
      transaction.objectStore(CASAE_STORES.syncOutbox).delete(id);
      await transactionToPromise(transaction);
    }
  }

  private async recordFailure(entry: ProfileAvatarSyncOutboxEntry, error: unknown) {
    const current = await this.getOutbox(entry.id);
    if (!current || current.version !== entry.version) return;
    const attempts = entry.attempts + 1;
    const delay = Math.min(60_000, 1000 * 2 ** Math.min(attempts, 6));
    const failed: ProfileAvatarSyncOutboxEntry = {
      ...entry,
      attempts,
      lastAttemptAt: this.runtime.now().toISOString(),
      lastError: error instanceof Error ? error.message : 'Falha temporária.',
      nextAttemptAt: new Date(this.runtime.now().getTime() + delay).toISOString(),
    };
    const native = await this.database.getNativeDatabase();
    if (!native) this.database.getMemoryDatabase().syncOutbox.set(failed.id, failed);
    else {
      const transaction = native.transaction(CASAE_STORES.syncOutbox, 'readwrite');
      transaction.objectStore(CASAE_STORES.syncOutbox).put(failed);
      await transactionToPromise(transaction);
    }
    const timer = this.runtime.schedule(() => {
      this.runtime.cancel(timer);
      void this.syncNow(entry.actorId);
    }, delay);
  }

  private scheduleHydrationRetry(profileId: string) {
    if (this.hydrationRetryTimers.has(profileId)) return;
    const attempts = (this.hydrationAttempts.get(profileId) ?? 0) + 1;
    this.hydrationAttempts.set(profileId, attempts);
    const delay = Math.min(60_000, 1500 * 2 ** Math.min(attempts - 1, 5));
    const timer = this.runtime.schedule(() => {
      this.hydrationRetryTimers.delete(profileId);
      void this.syncNow(profileId);
    }, delay);
    this.hydrationRetryTimers.set(profileId, timer);
  }

  private cancelHydrationRetry(profileId: string) {
    const timer = this.hydrationRetryTimers.get(profileId);
    if (timer !== undefined) {
      this.runtime.cancel(timer);
      this.hydrationRetryTimers.delete(profileId);
    }
    this.hydrationAttempts.delete(profileId);
  }

  private uniqueId() {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${this.runtime.now().getTime()}-${Math.random().toString(36).slice(2)}`;
  }

  private revisionEntropy() {
    if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
      return crypto.getRandomValues(new Uint16Array(1))[0]! % 1000;
    }
    return Math.floor(Math.random() * 1000);
  }

  private changed(profileId: string) {
    this.listeners.get(profileId)?.forEach((listener) => listener());
  }
}
