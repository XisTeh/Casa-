import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fromMock, uploadMock, removeMock, downloadMock, rpcMock, profileRow } = vi.hoisted(() => {
  const profileRow = {
    id: '10000000-0000-4000-8000-000000000001',
    display_name: 'Ronnan',
    avatar_path: null as string | null,
    avatar_source_path: null as string | null,
    avatar_crop: null as { zoom: number; centerX: number; centerY: number } | null,
    avatar_revision: 0,
    avatar_updated_at: null as string | null,
    created_at: '2026-08-27T00:00:00.000Z',
    updated_at: '2026-08-27T00:00:00.000Z',
  };
  return {
    profileRow,
    fromMock: vi.fn(),
    uploadMock: vi.fn(),
    removeMock: vi.fn(),
    downloadMock: vi.fn(),
    rpcMock: vi.fn(),
  };
});

vi.mock('../lib/supabase/client', () => ({
  getSupabaseClient: () => ({
    from: fromMock,
    rpc: rpcMock,
    storage: {
      from: () => ({ upload: uploadMock, remove: removeMock, download: downloadMock }),
    },
  }),
}));

import { SupabaseProfileAvatarRepository } from '../infrastructure/supabase/SupabaseProfileAvatarRepository';

describe('SupabaseProfileAvatarRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({ single: async () => ({ data: { ...profileRow }, error: null }) }),
      }),
    });
    uploadMock.mockResolvedValue({ error: null });
    removeMock.mockResolvedValue({ error: null });
  });

  it('faz upload privado de avatar e source WebP em paths revisionados e persiste crop', async () => {
    const avatarRevision = 1787832000000;
    const storageVersion = `${avatarRevision}-device-operation`;
    const avatarUpdatedAt = '2026-08-27T12:00:00.000Z';
    rpcMock.mockResolvedValue({
      data: [
        {
          ...profileRow,
          avatar_path: `${profileRow.id}/${storageVersion}/avatar.webp`,
          avatar_source_path: `${profileRow.id}/${storageVersion}/source.webp`,
          avatar_crop: { zoom: 1.5, centerX: 0.4, centerY: 0.6 },
          avatar_revision: avatarRevision,
          avatar_updated_at: avatarUpdatedAt,
        },
      ],
      error: null,
    });
    const avatarBlob = new Blob(['avatar'], { type: 'image/webp' });
    const sourceBlob = new Blob(['source'], { type: 'image/webp' });
    const repository = new SupabaseProfileAvatarRepository();

    await repository.apply({
      profileId: profileRow.id,
      operation: 'upsert',
      avatar: {
        avatarBlob,
        avatarSourceBlob: sourceBlob,
        avatarCrop: { zoom: 1.5, centerX: 0.4, centerY: 0.6 },
      },
      revision: avatarRevision,
      updatedAt: avatarUpdatedAt,
      storageVersion,
    });

    expect(uploadMock).toHaveBeenNthCalledWith(
      1,
      `${profileRow.id}/${storageVersion}/avatar.webp`,
      avatarBlob,
      expect.objectContaining({ contentType: 'image/webp', upsert: true }),
    );
    expect(uploadMock).toHaveBeenNthCalledWith(
      2,
      `${profileRow.id}/${storageVersion}/source.webp`,
      sourceBlob,
      expect.objectContaining({ contentType: 'image/webp', upsert: true }),
    );
    expect(rpcMock).toHaveBeenCalledWith(
      'apply_profile_avatar',
      expect.objectContaining({
        target_profile_id: profileRow.id,
        item_avatar_crop: { zoom: 1.5, centerX: 0.4, centerY: 0.6 },
        item_avatar_revision: avatarRevision,
      }),
    );
  });

  it('baixa blobs privados diretamente, sem URL temporária', async () => {
    downloadMock
      .mockResolvedValueOnce({ data: new Blob(['avatar']), error: null })
      .mockResolvedValueOnce({ data: new Blob(['source']), error: null });
    const repository = new SupabaseProfileAvatarRepository();
    const profile = {
      id: profileRow.id,
      displayName: 'Ronnan',
      avatarPath: `${profileRow.id}/1/avatar.webp`,
      avatarSourcePath: `${profileRow.id}/1/source.webp`,
      avatarCrop: { zoom: 1, centerX: 0.5, centerY: 0.5 },
      avatarRevision: 1,
      avatarUpdatedAt: '2026-08-27T12:00:00.000Z',
      createdAt: profileRow.created_at,
      updatedAt: profileRow.updated_at,
    };

    const downloaded = await repository.download(profile);
    expect(downloadMock).toHaveBeenNthCalledWith(1, profile.avatarPath);
    expect(downloadMock).toHaveBeenNthCalledWith(2, profile.avatarSourcePath);
    expect(downloaded.avatarCrop).toEqual(profile.avatarCrop);
  });

  it('retorna o avatar visível e sinaliza source ausente sem misturar blobs', async () => {
    downloadMock
      .mockResolvedValueOnce({ data: new Blob(['avatar']), error: null })
      .mockResolvedValueOnce({ data: null, error: new Error('temporary storage failure') });
    const repository = new SupabaseProfileAvatarRepository();
    const downloaded = await repository.download({
      id: profileRow.id,
      displayName: 'Ronnan',
      avatarPath: `${profileRow.id}/2/avatar.webp`,
      avatarSourcePath: `${profileRow.id}/2/source.webp`,
      avatarCrop: { zoom: 1.2, centerX: 0.4, centerY: 0.6 },
      avatarRevision: 2,
      avatarUpdatedAt: '2026-08-27T12:01:00.000Z',
      createdAt: profileRow.created_at,
      updatedAt: profileRow.updated_at,
    });

    expect(await downloaded.avatarBlob.text()).toBe('avatar');
    expect(downloaded.avatarSourceBlob).toBeUndefined();
  });
});
