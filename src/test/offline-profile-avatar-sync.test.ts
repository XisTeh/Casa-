/// <reference types="node" />

import { Blob as NodeBlob } from 'node:buffer';
import { IDBKeyRange as FakeIDBKeyRange, indexedDB as fakeIndexedDB } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '../domain/online-house';
import type { ProfileAvatarMutation } from '../domain/profile-avatar';
import { CasaeLocalDatabase } from '../infrastructure/local-database/CasaeLocalDatabase';
import { LocalProfileAvatarRepository } from '../infrastructure/profile/LocalProfileAvatarRepository';
import { OfflineFirstProfileAvatarRepository } from '../infrastructure/profile/OfflineFirstProfileAvatarRepository';
import type { ShoppingSyncRuntime } from '../infrastructure/shopping/OfflineFirstShoppingRepository';
import type { RemoteProfileAvatarStore } from '../infrastructure/supabase/SupabaseProfileAvatarRepository';

const USER_A = '10000000-0000-4000-8000-000000000001';
const USER_B = '20000000-0000-4000-8000-000000000002';

const blob = (text: string) => new NodeBlob([text], { type: 'image/webp' }) as unknown as Blob;

function emptyProfile(id = USER_A): UserProfile {
  return {
    id,
    displayName: id === USER_A ? 'Ronnan' : 'Janifer',
    avatarPath: null,
    avatarSourcePath: null,
    avatarCrop: null,
    avatarRevision: 0,
    avatarUpdatedAt: null,
    createdAt: '2026-08-27T00:00:00.000Z',
    updatedAt: '2026-08-27T00:00:00.000Z',
  };
}

class Runtime implements ShoppingSyncRuntime {
  online = true;
  current = new Date('2026-08-27T12:00:00.000Z');
  onlineListeners = new Set<() => void>();
  isOnline = () => this.online;
  now = () => new Date(this.current);
  addOnlineListener = (listener: () => void) => {
    this.onlineListeners.add(listener);
    return () => this.onlineListeners.delete(listener);
  };
  addVisibleListener = () => () => undefined;
  schedule = vi.fn(() => 1 as unknown as ReturnType<typeof setTimeout>);
  cancel = vi.fn();
  reconnect() {
    this.online = true;
    this.onlineListeners.forEach((listener) => listener());
  }
}

class AvatarBackend {
  profiles = new Map<string, UserProfile>([
    [USER_A, emptyProfile(USER_A)],
    [USER_B, emptyProfile(USER_B)],
  ]);
  avatars = new Map<string, NonNullable<ProfileAvatarMutation['avatar']>>();
  listeners = new Map<string, Set<(profile: UserProfile) => void>>();
}

class Remote implements RemoteProfileAvatarStore {
  sourceFailures = 0;
  constructor(
    private readonly backend: AvatarBackend,
    private readonly userId: string,
  ) {}
  async getCurrentUserId() {
    return this.userId;
  }
  async getProfile(profileId: string) {
    return structuredClone(this.backend.profiles.get(profileId)!);
  }
  async apply(mutation: ProfileAvatarMutation) {
    if (mutation.profileId !== this.userId) throw new Error('profile_avatar_owner_required');
    const current = this.backend.profiles.get(mutation.profileId)!;
    if (!current.avatarUpdatedAt || mutation.updatedAt >= current.avatarUpdatedAt) {
      const storageVersion = mutation.storageVersion ?? String(mutation.revision);
      const avatarPath = `${mutation.profileId}/${storageVersion}/avatar.webp`;
      const sourcePath = `${mutation.profileId}/${storageVersion}/source.webp`;
      if (mutation.avatar) this.backend.avatars.set(avatarPath, mutation.avatar);
      const next: UserProfile = {
        ...current,
        avatarPath: mutation.operation === 'upsert' ? avatarPath : null,
        avatarSourcePath: mutation.operation === 'upsert' ? sourcePath : null,
        avatarCrop: mutation.avatar?.avatarCrop ?? null,
        avatarRevision: mutation.revision,
        avatarUpdatedAt: mutation.updatedAt,
      };
      this.backend.profiles.set(mutation.profileId, next);
      this.backend.listeners
        .get(mutation.profileId)
        ?.forEach((listener) => listener(structuredClone(next)));
    }
    return this.getProfile(mutation.profileId);
  }
  async download(profile: UserProfile) {
    const avatar = profile.avatarPath ? this.backend.avatars.get(profile.avatarPath) : undefined;
    if (!avatar?.avatarSourceBlob || !avatar.avatarCrop) throw new Error('missing avatar');
    const sourceFailed = this.sourceFailures > 0;
    if (sourceFailed) this.sourceFailures -= 1;
    return {
      avatarBlob: avatar.avatarBlob,
      avatarSourceBlob: sourceFailed ? undefined : avatar.avatarSourceBlob,
      avatarCrop: avatar.avatarCrop,
    };
  }
  subscribe(profileId: string, receive: (profile: UserProfile) => void) {
    const listeners = this.backend.listeners.get(profileId) ?? new Set();
    listeners.add(receive);
    this.backend.listeners.set(profileId, listeners);
    return () => listeners.delete(receive);
  }
}

