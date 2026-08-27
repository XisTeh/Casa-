import type { AvatarCrop } from './profile-avatar';

export const LEGACY_HOUSE_ID = 'house-raabe-sidney';
export const LEGACY_HOUSE_NAME = 'Casa Raabe & Sidney';
export const LEGACY_MEMBER_ID = 'member-raabe-legacy';
export const LEGACY_MEMBER_NAME = 'Raabe';

export type House = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  createdByMemberId: string;
  isActive: boolean;
};

export type HouseMemberRole = 'owner' | 'member';
export type HouseMemberStatus = 'active' | 'inactive';

export type HouseMember = {
  id: string;
  houseId: string;
  displayName: string;
  avatarSeed: string;
  avatarBlob?: Blob;
  avatarSourceBlob?: Blob;
  avatarCrop?: AvatarCrop;
  avatarRevision?: number;
  avatarUpdatedAt?: string;
  avatarRemotePath?: string;
  avatarSourceRemotePath?: string;
  avatarSyncState?: 'local-only' | 'pending' | 'hydrating' | 'synced';
  role: HouseMemberRole;
  status: HouseMemberStatus;
  joinedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type ActiveHousehold = {
  houseId: string;
  memberId: string;
  memberName: string;
};
