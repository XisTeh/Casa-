import type { HouseRepository } from '../../domain/house-repository';
import type { House, HouseMember } from '../../domain/house';
import {
  ACTIVE_HOUSE_METADATA_KEY,
  ACTIVE_MEMBER_METADATA_KEY,
  CASAE_STORES,
  CasaeLocalDatabase,
  requestToPromise,
  transactionToPromise,
  type LocalMetadata,
} from '../local-database/CasaeLocalDatabase';

const clone = <T extends House | HouseMember>(value: T): T => ({ ...value });

export class LocalHouseRepository implements HouseRepository {
  readonly database: CasaeLocalDatabase;

  constructor(database: CasaeLocalDatabase | string = new CasaeLocalDatabase()) {
    this.database =
      typeof database === 'string'
        ? new CasaeLocalDatabase(database, { migrateLegacy: false })
        : database;
  }

  initialize() {
    return this.database.initialize();
  }

  async listHouses() {
    await this.initialize();
    const native = await this.database.getNativeDatabase();
    const houses = native
      ? await this.getAllNative<House>(native, CASAE_STORES.houses)
      : [...this.database.getMemoryDatabase().houses.values()];
    return houses.map(clone).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }

  async getHouse(id: string) {
    await this.initialize();
    const native = await this.database.getNativeDatabase();
    if (!native) {
      const house = this.database.getMemoryDatabase().houses.get(id);
      return house ? clone(house) : undefined;
    }
    const transaction = native.transaction(CASAE_STORES.houses, 'readonly');
    const house = await requestToPromise(
      transaction.objectStore(CASAE_STORES.houses).get(id) as IDBRequest<House | undefined>,
    );
    await transactionToPromise(transaction);
    return house ? clone(house) : undefined;
  }

  async saveHouse(house: House) {
    await this.initialize();
    const native = await this.database.getNativeDatabase();
    if (!native) {
      this.database.getMemoryDatabase().houses.set(house.id, clone(house));
      return clone(house);
    }
    await this.putNative(native, CASAE_STORES.houses, house);
    return clone(house);
  }

  async listMembers(houseId: string) {
    await this.initialize();
    const native = await this.database.getNativeDatabase();
    let members: HouseMember[];
    if (!native) {
      members = [...this.database.getMemoryDatabase().houseMembers.values()].filter(
        (member) => member.houseId === houseId,
      );
    } else {
      const transaction = native.transaction(CASAE_STORES.houseMembers, 'readonly');
      members = await requestToPromise(
        transaction
          .objectStore(CASAE_STORES.houseMembers)
          .index('houseId')
          .getAll(IDBKeyRange.only(houseId)) as IDBRequest<HouseMember[]>,
      );
      await transactionToPromise(transaction);
    }
    return members.map(clone).sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
  }

  async getMember(id: string) {
    await this.initialize();
    const native = await this.database.getNativeDatabase();
    if (!native) {
      const member = this.database.getMemoryDatabase().houseMembers.get(id);
      return member ? clone(member) : undefined;
    }
    const transaction = native.transaction(CASAE_STORES.houseMembers, 'readonly');
    const member = await requestToPromise(
      transaction.objectStore(CASAE_STORES.houseMembers).get(id) as IDBRequest<
        HouseMember | undefined
      >,
    );
    await transactionToPromise(transaction);
    return member ? clone(member) : undefined;
  }

  async saveMember(member: HouseMember) {
    await this.initialize();
    const native = await this.database.getNativeDatabase();
    if (!native) {
      this.database.getMemoryDatabase().houseMembers.set(member.id, clone(member));
      return clone(member);
    }
    await this.putNative(native, CASAE_STORES.houseMembers, member);
    return clone(member);
  }

  async removeMember(houseId: string, memberId: string) {
    await this.initialize();
    const current = await this.getMember(memberId);
    if (!current || current.houseId !== houseId) throw new Error('Este membro não existe mais.');
    const native = await this.database.getNativeDatabase();
    if (!native) {
      this.database.getMemoryDatabase().houseMembers.delete(memberId);
      return;
    }
    const transaction = native.transaction(CASAE_STORES.houseMembers, 'readwrite');
    transaction.objectStore(CASAE_STORES.houseMembers).delete(memberId);
    await transactionToPromise(transaction);
  }

  getActiveHouseId() {
    return this.getMetadata(ACTIVE_HOUSE_METADATA_KEY);
  }

  setActiveHouseId(houseId: string) {
    return this.setMetadata(ACTIVE_HOUSE_METADATA_KEY, houseId);
  }

  getActiveMemberId() {
    return this.getMetadata(ACTIVE_MEMBER_METADATA_KEY);
  }

  setActiveMemberId(memberId: string) {
    return this.setMetadata(ACTIVE_MEMBER_METADATA_KEY, memberId);
  }

  private async getMetadata(key: string): Promise<string | undefined> {
    await this.initialize();
    const native = await this.database.getNativeDatabase();
    const metadata = native
      ? await this.getNativeMetadata(native, key)
      : this.database.getMemoryDatabase().metadata.get(key);
    return typeof metadata?.value === 'string' ? metadata.value : undefined;
  }

  private async setMetadata(key: string, value: string) {
    await this.initialize();
    const metadata: LocalMetadata = { key, value, completedAt: new Date().toISOString() };
    const native = await this.database.getNativeDatabase();
    if (!native) {
      this.database.getMemoryDatabase().metadata.set(key, metadata);
      return;
    }
    await this.putNative(native, CASAE_STORES.metadata, metadata);
  }

  private async getAllNative<T>(database: IDBDatabase, storeName: string) {
    const transaction = database.transaction(storeName, 'readonly');
    const records = await requestToPromise(
      transaction.objectStore(storeName).getAll() as IDBRequest<T[]>,
    );
    await transactionToPromise(transaction);
    return records;
  }

  private async getNativeMetadata(database: IDBDatabase, key: string) {
    const transaction = database.transaction(CASAE_STORES.metadata, 'readonly');
    const metadata = await requestToPromise(
      transaction.objectStore(CASAE_STORES.metadata).get(key) as IDBRequest<
        LocalMetadata | undefined
      >,
    );
    await transactionToPromise(transaction);
    return metadata;
  }

  private async putNative(database: IDBDatabase, storeName: string, value: unknown) {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(value);
    await transactionToPromise(transaction);
  }
}
