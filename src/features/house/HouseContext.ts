import { createContext, useContext } from 'react';
import type { House, HouseMember, HouseMemberRole } from '../../domain/house';
import type { HouseInviteReceipt } from '../../domain/online-house';
import type { ProfileAvatarData } from '../../domain/profile-avatar';

export type HouseContextValue = {
  houses: House[];
  activeHouse: House;
  members: HouseMember[];
  activeMember: HouseMember;
  isLoading: boolean;
  error: string | null;
  mode: 'local' | 'remote';
  accountEmail?: string;
  createHouse(name: string): Promise<void>;
  updateHouse(name: string): Promise<void>;
  switchHouse(houseId: string): Promise<void>;
  switchMember(memberId: string): Promise<void>;
  addMember(displayName: string, role: HouseMemberRole): Promise<void>;
  updateMember(
    memberId: string,
    displayName: string,
    role: HouseMemberRole,
    avatar?: ProfileAvatarData | null,
  ): Promise<void>;
  removeMember(memberId: string): Promise<void>;
  createInvite?(): Promise<HouseInviteReceipt>;
  joinHouse?(token: string): Promise<void>;
};

export const houseContext = createContext<HouseContextValue | null>(null);

export function useHousehold() {
  const value = useContext(houseContext);
  if (!value) throw new Error('HouseProvider não encontrado.');
  return value;
}
