import type { House, HouseMember, HouseMemberRole } from '../domain/house';
import type { OnlineHouseRepository } from '../domain/online-house-repository';
import type { ProfileAvatarRepository } from '../domain/profile-avatar-repository';
import type { UserProfile } from '../domain/online-house';
import type { DefaultCategoryInitializer } from './house-service';

export interface ActiveHousePreference {
  get(): string | undefined;
  set(houseId: string): void;
}

export interface OnlineHouseholdCache {
  get(userId: string): OnlineHouseholdSnapshot | undefined;
  set(userId: string, snapshot: OnlineHouseholdSnapshot): void;
}

export class BrowserOnlineHouseholdCache implements OnlineHouseholdCache {
  private key(userId: string) {
    return `casae.onlineHousehold.${userId}`;
  }

  get(userId: string) {
    if (typeof localStorage === 'undefined') return undefined;
    const raw = localStorage.getItem(this.key(userId));
    if (!raw) return undefined;
    try {
      const snapshot = JSON.parse(raw) as OnlineHouseholdSnapshot;
      return snapshot?.profile?.id === userId && Array.isArray(snapshot.houses)
        ? snapshot
        : undefined;
    } catch {
      return undefined;
    }
  }

  set(userId: string, snapshot: OnlineHouseholdSnapshot) {
    if (typeof localStorage === 'undefined') return;
    const serializable = {
      ...snapshot,
      members: snapshot.members.map((member) => ({ ...member, avatarBlob: undefined })),
    };
    localStorage.setItem(this.key(userId), JSON.stringify(serializable));
  }
}

export class BrowserActiveHousePreference implements ActiveHousePreference {
  private readonly key = 'casae.activeHouseId';

  get() {
    return typeof localStorage === 'undefined'
      ? undefined
      : (localStorage.getItem(this.key) ?? undefined);
  }

  set(houseId: string) {
    if (typeof localStorage !== 'undefined') localStorage.setItem(this.key, houseId);
  }
}

export type OnlineHouseholdSnapshot = {
  profile: UserProfile;
  houses: House[];
  activeHouse?: House;
  members: HouseMember[];
  activeMember?: HouseMember;
};

function validName(value: string, label: string) {
  const clean = value.trim();
  if (!clean) throw new Error(`Informe ${label}.`);
  return clean;
}

function isOfflineOrNetworkFailure(error: unknown) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  const message = error instanceof Error ? error.message.toLocaleLowerCase('en-US') : '';
  return error instanceof TypeError || /fetch|network|offline|connection/.test(message);
}

export class OnlineHouseService {
  constructor(
    private readonly repository: OnlineHouseRepository,
    private readonly avatars: ProfileAvatarRepository,
    private readonly preference: ActiveHousePreference = new BrowserActiveHousePreference(),
    private readonly cache: OnlineHouseholdCache = new BrowserOnlineHouseholdCache(),
    private readonly categories?: DefaultCategoryInitializer,
  ) {}

  async getSnapshot(userId: string): Promise<OnlineHouseholdSnapshot> {
    try {
      const snapshot = await this.getRemoteSnapshot(userId);
      await this.ensureSnapshotCategories(snapshot);
      this.cache.set(userId, snapshot);
      return snapshot;
    } catch (error) {
      const cached = this.cache.get(userId);
      if (cached && isOfflineOrNetworkFailure(error)) {
        await this.ensureSnapshotCategories(cached);
        return cached;
      }
      throw error;
    }
  }

  private async getRemoteSnapshot(userId: string): Promise<OnlineHouseholdSnapshot> {
    const [profile, remoteHouses] = await Promise.all([
      this.repository.getProfile(userId),
      this.repository.listHouses(userId),
    ]);
    const houses = remoteHouses.map<House>((house) => ({
      id: house.id,
      name: house.name,
      createdByMemberId: house.createdBy,
      createdAt: house.createdAt,
      updatedAt: house.updatedAt,
      isActive: true,
    }));
    if (!houses.length) return { profile, houses, members: [] };

    const preferredId = this.preference.get();
    const activeHouse = houses.find((house) => house.id === preferredId) ?? houses[0]!;
    if (preferredId !== activeHouse.id) this.preference.set(activeHouse.id);
    const remoteMembers = await this.repository.listMembers(activeHouse.id);
    const members = await Promise.all(
      remoteMembers.map(
        async (member) =>
          ({
            id: member.userId,
            houseId: member.houseId,
            displayName: member.profile.displayName,
            avatarSeed: member.profile.displayName,
            avatarBlob: await this.avatars.get(member.userId),
            role: member.role,
            status: member.status,
            joinedAt: member.joinedAt,
            createdAt: member.profile.createdAt,
            updatedAt: member.profile.updatedAt,
          }) satisfies HouseMember,
      ),
    );
    const activeMember = members.find((member) => member.id === userId);
    if (!activeMember) throw new Error('Sua conta não possui acesso à Casa ativa.');
    return { profile, houses, activeHouse, members, activeMember };
  }

  async createHouse(userId: string, name: string) {
    const houseId = await this.repository.createHouse(validName(name, 'o nome da Casa'));
    this.preference.set(houseId);
    return this.getSnapshot(userId);
  }

  async acceptInvite(userId: string, token: string) {
    try {
      const houseId = await this.repository.acceptInvite(token.trim());
      this.preference.set(houseId);
      return this.getSnapshot(userId);
    } catch {
      throw new Error('Este convite não é válido ou expirou.');
    }
  }

  async switchHouse(userId: string, houseId: string) {
    const houses = await this.repository.listHouses(userId);
    if (!houses.some((house) => house.id === houseId)) {
      throw new Error('Esta Casa não está disponível para sua conta.');
    }
    this.preference.set(houseId);
    return this.getSnapshot(userId);
  }

  async updateHouse(userId: string, houseId: string, name: string) {
    await this.repository.updateHouse(houseId, validName(name, 'o nome da Casa'));
    return this.getSnapshot(userId);
  }

  async updateMember(
    userId: string,
    houseId: string,
    memberId: string,
    changes: { displayName: string; role: HouseMemberRole; avatarBlob?: Blob | null },
  ) {
    if (memberId === userId) {
      await this.repository.updateProfile(userId, validName(changes.displayName, 'seu nome'));
      if ('avatarBlob' in changes) await this.avatars.save(userId, changes.avatarBlob ?? null);
    } else {
      await this.repository.updateMemberRole(houseId, memberId, changes.role);
    }
    return this.getSnapshot(userId);
  }

  async removeMember(userId: string, houseId: string, memberId: string) {
    await this.repository.removeMember(houseId, memberId);
    return this.getSnapshot(userId);
  }

  createInvite(houseId: string) {
    return this.repository.createInvite(houseId);
  }

  private async ensureSnapshotCategories(snapshot: OnlineHouseholdSnapshot) {
    if (snapshot.activeHouse) {
      await this.categories?.ensureDefaultCategoriesForHouse(snapshot.activeHouse.id);
    }
  }
}