function device(label: string, backend: AvatarBackend, userId: string, runtime = new Runtime()) {
  const database = new CasaeLocalDatabase(`avatar-sync-${label}-${Math.random()}`, {
    migrateLegacy: false,
  });
  const remote = new Remote(backend, userId);
  return {
    database,
    remote,
    runtime,
    repository: new OfflineFirstProfileAvatarRepository(database, remote, runtime),
  };
}

describe('OfflineFirstProfileAvatarRepository', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', fakeIndexedDB);
    vi.stubGlobal('IDBKeyRange', FakeIDBKeyRange);
  });

  it('envia avatar, source e crop e propaga reposicionamento a outro dispositivo via Realtime', async () => {
    const backend = new AvatarBackend();
    const pc = device('pc', backend, USER_A);
    const phone = device('phone', backend, USER_A);
    const disconnectPc = pc.repository.subscribe(USER_A, () => undefined);
    const disconnectPhone = phone.repository.subscribe(USER_A, () => undefined);

    await pc.repository.save(USER_A, {
      avatarBlob: blob('avatar-pc'),
      avatarSourceBlob: blob('source-pc'),
      avatarCrop: { zoom: 1.4, centerX: 0.4, centerY: 0.6 },
    });
    await vi.waitFor(async () => {
      expect(await (await phone.repository.get(USER_A))?.avatarBlob.text()).toBe('avatar-pc');
    });
    const firstRemoteVersion = structuredClone(backend.profiles.get(USER_A)!);
    expect(await (await phone.repository.get(USER_A))?.avatarSourceBlob?.text()).toBe('source-pc');
    expect((await phone.repository.get(USER_A))?.avatarCrop).toEqual({
      zoom: 1.4,
      centerX: 0.4,
      centerY: 0.6,
    });
    expect(await phone.repository.get(USER_A)).toMatchObject({
      avatarRemotePath: firstRemoteVersion.avatarPath,
      avatarSourceRemotePath: firstRemoteVersion.avatarSourcePath,
      avatarSyncState: 'synced',
    });

    phone.runtime.current = new Date('2026-08-27T12:01:00.000Z');
    await phone.repository.save(USER_A, {
      avatarBlob: blob('avatar-phone-crop'),
      avatarSourceBlob: blob('source-pc'),
      avatarCrop: { zoom: 1.8, centerX: 0.3, centerY: 0.7 },
    });
    await vi.waitFor(async () => {
      expect(await (await pc.repository.get(USER_A))?.avatarBlob.text()).toBe('avatar-phone-crop');
    });
    await pc.repository.reconcile(firstRemoteVersion);
    expect(await (await pc.repository.get(USER_A))?.avatarBlob.text()).toBe('avatar-phone-crop');
    disconnectPc();
    disconnectPhone();
  });

  it('mantém Blob local offline, envia ao reconectar e remove em todos os dispositivos', async () => {
    const backend = new AvatarBackend();
    const offline = new Runtime();
    offline.online = false;
    const phone = device('offline-phone', backend, USER_A, offline);
    const pc = device('remove-pc', backend, USER_A);
    const disconnectPhone = phone.repository.subscribe(USER_A, () => undefined);
    const disconnectPc = pc.repository.subscribe(USER_A, () => undefined);

    await phone.repository.save(USER_A, {
      avatarBlob: blob('offline-avatar'),
      avatarSourceBlob: blob('offline-source'),
      avatarCrop: { zoom: 1.2, centerX: 0.5, centerY: 0.5 },
    });
    expect((await phone.repository.get(USER_A))?.avatarSyncState).toBe('pending');
    expect(backend.profiles.get(USER_A)?.avatarRevision).toBe(0);

    offline.reconnect();
    await phone.repository.syncNow(USER_A);
    await vi.waitFor(async () => {
      expect(await (await pc.repository.get(USER_A))?.avatarBlob.text()).toBe('offline-avatar');
    });

    pc.runtime.current = new Date('2026-08-27T12:02:00.000Z');
    await pc.repository.save(USER_A, null);
    await vi.waitFor(async () => expect(await phone.repository.get(USER_A)).toBeUndefined());
    expect(backend.profiles.get(USER_A)).toMatchObject({
      avatarPath: null,
      avatarSourcePath: null,
    });
    disconnectPhone();
    disconnectPc();
  });

  it('preserva avatar local antigo fisicamente sem enviá-lo ao remoto', async () => {
    const backend = new AvatarBackend();
    const legacy = device('legacy', backend, USER_A);
    const local = new LocalProfileAvatarRepository(legacy.database);
    await local.save(USER_A, {
      avatarBlob: blob('legacy-avatar'),
      avatarSourceBlob: blob('legacy-source'),
      avatarCrop: { zoom: 1.1, centerX: 0.5, centerY: 0.5 },
    });
    expect(backend.profiles.get(USER_A)?.avatarRevision).toBe(0);
    await legacy.repository.syncNow(USER_A);
    expect(await (await legacy.repository.get(USER_A))?.avatarBlob.text()).toBe('legacy-avatar');
    expect(backend.profiles.get(USER_A)?.avatarPath).toBeNull();
  });

  it('não permite que o usuário A altere ou remova o avatar de B', async () => {
    const backend = new AvatarBackend();
    const attacker = device('attacker', backend, USER_A);
    await expect(attacker.repository.save(USER_B, { avatarBlob: blob('invasor') })).rejects.toThrow(
      /próprio usuário/i,
    );
    expect(await attacker.repository.get(USER_B)).toBeUndefined();
    expect(backend.profiles.get(USER_B)?.avatarRevision).toBe(0);
  });

  it('repete o sync quando uma troca A → B entra enquanto outra passagem ainda está em andamento', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const backend = new AvatarBackend();
    const phone = device('dirty-rerun', backend, USER_A);
    let releaseProfile!: (profile: UserProfile) => void;
    const blockedProfile = new Promise<UserProfile>((resolve) => {
      releaseProfile = resolve;
    });
    const originalGetProfile = phone.remote.getProfile.bind(phone.remote);
    const getProfile = vi
      .spyOn(phone.remote, 'getProfile')
      .mockImplementationOnce(() => blockedProfile)
      .mockImplementation(originalGetProfile);

    const firstPass = phone.repository.syncNow(USER_A);
    await vi.waitFor(() => expect(getProfile).toHaveBeenCalledOnce());
    const replacement = phone.repository.save(USER_A, {
      avatarBlob: blob('avatar-b'),
      avatarSourceBlob: blob('source-b'),
      avatarCrop: { zoom: 1.6, centerX: 0.3, centerY: 0.6 },
    });
    await vi.waitFor(() =>
      expect(phone.database.getMemoryDatabase().syncOutbox.size).toBeGreaterThan(0),
    );
    releaseProfile(emptyProfile());
    await Promise.all([firstPass, replacement]);

    const remoteProfile = backend.profiles.get(USER_A)!;
    expect(remoteProfile.avatarPath).toContain(USER_A);
    expect(await backend.avatars.get(remoteProfile.avatarPath!)?.avatarBlob.text()).toBe(
      'avatar-b',
    );
    expect(phone.database.getMemoryDatabase().syncOutbox.size).toBe(0);
  });

  it('marca source parcial como em hidratação e completa o cache no retry', async () => {
    const backend = new AvatarBackend();
    const sender = device('partial-sender', backend, USER_A);
    await sender.repository.save(USER_A, {
      avatarBlob: blob('avatar-visible'),
      avatarSourceBlob: blob('source-editable'),
      avatarCrop: { zoom: 1.7, centerX: 0.35, centerY: 0.65 },
    });

    const receiver = device('partial-receiver', backend, USER_A);
    receiver.remote.sourceFailures = 1;
    await receiver.repository.syncNow(USER_A);
    const partial = await receiver.repository.get(USER_A);
    expect(await partial?.avatarBlob.text()).toBe('avatar-visible');
    expect(partial?.avatarSourceBlob).toBeUndefined();
    expect(partial?.avatarSyncState).toBe('hydrating');

    await receiver.repository.syncNow(USER_A);
    const complete = await receiver.repository.get(USER_A);
    expect(await complete?.avatarSourceBlob?.text()).toBe('source-editable');
    expect(complete?.avatarCrop).toEqual({ zoom: 1.7, centerX: 0.35, centerY: 0.65 });
    expect(complete?.avatarSyncState).toBe('synced');
  });

  it('autorrepara cache antigo marcado synced mas sem source ou identidade dos paths', async () => {
    const backend = new AvatarBackend();
    const sender = device('repair-sender', backend, USER_A);
    await sender.repository.save(USER_A, {
      avatarBlob: blob('remote-avatar'),
      avatarSourceBlob: blob('remote-source'),
      avatarCrop: { zoom: 1.2, centerX: 0.4, centerY: 0.6 },
    });
    const profile = backend.profiles.get(USER_A)!;
    const receiver = device('repair-receiver', backend, USER_A);
    await new LocalProfileAvatarRepository(receiver.database).save(USER_A, {
      avatarBlob: blob('stale-avatar'),
      avatarRevision: profile.avatarRevision,
      avatarUpdatedAt: profile.avatarUpdatedAt!,
      avatarSyncState: 'synced',
    });

    await receiver.repository.syncNow(USER_A);
    const repaired = await receiver.repository.get(USER_A);
    expect(await repaired?.avatarBlob.text()).toBe('remote-avatar');
    expect(await repaired?.avatarSourceBlob?.text()).toBe('remote-source');
    expect(repaired).toMatchObject({
      avatarRemotePath: profile.avatarPath,
      avatarSourceRemotePath: profile.avatarSourcePath,
      avatarSyncState: 'synced',
    });
  });

  it('converge operações de dois dispositivos no mesmo instante sem reutilizar o path remoto', async () => {
    const backend = new AvatarBackend();
    const pc = device('same-clock-pc', backend, USER_A);
    const phone = device('same-clock-phone', backend, USER_A);

    await pc.repository.save(USER_A, {
      avatarBlob: blob('same-clock-a'),
      avatarSourceBlob: blob('same-clock-source-a'),
      avatarCrop: { zoom: 1.1, centerX: 0.5, centerY: 0.5 },
    });
    const firstPath = backend.profiles.get(USER_A)?.avatarPath;
    await phone.repository.save(USER_A, {
      avatarBlob: blob('same-clock-b'),
      avatarSourceBlob: blob('same-clock-source-b'),
      avatarCrop: { zoom: 1.9, centerX: 0.3, centerY: 0.7 },
    });
    const secondPath = backend.profiles.get(USER_A)?.avatarPath;

    expect(secondPath).not.toBe(firstPath);
    await pc.repository.syncNow(USER_A);
    expect(await (await pc.repository.get(USER_A))?.avatarBlob.text()).toBe('same-clock-b');
    expect(await (await pc.repository.get(USER_A))?.avatarSourceBlob?.text()).toBe(
      'same-clock-source-b',
    );
  });
});
