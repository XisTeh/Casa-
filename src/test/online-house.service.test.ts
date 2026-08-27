import { describe, expect, it } from 'vitest';
import {
  OnlineHouseService,
  type ActiveHousePreference,
  type OnlineHouseholdCache,
  type OnlineHouseholdSnapshot,
} from '../application/online-house-service';
import type { HouseMemberRole } from '../domain/house';
import type {
  HouseInviteReceipt,
  OnlineHouse,
  OnlineHouseMember,
  UserProfile,
} from '../domain/online-house';
import type { OnlineHouseRepository } from '../domain/online-house-repository';
import type { ProfileAvatarRepository } from '../domain/profile-avatar-repository';
import type { ProfileAvatarData } from '../domain/profile-avatar';
import { CategoryService } from '../application/category-service';
import { LocalCategoryRepository } from '../infrastructure/catalog/LocalCategoryRepository';
import { LocalProductRepository } from '../infrastructure/catalog/LocalProductRepository';
import { CasaeLocalDatabase } from '../infrastructure/local-database/CasaeLocalDatabase';

function categoryCatalog(label: string) {
  const database = new CasaeLocalDatabase(
    `online-category-${label}-${Date.now()}-${Math.random()}`,
    { migrateLegacy: false },
  );
  const repository = new LocalCategoryRepository(database);
  return {
    repository,
    service: new CategoryService(repository, new LocalProductRepository(database)),
  };
}

class MemoryPreference implements ActiveHousePreference {
  value?: string;
  get() {
    return this.value;
  }
  set(value: string) {
    this.value = value;
  }
}

class MemoryAvatars implements ProfileAvatarRepository {
  values = new Map<string, ProfileAvatarData>();
  async get(id: string) {
    return this.values.get(id);
  }
  async save(id: string, avatar: ProfileAvatarData | null) {
    if (avatar) this.values.set(id, avatar);
    else this.values.delete(id);
  }
}

class MemoryHouseholdCache implements OnlineHouseholdCache {
  values = new Map<string, OnlineHouseholdSnapshot>();
  get(userId: string) {
    return this.values.get(userId);
  }
  set(userId: string, snapshot: OnlineHouseholdSnapshot) {
    this.values.set(userId, snapshot);
  }
}

