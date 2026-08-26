import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { HouseService, HouseholdSnapshot } from '../../application/house-service';
import { defaultHouseService } from '../../app/app-services';
import type { HouseMemberRole } from '../../domain/house';
import { ErrorState, LoadingState } from '../../components/StateView/StateView';
import { houseContext } from './HouseContext';

export function HouseProvider({
  children,
  service = defaultHouseService,
}: {
  children: ReactNode;
  service?: HouseService;
}) {
  const [snapshot, setSnapshot] = useState<HouseholdSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    service
      .getSnapshot()
      .then((loaded) => {
        if (current) {
          setSnapshot(loaded);
          setError(null);
        }
      })
      .catch(() => current && setError('Não foi possível abrir a Casa local.'))
      .finally(() => current && setIsLoading(false));
    return () => {
      current = false;
    };
  }, [service]);

  const run = useCallback(async (operation: () => Promise<HouseholdSnapshot>) => {
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
    if (!snapshot) return null;
    const { activeHouse, activeMember } = snapshot;
    return {
      ...snapshot,
      isLoading,
      error,
      mode: 'local' as const,
      createHouse: (name: string) => run(() => service.createHouse(name, activeMember)),
      updateHouse: (name: string) =>
        run(() => service.updateHouse(activeHouse.id, activeMember.id, name)),
      switchHouse: (houseId: string) => run(() => service.switchHouse(houseId)),
      switchMember: (memberId: string) => run(() => service.switchMember(activeHouse.id, memberId)),
      addMember: (displayName: string, role: HouseMemberRole) =>
        run(() => service.addMember(activeHouse.id, activeMember.id, displayName, role)),
      updateMember: (
        memberId: string,
        displayName: string,
        role: HouseMemberRole,
        avatarBlob?: Blob | null,
      ) =>
        run(() =>
          service.updateMember(activeHouse.id, activeMember.id, memberId, {
            displayName,
            role,
            ...(avatarBlob !== undefined ? { avatarBlob } : {}),
          }),
        ),
      removeMember: (memberId: string) =>
        run(() => service.removeMember(activeHouse.id, activeMember.id, memberId)),
    };
  }, [error, isLoading, run, service, snapshot]);

  if (!value) {
    return error ? (
      <ErrorState description={error} />
    ) : (
      <LoadingState description="Preparando a Casa e os perfis locais…" />
    );
  }

  return <houseContext.Provider value={value}>{children}</houseContext.Provider>;
}
