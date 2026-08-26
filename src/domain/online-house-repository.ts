import type { HouseMemberRole } from './house';
import type {
  HouseInviteReceipt,
  OnlineHouse,
  OnlineHouseMember,
  UserProfile,
} from './online-house';

export interface OnlineHouseRepository {
  getProfile(userId: string): Promise<UserProfile>;
  updateProfile(userId: string, displayName: string): Promise<UserProfile>;
  listHouses(userId: string): Promise<OnlineHouse[]>;
  listMembers(houseId: string): Promise<OnlineHouseMember[]>;
  createHouse(name: string): Promise<string>;
  updateHouse(houseId: string, name: string): Promise<void>;
  createInvite(houseId: string): Promise<HouseInviteReceipt>;
  acceptInvite(token: string): Promise<string>;
  updateMemberRole(houseId: string, userId: string, role: HouseMemberRole): Promise<void>;
  removeMember(houseId: string, userId: string): Promise<void>;
}
