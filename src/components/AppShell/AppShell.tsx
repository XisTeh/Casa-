import { NavLink, Outlet } from 'react-router-dom';
import {
  desktopNavigationGroups,
  mobileNavigation,
  type NavigationItem,
} from '../../app/navigation';
import { Brand } from '../Brand/Brand';
import { HouseholdMenu } from '../../features/house/HouseholdMenu';

function NavigationLink({ item, mobile = false }: { item: NavigationItem; mobile?: boolean }) {
  const Icon = item.icon;
  const navigationClass = mobile ? 'bottom-nav' : 'sidebar';

  return (
    <NavLink
      className={({ isActive }) =>
        [
          mobile ? 'bottom-nav__link' : 'sidebar__link',
          item.emphasized ? `${navigationClass}__link--emphasized` : '',
          isActive ? 'is-active' : '',
        ]
          .filter(Boolean)
          .join(' ')
      }
      end={item.path === '/'}
      to={item.path}
    >
      <span
        className={[
          `${navigationClass}__icon`,
          item.emphasized ? `${navigationClass}__icon--emphasized` : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <Icon aria-hidden="true" size={mobile ? 22 : 20} strokeWidth={1.9} />
      </span>
      <span>{item.label}</span>
    </NavLink>
  );
}

export function AppShell() {
  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Navegação principal">
        <div className="sidebar__brand">
          <Brand descriptor="Vida em casa" />
        </div>
        <nav className="sidebar__navigation" aria-label="Seções do Casaê">
          {desktopNavigationGroups.map((group) => (
            <div className="sidebar__group" key={group.label}>
              <span className="sidebar__group-label">{group.label}</span>
              <div className="sidebar__group-links">
                {group.items.map((item) => (
                  <NavigationLink item={item} key={item.path} />
                ))}
              </div>
            </div>
          ))}
        </nav>
        <HouseholdMenu />
      </aside>

      <div className="app-shell__body">
        <header className="mobile-header">
          <div className="mobile-header__inner">
            <Brand />
            <HouseholdMenu mobile />
          </div>
        </header>

        <main className="app-shell__content" id="conteudo-principal">
          <Outlet />
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Navegação principal">
        <div className="bottom-nav__inner">
          {mobileNavigation.map((item) => (
            <NavigationLink item={item} key={item.path} mobile />
          ))}
        </div>
      </nav>
    </div>
  );
}
