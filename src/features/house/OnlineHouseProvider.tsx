import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type {
  OnlineHouseService,
  OnlineHouseholdSnapshot,
} from '../../application/online-house-service';
import type { HouseMemberRole } from '../../domain/house';
import { ErrorState, LoadingState } from '../../components/StateView/StateView';
import { houseContext } from './HouseContext';
import { OnboardingPage } from './OnboardingPage';

export function OnlineHouseProvider({
  children,
  service,
  userId,
  email,
}: {
  children: ReactNode;
  service: OnlineHouseService;
  userId: string;
  email: string;
}) {
  const [snapshot, setSnapshot] = useState<OnlineHouseholdSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    service
      .getSnapshot(userId)
      .then((loaded) => active && setSnapshot(loaded))
      .catch(() => active && setError('Não foi possível carregar suas Casas.'))
      .finally(() => active && setIsLoading(false));
    return () => {
      active = false;
    };
  }, [service, userId]);

  const run = useCallback(async (operation: () => Promise<OnlineHouseholdSnapshot>) => {
    try {
      const updated = await operation();
      setSnapshot(updated);
      setError(null);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Não foi possível salvar.';
      setError(message);
      throw caught;
    }
  }, []);

  const value = useMemo(() => {
    if (!snapshot?.activeHouse || !snapshot.activeMember) return null;
    const { activeHouse, activeMember } = snapshot;
    return {
      houses: snapshot.houses,
      activeHouse,
      members: snapshot.members,
      activeMember,
      isLoading,
      error,
      mode: 'remote' as const,
      accountEmail: email,
      createHouse: (name: string) => run(() => service.createHouse(userId, name)),
      updateHouse: (name: string) => run(() => service.updateHouse(userId, activeHouse.id, name)),
      switchHouse: (houseId: string) => run(() => service.switchHouse(userId, houseId)),
      switchMember: async () => {
        throw new Error('Cada pessoa usa sua própria conta no modo online.');
      },
      addMember: async () => {
        throw new Error('Use um convite para adicionar membros.');
      },
      updateMember: (
        memberId: string,
        displayName: string,
        role: HouseMemberRole,
        avatarBlob?: Blob | null,
      ) =>
        run(() =>
          service.updateMember(userId, activeHouse.id, memberId, {
            displayName,
            role,
            ...(avatarBlob !== undefined ? { avatarBlob } : {}),
          }),
        ),
      removeMember: (memberId: string) =>
        run(() => service.removeMember(userId, activeHouse.id, memberId)),
      createInvite: () => service.createInvite(activeHouse.id),
      joinHouse: (token: string) => run(() => service.acceptInvite(userId, token)),
    };
  }, [email, error, isLoading, run, service, snapshot, userId]);

  if (isLoading || !snapshot)
    return error ? (
      <ErrorState description={error} />
    ) : (
      <LoadingState description="Restaurando sua conta e suas Casas…" />
    );
  if (!snapshot.activeHouse || !snapshot.activeMember)
    return (
      <OnboardingPage
        displayName={snapshot.profile.displayName}
        error={error}
        onCreate={(name) => run(() => service.createHouse(userId, name))}
        onJoin={(token) => run(() => service.acceptInvite(userId, token))}
      />
    );
  return <houseContext.Provider value={value!}>{children}</houseContext.Provider>;
}
