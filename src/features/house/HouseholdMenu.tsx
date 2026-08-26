import { Check, ChevronDown, Home, Settings, UserRound, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ProfileAvatar } from '../../components/ProfileAvatar/ProfileAvatar';
import { useHousehold } from './HouseContext';

export function HouseholdMenu({ mobile = false }: { mobile?: boolean }) {
  const { houses, activeHouse, members, activeMember, mode, switchHouse, switchMember } =
    useHousehold();
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<'main' | 'members' | 'houses'>('main');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function close(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', escape);
    };
  }, [open]);

  async function chooseHouse(id: string) {
    await switchHouse(id);
    setOpen(false);
  }

  async function chooseMember(id: string) {
    await switchMember(id);
    setOpen(false);
  }

  return (
    <div
      className={`household-menu-root ${mobile ? 'household-menu-root--mobile' : ''}`}
      ref={rootRef}
    >
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Abrir perfil de ${activeMember.displayName}`}
        className={mobile ? 'mobile-profile-trigger' : 'sidebar__profile'}
        onClick={() => {
          setOpen((current) => !current);
          setSection('main');
        }}
        type="button"
      >
        <ProfileAvatar profile={activeMember} size="compact" />
        {!mobile && (
          <>
            <span className="sidebar__profile-copy">
              <strong>{activeMember.displayName}</strong>
              <span>{activeHouse.name}</span>
            </span>
            <ChevronDown aria-hidden="true" size={17} />
          </>
        )}
      </button>

      {open && (
        <div className="household-menu" role="menu">
          <header>
            <ProfileAvatar profile={activeMember} size="compact" />
            <span>
              <strong>{activeMember.displayName}</strong>
              <small>{activeHouse.name}</small>
            </span>
          </header>
          {section === 'main' && (
            <div className="household-menu__actions">
              {mode === 'local' && (
                <button onClick={() => setSection('members')} role="menuitem" type="button">
                  <Users aria-hidden="true" size={17} /> Trocar perfil
                </button>
              )}
              <button onClick={() => setSection('houses')} role="menuitem" type="button">
                <Home aria-hidden="true" size={17} /> Trocar Casa
              </button>
              <Link onClick={() => setOpen(false)} role="menuitem" to="/configuracoes">
                <Settings aria-hidden="true" size={17} /> Configurações
              </Link>
            </div>
          )}
          {section === 'members' && (
            <div className="household-menu__choices">
              <span>Trocar perfil</span>
              {members.map((member) => (
                <button key={member.id} onClick={() => void chooseMember(member.id)} type="button">
                  <UserRound aria-hidden="true" size={17} />
                  <span>{member.displayName}</span>
                  {member.id === activeMember.id && <Check aria-hidden="true" size={17} />}
                </button>
              ))}
              <button onClick={() => setSection('main')} type="button">
                Voltar
              </button>
            </div>
          )}
          {section === 'houses' && (
            <div className="household-menu__choices">
              <span>Trocar Casa</span>
              {houses.map((house) => (
                <button key={house.id} onClick={() => void chooseHouse(house.id)} type="button">
                  <Home aria-hidden="true" size={17} />
                  <span>{house.name}</span>
                  {house.id === activeHouse.id && <Check aria-hidden="true" size={17} />}
                </button>
              ))}
              <button onClick={() => setSection('main')} type="button">
                Voltar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
