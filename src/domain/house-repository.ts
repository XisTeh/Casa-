import type { House, HouseMember } from './house';

export interface HouseRepository {
  initialize(): Promise<void>;
  listHouses(): Promise<House[]>;
  getHouse(id: string): Promise<House | undefined>;
  saveHouse(house: House): Promise<House>;
  listMembers(houseId: string): Promise<HouseMember[]>;
  getMember(id: string): Promise<HouseMember | undefined>;
  saveMember(member: HouseMember): Promise<HouseMember>;
  removeMember(houseId: string, memberId: string): Promise<void>;
  getActiveHouseId(): Promise<string | undefined>;
  setActiveHouseId(houseId: string): Promise<void>;
  getActiveMemberId(): Promise<string | undefined>;
  setActiveMemberId(memberId: string): Promise<void>;
}
