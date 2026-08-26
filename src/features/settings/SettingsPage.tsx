import {
  CalendarDays,
  Copy,
  Home,
  Info,
  KeyRound,
  LogOut,
  Mail,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { HouseMember } from '../../domain/house';
import { ProfileAvatar } from '../../components/ProfileAvatar/ProfileAvatar';
import { Button } from '../../components/Button/Button';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { useHousehold } from '../house/HouseContext';
import { HouseholdFormDialog } from './HouseholdFormDialog';
import { EditProfileDialog } from './EditProfileDialog';
import { RemoveMemberDialog } from './RemoveMemberDialog';
import { HouseInviteDialog } from './HouseInviteDialog';
import { JoinHouseDialog } from './JoinHouseDialog';
import type { HouseInviteReceipt } from '../../domain/online-house';
import { useOptionalAuth } from '../auth/AuthContext';
import { PwaInstallPanel } from '../../pwa/PwaInstallPanel';
import { useShoppingList } from '../shopping-list/ShoppingListContext';
import { useProducts } from '../products/ProductContext';

type DialogState =
  'edit-house' | 'create-house' | 'add-member' | 'edit-profile' | HouseMember | null;
const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' });

export function SettingsPage() {
  const household = useHousehold();
  const auth = useOptionalAuth();
  const { syncStatus } = useShoppingList();
  const { syncStatus: catalogSyncStatus } = useProducts();
  const { houses, activeHouse, members, activeMember } = household;
  const [dialog, setDialog] = useState<DialogState>(null);
  const [removing, setRemoving] = useState<HouseMember | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [invite, setInvite] = useState<HouseInviteReceipt | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [joining, setJoining] = useState(false);
  const isOwner = activeMember.role === 'owner';
  const totalPending = syncStatus.pending + catalogSyncStatus.pending;
  const generalSyncState =
    syncStatus.state === 'offline' || catalogSyncStatus.state === 'offline'
      ? 'offline'
      : syncStatus.state === 'error' || catalogSyncStatus.state === 'error'
        ? 'error'
        : syncStatus.state === 'syncing' || catalogSyncStatus.state === 'syncing'
          ? 'syncing'
          : totalPending
            ? 'pending'
            : 'synced';

  useEffect(() => {
    if (window.location.hash !== '#aplicativo') return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById('aplicativo')?.scrollIntoView?.({ block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="settings-page">
      <PageHeader
        description={
          household.mode === 'remote'
            ? 'Gerencie sua conta, Casas e pessoas com acesso.'
            : 'Gerencie a Casa ativa, seus membros e esta identidade local.'
        }
        eyebrow="Configurações"
        title="Casa e perfis"
      />
      {feedback && (
        <p className="settings-feedback" role="status">
          {feedback}
        </p>
      )}
      <section className="settings-card settings-house" aria-labelledby="settings-house-title">
        <header>
          <span className="settings-card__icon">
            <Home aria-hidden="true" size={21} />
          </span>
          <div>
            <p className="eyebrow">Sua Casa</p>
            <h2 id="settings-house-title">{activeHouse.name}</h2>
          </div>
          {isOwner && (
            <Button onClick={() => setDialog('edit-house')} variant="secondary">
              <Pencil aria-hidden="true" size={17} /> Editar Casa
            </Button>
          )}
        </header>
        <div className="settings-house__facts">
          <span>
            <Users aria-hidden="true" size={17} />
            <strong>{members.length}</strong> {members.length === 1 ? 'membro' : 'membros'}
          </span>
          <span>
            <CalendarDays aria-hidden="true" size={17} />
            Criada em {dateFormatter.format(new Date(activeHouse.createdAt))}
          </span>
        </div>
        <div className="settings-members">
          <div className="settings-section-title">
            <div>
              <h3>Membros</h3>
              <p>
                {household.mode === 'remote'
                  ? 'Pessoas com acesso a esta Casa.'
                  : 'Perfis que participam desta Casa local.'}
              </p>
            </div>
            {isOwner && household.mode === 'local' && (
              <Button onClick={() => setDialog('add-member')} variant="secondary">
                <Plus aria-hidden="true" size={17} /> Adicionar membro
              </Button>
            )}
            {isOwner && household.mode === 'remote' && household.createInvite && (
              <Button
                loading={inviteLoading}
                onClick={async () => {
                  setInviteLoading(true);
                  try {
                    setInvite(await household.createInvite!());
                  } finally {
                    setInviteLoading(false);
                  }
                }}
                variant="secondary"
              >
                <Copy aria-hidden="true" size={17} /> Convidar membro
              </Button>
            )}
          </div>
          <div className="settings-members__list">
            {members.map((member) => (
              <article key={member.id}>
                <ProfileAvatar profile={member} size="member" />
                <span className="settings-members__details">
                  <strong>{member.displayName}</strong>
                  <small>
                    {member.role === 'owner' ? 'Proprietário' : 'Membro'}
                    {member.id === activeMember.id ? ' · Perfil ativo' : ''}
                  </small>
                </span>
                {isOwner && (household.mode === 'local' || member.id !== activeMember.id) && (
                  <div>
                    <button
                      aria-label={`Editar ${member.displayName}`}
                      onClick={() => setDialog(member)}
                      type="button"
                    >
                      <Pencil aria-hidden="true" size={17} />
                    </button>
                    <button
                      aria-label={`Remover ${member.displayName}`}
                      onClick={() => setRemoving(member)}
                      type="button"
                    >
                      <Trash2 aria-hidden="true" size={17} />
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>
      <div className="settings-grid">
        <section className="settings-card">
          <header>
            <span className="settings-card__icon">
              <UserRound aria-hidden="true" size={21} />
            </span>
            <div>
              <p className="eyebrow">Seu perfil</p>
              <h2>{activeMember.displayName}</h2>
            </div>
          </header>
          <div className="settings-profile">
            <ProfileAvatar profile={activeMember} size="profile" />
            <span className="settings-profile__details">
              <strong>{activeMember.role === 'owner' ? 'Proprietário' : 'Membro'}</strong>
              <small>
                {household.mode === 'remote'
                  ? 'Perfil global da sua conta'
                  : 'Identidade local desta Casa'}
              </small>
            </span>
            <Button onClick={() => setDialog('edit-profile')} variant="secondary">
              Editar perfil
            </Button>
          </div>
        </section>
        <section className="settings-card">
          <header>
            <span className="settings-card__icon">
              <Home aria-hidden="true" size={21} />
            </span>
            <div>
              <p className="eyebrow">Casas</p>
              <h2>Casa ativa</h2>
            </div>
          </header>
          <div className="settings-houses">
            {houses.map((house) => (
              <button
                className={house.id === activeHouse.id ? 'is-active' : ''}
                disabled={house.id === activeHouse.id}
                key={house.id}
                onClick={() => void household.switchHouse(house.id)}
                type="button"
              >
                <Home aria-hidden="true" size={18} />
                <span>
                  <strong>{house.name}</strong>
                  <small>{house.id === activeHouse.id ? 'Ativa' : 'Trocar para esta Casa'}</small>
                </span>
                {house.id === activeHouse.id && <ShieldCheck aria-hidden="true" size={18} />}
              </button>
            ))}
          </div>
          <Button onClick={() => setDialog('create-house')} variant="secondary">
            <Plus aria-hidden="true" size={17} /> Nova Casa
          </Button>
          {household.mode === 'remote' && household.joinHouse && (
            <Button onClick={() => setJoining(true)} variant="ghost">
              <KeyRound aria-hidden="true" size={17} /> Entrar com convite
            </Button>
          )}
        </section>
      </div>
      <section className="settings-card settings-app" id="aplicativo">
        <header>
          <span className="settings-card__icon">
            <Info aria-hidden="true" size={21} />
          </span>
          <div>
            <p className="eyebrow">{household.mode === 'remote' ? 'Conta' : 'Aplicativo'}</p>
            <h2>{household.mode === 'remote' ? 'Sessão do Casaê' : 'Casaê local'}</h2>
          </div>
        </header>
        {household.mode === 'remote' ? (
          <>
            <p className="settings-account-email">
              <Mail aria-hidden="true" size={17} /> {household.accountEmail}
            </p>
            <small>
              Sua identidade, Casas, Lista, categorias, produtos e mercados usam uma sessão
              protegida. Compras, histórico, gastos e orçamento continuam locais neste dispositivo.
            </small>
            <p className="settings-sync-status" role="status">
              {generalSyncState === 'offline'
                ? totalPending
                  ? `Offline · ${totalPending} alterações pendentes`
                  : 'Offline'
                : generalSyncState === 'syncing'
                  ? 'Sincronizando…'
                  : totalPending
                    ? `${totalPending} alterações pendentes`
                    : generalSyncState === 'error'
                      ? 'Falha temporária de sincronização'
                      : 'Sincronizado'}
            </p>
            {auth && (
              <Button onClick={() => void auth.signOut()} variant="secondary">
                <LogOut aria-hidden="true" size={17} /> Sair da conta
              </Button>
            )}
          </>
        ) : (
          <>
            <p>
              Dados guardados neste dispositivo pelo IndexedDB. Aplicação web instalável/PWA, versão
              0.1.0.
            </p>
            <small>
              Os perfis locais simulam identidade; não há login, conta online ou sincronização nesta
              etapa.
            </small>
          </>
        )}
        <div className="settings-app__install" aria-label="Aplicativo">
          <h3>Aplicativo</h3>
          <PwaInstallPanel />
        </div>
      </section>
      {dialog === 'edit-house' && (
        <HouseholdFormDialog
          initialName={activeHouse.name}
          mode="edit-house"
          onClose={() => setDialog(null)}
          onSave={(name) => household.updateHouse(name)}
        />
      )}
      {dialog === 'create-house' && (
        <HouseholdFormDialog
          mode="create-house"
          onClose={() => setDialog(null)}
          onSave={(name) => household.createHouse(name)}
        />
      )}
      {dialog === 'add-member' && (
        <HouseholdFormDialog
          mode="member"
          onClose={() => setDialog(null)}
          onSave={(name, role) => household.addMember(name, role)}
        />
      )}
      {dialog === 'edit-profile' && (
        <EditProfileDialog
          member={activeMember}
          onClose={() => setDialog(null)}
          onSave={async (name, avatar) => {
            await household.updateMember(activeMember.id, name, activeMember.role, avatar);
            setFeedback('Perfil atualizado.');
          }}
        />
      )}
      {typeof dialog === 'object' && dialog && (
        <HouseholdFormDialog
          canChangeName={household.mode === 'local'}
          member={dialog}
          mode="member"
          onClose={() => setDialog(null)}
          onSave={(name, role) => household.updateMember(dialog.id, name, role)}
        />
      )}
      {removing && (
        <RemoveMemberDialog
          member={removing}
          onClose={() => setRemoving(null)}
          onConfirm={() => household.removeMember(removing.id)}
        />
      )}
      {invite && (
        <HouseInviteDialog
          houseName={activeHouse.name}
          invite={invite}
          onClose={() => setInvite(null)}
        />
      )}
      {joining && household.joinHouse && (
        <JoinHouseDialog onClose={() => setJoining(false)} onJoin={household.joinHouse} />
      )}
    </div>
  );
}