class FakeOnlineHouses implements OnlineHouseRepository {
  profiles = new Map<string, UserProfile>([
    [
      'user-a',
      {
        id: 'user-a',
        displayName: 'Raabe',
        avatarPath: null,
        avatarSourcePath: null,
        avatarCrop: null,
        avatarRevision: 0,
        avatarUpdatedAt: null,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ],
    [
      'user-b',
      {
        id: 'user-b',
        displayName: 'Sidney',
        avatarPath: null,
        avatarSourcePath: null,
        avatarCrop: null,
        avatarRevision: 0,
        avatarUpdatedAt: null,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ],
  ]);
  houses: OnlineHouse[] = [];
  members: OnlineHouseMember[] = [];
  invites = new Map<string, { houseId: string; expiresAt: number; used: boolean }>();
  currentUser = 'user-a';
  async getProfile(id: string) {
    return this.profiles.get(id)!;
  }
  async updateProfile(id: string, displayName: string) {
    const next = { ...this.profiles.get(id)!, displayName };
    this.profiles.set(id, next);
    return next;
  }
  async listHouses(userId: string) {
    const ids = new Set(
      this.members.filter((member) => member.userId === userId).map((member) => member.houseId),
    );
    return this.houses.filter((house) => ids.has(house.id));
  }
  async listMembers(houseId: string) {
    return this.members
      .filter((member) => member.houseId === houseId)
      .map((member) => ({ ...member, profile: this.profiles.get(member.userId)! }));
  }
  async createHouse(name: string) {
    const id = `house-${this.houses.length + 1}`;
    this.houses.push({
      id,
      name,
      createdBy: this.currentUser,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    });
    this.members.push(this.member(id, this.currentUser, 'owner'));
    return id;
  }
  async updateHouse(id: string, name: string) {
    this.houses = this.houses.map((house) => (house.id === id ? { ...house, name } : house));
  }
  async createInvite(houseId: string): Promise<HouseInviteReceipt> {
    const token = `TOKEN-${this.invites.size}`;
    const expiresAt = Date.now() + 60_000;
    this.invites.set(token, { houseId, expiresAt, used: false });
    return { token, expiresAt: new Date(expiresAt).toISOString() };
  }
  async acceptInvite(token: string) {
    const invite = this.invites.get(token);
    if (!invite || invite.used || invite.expiresAt <= Date.now()) throw new Error('invalid');
    if (
      this.members.some(
        (member) => member.houseId === invite.houseId && member.userId === this.currentUser,
      )
    )
      throw new Error('duplicate');
    invite.used = true;
    this.members.push(this.member(invite.houseId, this.currentUser, 'member'));
    return invite.houseId;
  }
  async updateMemberRole(houseId: string, userId: string, role: HouseMemberRole) {
    this.members = this.members.map((member) =>
      member.houseId === houseId && member.userId === userId ? { ...member, role } : member,
    );
  }
  async removeMember(houseId: string, userId: string) {
    this.members = this.members.filter(
      (member) => member.houseId !== houseId || member.userId !== userId,
    );
  }
  member(houseId: string, userId: string, role: HouseMemberRole): OnlineHouseMember {
    return {
      id: `${houseId}:${userId}`,
      houseId,
      userId,
      role,
      status: 'active',
      joinedAt: '2026-01-01',
      profile: this.profiles.get(userId)!,
    };
  }
}

describe('OnlineHouseService', () => {
  it('retorna onboarding sem Casa e cria a primeira membership owner atomicamente', async () => {
    const repository = new FakeOnlineHouses();
    const service = new OnlineHouseService(repository, new MemoryAvatars(), new MemoryPreference());
    expect((await service.getSnapshot('user-a')).activeHouse).toBeUndefined();
    const snapshot = await service.createHouse('user-a', 'Casa A');
    expect(snapshot.activeHouse?.name).toBe('Casa A');
    expect(snapshot.activeMember).toMatchObject({ id: 'user-a', role: 'owner' });
  });

  it('cria segunda Casa, troca a preferência e mantém memberships isoladas', async () => {
    const repository = new FakeOnlineHouses();
    const preference = new MemoryPreference();
    const service = new OnlineHouseService(repository, new MemoryAvatars(), preference);
    await service.createHouse('user-a', 'Casa A');
    const second = await service.createHouse('user-a', 'Casa B');
    expect(second.houses).toHaveLength(2);
    expect(preference.value).toBe('house-2');
    expect((await service.switchHouse('user-a', 'house-1')).activeHouse?.name).toBe('Casa A');
  });

  it('aceita convite válido uma vez e rejeita inválido, expirado ou duplicado', async () => {
    const repository = new FakeOnlineHouses();
    const avatars = new MemoryAvatars();
    const preferenceA = new MemoryPreference();
    const serviceA = new OnlineHouseService(repository, avatars, preferenceA);
    await serviceA.createHouse('user-a', 'Casa A');
    const invite = await serviceA.createInvite('house-1');
    repository.currentUser = 'user-b';
    const serviceB = new OnlineHouseService(repository, avatars, new MemoryPreference());
    const joined = await serviceB.acceptInvite('user-b', invite.token);
    expect(joined.activeMember).toMatchObject({ id: 'user-b', role: 'member' });
    expect(joined.members.map((member) => member.displayName)).toEqual(['Raabe', 'Sidney']);
    await expect(serviceB.acceptInvite('user-b', invite.token)).rejects.toThrow(
      /não é válido ou expirou/i,
    );
    await expect(serviceB.acceptInvite('user-b', 'NÃO-EXISTE')).rejects.toThrow(
      /não é válido ou expirou/i,
    );
    repository.invites.set('EXPIRADO', { houseId: 'house-1', expiresAt: 0, used: false });
    await expect(serviceB.acceptInvite('user-b', 'EXPIRADO')).rejects.toThrow(
      /não é válido ou expirou/i,
    );
  });

  it('inicializa as categorias locais para owner e convidado sem duplicar ou misturar Casas', async () => {
    const repository = new FakeOnlineHouses();
    const avatars = new MemoryAvatars();
    const ownerCatalog = categoryCatalog('owner');
    const ownerService = new OnlineHouseService(
      repository,
      avatars,
      new MemoryPreference(),
      new MemoryHouseholdCache(),
      ownerCatalog.service,
    );

    const first = await ownerService.createHouse('user-a', 'Casa compartilhada');
    const firstHouseId = first.activeHouse!.id;
    expect(await ownerCatalog.repository.list(firstHouseId)).toHaveLength(11);
    expect(
      (await ownerCatalog.repository.list(firstHouseId)).find(
        (category) => category.legacyKey === 'outros',
      ),
    ).toBeDefined();
    await ownerCatalog.service.create('Importados', firstHouseId);
    await ownerService.getSnapshot('user-a');
    expect(await ownerCatalog.repository.list(firstHouseId)).toHaveLength(12);

    const invite = await ownerService.createInvite(firstHouseId);
    repository.currentUser = 'user-b';
    const guestCatalog = categoryCatalog('guest');
    const guestService = new OnlineHouseService(
      repository,
      avatars,
      new MemoryPreference(),
      new MemoryHouseholdCache(),
      guestCatalog.service,
    );
    await guestService.acceptInvite('user-b', invite.token);
    expect(await guestCatalog.repository.list(firstHouseId)).toHaveLength(11);
    expect(
      (await guestCatalog.repository.list(firstHouseId)).some(
        (category) => category.name === 'Importados',
      ),
    ).toBe(false);

    repository.currentUser = 'user-a';
    const second = await ownerService.createHouse('user-a', 'Casa B');
    expect(await ownerCatalog.repository.list(second.activeHouse!.id)).toHaveLength(11);
    await ownerService.switchHouse('user-a', firstHouseId);
    expect(await ownerCatalog.repository.list(firstHouseId)).toHaveLength(12);
  });

  it('persiste foto global local e nome sem depender da Casa', async () => {
    const repository = new FakeOnlineHouses();
    const avatars = new MemoryAvatars();
    const service = new OnlineHouseService(repository, avatars, new MemoryPreference());
    await service.createHouse('user-a', 'Casa A');
    const photo = new Blob(['avatar'], { type: 'image/webp' });
    const snapshot = await service.updateMember('user-a', 'house-1', 'user-a', {
      displayName: 'Raabe Silva',
      role: 'owner',
      avatar: { avatarBlob: photo },
    });
    expect(snapshot.activeMember?.displayName).toBe('Raabe Silva');
    expect(await snapshot.activeMember?.avatarBlob?.text()).toBe('avatar');
    const secondHouse = await service.createHouse('user-a', 'Casa B');
    expect(await secondHouse.activeMember?.avatarBlob?.text()).toBe('avatar');
    const firstHouse = await service.switchHouse('user-a', 'house-1');
    expect(await firstHouse.activeMember?.avatarBlob?.text()).toBe('avatar');
  });

  it('reabre a última Casa conhecida quando a rede falha sem inventar nova membership', async () => {
    const repository = new FakeOnlineHouses();
    const cache = new MemoryHouseholdCache();
    const service = new OnlineHouseService(
      repository,
      new MemoryAvatars(),
      new MemoryPreference(),
      cache,
    );
    const online = await service.createHouse('user-a', 'Casa A');
    expect(online.activeHouse?.id).toBe('house-1');
    repository.getProfile = async () => {
      throw new TypeError('Failed to fetch');
    };

    const restored = await service.getSnapshot('user-a');
    expect(restored.activeHouse?.id).toBe('house-1');
    expect(restored.activeMember?.id).toBe('user-a');
  });
});
