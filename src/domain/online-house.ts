import type { HouseMemberRole, HouseMemberStatus } from './house';

export type UserProfile = {
  id: string;
  displayName: string;
  avatarPath: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OnlineHouse = {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type OnlineHouseMember = {
  id: string;
  houseId: string;
  userId: string;
  role: HouseMemberRole;
  status: HouseMemberStatus;
  joinedAt: string;
  profile: UserProfile;
};

export type HouseInviteReceipt = {
  token: string;
  expiresAt: string;
};
