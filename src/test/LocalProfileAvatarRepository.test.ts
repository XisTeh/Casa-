/// <reference types="node" />

import { IDBKeyRange as FakeIDBKeyRange, indexedDB as fakeIndexedDB } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { CasaeLocalDatabase } from '../infrastructure/local-database/CasaeLocalDatabase';
import { LocalProfileAvatarRepository } from '../infrastructure/profile/LocalProfileAvatarRepository';

describe('LocalProfileAvatarRepository', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', fakeIndexedDB);
    vi.stubGlobal('IDBKeyRange', FakeIDBKeyRange);
  });

  it('persiste o Blob global por profileId após reabrir o IndexedDB e permite removê-lo', async () => {
    const name = `profile-avatar-${Date.now()}-${Math.random()}`;
    const first = new LocalProfileAvatarRepository(
      new CasaeLocalDatabase(name, { migrateLegacy: false }),
    );
    const avatarBlob = new NodeBlob(['foto-a'], { type: 'image/webp' }) as unknown as Blob;
    const sourceBlob = new NodeBlob(['fonte-a'], { type: 'image/webp' }) as unknown as Blob;
    await first.save('profile-a', {
      avatarBlob,
      avatarSourceBlob: sourceBlob,
      avatarCrop: { zoom: 1.5, centerX: 0.4, centerY: 0.6 },
    });

    const restored = new LocalProfileAvatarRepository(
      new CasaeLocalDatabase(name, { migrateLegacy: false }),
    );
    const photo = await restored.get('profile-a');
    expect(photo?.avatarBlob.type).toBe('image/webp');
    expect(await photo?.avatarBlob.text()).toBe('foto-a');
    expect(await photo?.avatarSourceBlob?.text()).toBe('fonte-a');
    expect(photo?.avatarCrop).toEqual({ zoom: 1.5, centerX: 0.4, centerY: 0.6 });
    expect(await restored.get('profile-b')).toBeUndefined();

    await restored.save('profile-a', null);
    expect(await restored.get('profile-a')).toBeUndefined();
  });
});
