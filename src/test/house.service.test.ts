import { describe, expect, it } from 'vitest';
import { HouseService } from '../application/house-service';
import { CategoryService } from '../application/category-service';
import { LEGACY_HOUSE_ID } from '../domain/house';
import { LocalCategoryRepository } from '../infrastructure/catalog/LocalCategoryRepository';
import { LocalProductRepository } from '../infrastructure/catalog/LocalProductRepository';
import { LocalHouseRepository } from '../infrastructure/house/LocalHouseRepository';
import { CasaeLocalDatabase } from '../infrastructure/local-database/CasaeLocalDatabase';

function serviceFor(label: string) {
  const database = new CasaeLocalDatabase(`house-service-${label}-${Date.now()}-${Math.random()}`, {
    migrateLegacy: false,
  });
  const repository = new LocalHouseRepository(database);
  const categoryRepository = new LocalCategoryRepository(database);
  return {
    repository,
    categories: categoryRepository,
    service: new HouseService(
      repository,
      new CategoryService(categoryRepository, new LocalProductRepository(database)),
    ),
  };
}

describe('HouseService', () => {
  it('renomeia Casa, administra membros e persiste Casa/membro ativos', async () => {
    const { repository, service } = serviceFor('members');
    let snapshot = await service.getSnapshot();
    const initialOwner = snapshot.activeMember;

    snapshot = await service.updateHouse(snapshot.activeHouse.id, initialOwner.id, 'Nossa Casa');
    expect(snapshot.activeHouse.name).toBe('Nossa Casa');
    snapshot = await service.addMember(
      snapshot.activeHouse.id,
      initialOwner.id,
      'Ronnan',
      'member',
    );
    const ronnan = snapshot.members.find((member) => member.displayName === 'Ronnan')!;

    await expect(
      service.updateMember(LEGACY_HOUSE_ID, initialOwner.id, initialOwner.id, {
        displayName: initialOwner.displayName,
        role: 'member',
      }),
    ).rejects.toThrow(/único owner/i);
    await expect(
      service.removeMember(LEGACY_HOUSE_ID, initialOwner.id, initialOwner.id),
    ).rejects.toThrow(/único owner/i);

    await service.updateMember(LEGACY_HOUSE_ID, initialOwner.id, ronnan.id, {
      displayName: 'Ronnan Silva',
      role: 'owner',
    });
    snapshot = await service.switchMember(LEGACY_HOUSE_ID, ronnan.id);
    expect(snapshot.activeMember.displayName).toBe('Ronnan Silva');
    expect(await repository.getActiveMemberId()).toBe(ronnan.id);
    expect((await service.getSnapshot()).activeMember.id).toBe(ronnan.id);
  });

  it('cria segunda Casa vazia, torna o membro atual owner e persiste a troca', async () => {
    const { repository, service, categories } = serviceFor('second-house');
    const initial = await service.getSnapshot();
    expect(await categories.list(LEGACY_HOUSE_ID)).toEqual([]);
    const created = await service.createHouse('Apartamento 301', initial.activeMember);

    expect(created.houses).toHaveLength(2);
    expect(created.activeHouse.name).toBe('Apartamento 301');
    expect(created.activeMember).toMatchObject({
      displayName: initial.activeMember.displayName,
      role: 'owner',
    });
    expect(created.activeMember.houseId).toBe(created.activeHouse.id);
    expect(await repository.getActiveHouseId()).toBe(created.activeHouse.id);
    expect(await categories.list(created.activeHouse.id)).toHaveLength(11);

    const restored = await service.getSnapshot();
    expect(restored.activeHouse.id).toBe(created.activeHouse.id);
    expect(await categories.list(created.activeHouse.id)).toHaveLength(11);
    const original = await service.switchHouse(initial.activeHouse.id);
    expect(original.activeHouse.id).toBe(initial.activeHouse.id);
  });

  it('rejeita nomes vazios e operações de member sobre a Casa', async () => {
    const { service } = serviceFor('rules');
    let snapshot = await service.getSnapshot();
    await expect(
      service.updateHouse(snapshot.activeHouse.id, snapshot.activeMember.id, '  '),
    ).rejects.toThrow(/nome da Casa/i);
    snapshot = await service.addMember(
      snapshot.activeHouse.id,
      snapshot.activeMember.id,
      'Membro local',
      'member',
    );
    const member = snapshot.members.find((candidate) => candidate.role === 'member')!;
    await expect(
      service.updateHouse(snapshot.activeHouse.id, member.id, 'Outra Casa'),
    ).rejects.toThrow(/proprietários/i);
  });

  it('persiste a foto no perfil correto sem misturar Casas', async () => {
    const { service } = serviceFor('avatars');
    const original = await service.getSnapshot();
    const photoA = new Blob(['casa-a'], { type: 'image/webp' });
    let snapshot = await service.updateMember(
      original.activeHouse.id,
      original.activeMember.id,
      original.activeMember.id,
      {
        displayName: 'Raabe A',
        role: original.activeMember.role,
        avatar: { avatarBlob: photoA },
      },
    );
    expect(snapshot.activeMember.avatarBlob).toEqual(photoA);

    snapshot = await service.createHouse('Casa B', snapshot.activeMember);
    expect(snapshot.activeMember.avatarBlob).toBeUndefined();
    const photoB = new Blob(['casa-b'], { type: 'image/webp' });
    await service.updateMember(
      snapshot.activeHouse.id,
      snapshot.activeMember.id,
      snapshot.activeMember.id,
      { displayName: 'Raabe B', role: 'owner', avatar: { avatarBlob: photoB } },
    );

    const restoredA = await service.switchHouse(original.activeHouse.id);
    expect(await restoredA.activeMember.avatarBlob?.text()).toBe('casa-a');
    expect(restoredA.activeMember.displayName).toBe('Raabe A');
    expect((await service.getSnapshot()).activeMember.avatarBlob?.type).toBe('image/webp');
  });
});
