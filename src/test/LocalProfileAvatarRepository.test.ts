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
    await first.save(
      'profile-a',
      new NodeBlob(['foto-a'], { type: 'image/webp' }) as unknown as Blob,
    );

    const restored = new LocalProfileAvatarRepository(
      new CasaeLocalDatabase(name, { migrateLegacy: false }),
    );
    const photo = await restored.get('profile-a');
    expect(photo?.type).toBe('image/webp');
    expect(await photo?.text()).toBe('foto-a');
    expect(await restored.get('profile-b')).toBeUndefined();

    await restored.save('profile-a', null);
    expect(await restored.get('profile-a')).toBeUndefined();
  });
});
