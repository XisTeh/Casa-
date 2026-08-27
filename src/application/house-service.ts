import {
  LEGACY_HOUSE_ID,
  type House,
  type HouseMember,
  type HouseMemberRole,
} from '../domain/house';
import type { HouseRepository } from '../domain/house-repository';
import type { ProfileAvatarData } from '../domain/profile-avatar';

export interface DefaultCategoryInitializer {
  ensureDefaultCategoriesForHouse(houseId: string): Promise<unknown>;
}

function createId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function validName(value: string, label: string) {
  const name = value.trim();
  if (!name) throw new Error(`Informe ${label}.`);
  return name;
}

export type HouseholdSnapshot = {
  houses: House[];
  activeHouse: House;
  members: HouseMember[];
  activeMember: HouseMember;
};

export class HouseService {
  constructor(
    private readonly repository: HouseRepository,
    private readonly categories: DefaultCategoryInitializer,
  ) {}

  async getSnapshot(): Promise<HouseholdSnapshot> {
    await this.repository.initialize();
    const houses = await this.repository.listHouses();
    const storedHouseId = await this.repository.getActiveHouseId();
    const activeHouse = houses.find((house) => house.id === storedHouseId) ?? houses[0];
    if (!activeHouse) throw new Error('Nenhuma Casa local está disponível.');
    const members = (await this.repository.listMembers(activeHouse.id)).filter(
      (member) => member.status === 'active',
    );
    const storedMemberId = await this.repository.getActiveMemberId();
    const activeMember = members.find((member) => member.id === storedMemberId) ?? members[0];
    if (!activeMember) throw new Error('A Casa ativa não possui membros.');
    if (activeHouse.id !== LEGACY_HOUSE_ID) {
      await this.categories.ensureDefaultCategoriesForHouse(activeHouse.id);
    }
    if (storedHouseId !== activeHouse.id) await this.repository.setActiveHouseId(activeHouse.id);
    if (storedMemberId !== activeMember.id)
      await this.repository.setActiveMemberId(activeMember.id);
    return { houses, activeHouse, members, activeMember };
  }

  async createHouse(name: string, sourceMember: HouseMember) {
    const cleanName = validName(name, 'o nome da Casa');
    const now = new Date().toISOString();
    const memberId = createId('member');
    const house: House = {
      id: createId('house'),
      name: cleanName,
      createdAt: now,
      updatedAt: now,
      createdByMemberId: memberId,
      isActive: true,
    };
    const owner: HouseMember = {
      id: memberId,
      houseId: house.id,
      displayName: sourceMember.displayName,
      avatarSeed: sourceMember.avatarSeed,
      role: 'owner',
      status: 'active',
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.saveHouse(house);
    await this.repository.saveMember(owner);
    await this.repository.setActiveHouseId(house.id);
    await this.repository.setActiveMemberId(owner.id);
    return this.getSnapshot();
  }

  async updateHouse(houseId: string, actorId: string, name: string) {
    await this.requireOwner(houseId, actorId);
    const house = await this.repository.getHouse(houseId);
    if (!house) throw new Error('Esta Casa não existe mais.');
    await this.repository.saveHouse({
      ...house,
      name: validName(name, 'o nome da Casa'),
      updatedAt: new Date().toISOString(),
    });
    return this.getSnapshot();
  }

  async switchHouse(houseId: string) {
    const house = await this.repository.getHouse(houseId);
    if (!house || !house.isActive) throw new Error('Esta Casa não está disponível.');
    const members = (await this.repository.listMembers(houseId)).filter(
      (member) => member.status === 'active',
    );
    if (!members[0]) throw new Error('Esta Casa não possui membros ativos.');
    await this.repository.setActiveHouseId(houseId);
    await this.repository.setActiveMemberId(members[0].id);
    return this.getSnapshot();
  }

  async switchMember(houseId: string, memberId: string) {
    const member = await this.repository.getMember(memberId);
    if (!member || member.houseId !== houseId || member.status !== 'active') {
      throw new Error('Este perfil não pertence à Casa ativa.');
    }
    await this.repository.setActiveMemberId(memberId);
    return this.getSnapshot();
  }

  async addMember(houseId: string, actorId: string, displayName: string, role: HouseMemberRole) {
    await this.requireOwner(houseId, actorId);
    const now = new Date().toISOString();
    await this.repository.saveMember({
      id: createId('member'),
      houseId,
      displayName: validName(displayName, 'o nome do membro'),
      avatarSeed: createId('avatar'),
      role,
      status: 'active',
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    return this.getSnapshot();
  }

  async updateMember(
    houseId: string,
    actorId: string,
    memberId: string,
    changes: { displayName: string; role: HouseMemberRole; avatar?: ProfileAvatarData | null },
  ) {
    const actor = await this.requireMember(houseId, actorId);
    const member = await this.requireMember(houseId, memberId);
    if (actor.role !== 'owner' && actor.id !== member.id) {
      throw new Error('Somente proprietários podem editar outros membros.');
    }
    if (actor.role !== 'owner' && changes.role !== member.role) {
      throw new Error('Somente proprietários podem alterar funções.');
    }
    if (member.role === 'owner' && changes.role !== 'owner') {
      const owners = (await this.repository.listMembers(houseId)).filter(
        (candidate) => candidate.status === 'active' && candidate.role === 'owner',
      );
      if (owners.length === 1)
        throw new Error('Transfira a função antes de remover o único owner.');
    }
    const avatarChanges =
      changes.avatar === undefined
        ? {}
        : changes.avatar
          ? changes.avatar
          : { avatarBlob: undefined, avatarSourceBlob: undefined, avatarCrop: undefined };
    await this.repository.saveMember({
      ...member,
      displayName: validName(changes.displayName, 'o nome do membro'),
      role: changes.role,
      ...avatarChanges,
      updatedAt: new Date().toISOString(),
    });
    return this.getSnapshot();
  }

  async removeMember(houseId: string, actorId: string, memberId: string) {
    await this.requireOwner(houseId, actorId);
    const member = await this.requireMember(houseId, memberId);
    const members = (await this.repository.listMembers(houseId)).filter(
      (candidate) => candidate.status === 'active',
    );
    if (members.length === 1) throw new Error('Uma Casa precisa ter pelo menos um membro.');
    if (
      member.role === 'owner' &&
      members.filter((candidate) => candidate.role === 'owner').length === 1
    ) {
      throw new Error('Transfira a função antes de remover o único owner.');
    }
    await this.repository.removeMember(houseId, memberId);
    if ((await this.repository.getActiveMemberId()) === memberId) {
      await this.repository.setActiveMemberId(
        members.find((candidate) => candidate.id !== memberId)!.id,
      );
    }
    return this.getSnapshot();
  }

  private async requireMember(houseId: string, memberId: string) {
    const member = await this.repository.getMember(memberId);
    if (!member || member.houseId !== houseId || member.status !== 'active') {
      throw new Error('Este membro não pertence à Casa ativa.');
    }
    return member;
  }

  private async requireOwner(houseId: string, memberId: string) {
    const member = await this.requireMember(houseId, memberId);
    if (member.role !== 'owner')
      throw new Error('Somente proprietários podem fazer esta alteração.');
    return member;
  }
}
