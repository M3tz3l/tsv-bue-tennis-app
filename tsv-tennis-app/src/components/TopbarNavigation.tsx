import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import {
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  CalendarDaysIcon,
  ClockIcon,
  EnvelopeIcon,
  HomeIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../context/AuthContext';
import { isOrgaRole } from '../utils/roles';
import TopbarMobileMenu from './TopbarMobileMenu';

interface TopbarNavigationProps {
  onOpenMailComposer: () => void;
}

export const routes = [
  { label: 'Übersicht', to: '/dashboard', Icon: HomeIcon, end: true },
  { label: 'Arbeitsstunden', to: '/dashboard/arbeitsstunden', Icon: ClockIcon, end: false },
  { label: 'Veranstaltungen', to: '/dashboard/veranstaltungen', Icon: CalendarDaysIcon, end: false },
] as const;

const TopbarNavigation = ({ onOpenMailComposer }: TopbarNavigationProps) => {
  const { user, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const isOrga = isOrgaRole(user?.role);
  const displayName = user?.name || user?.email || 'Mitglied';

  return (
    <>
      <nav
        aria-label="Clubnavigation"
        className="club-navigation-motion fixed inset-x-0 top-0 z-40 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur"
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              aria-label="Menü öffnen"
              aria-expanded={isMobileMenuOpen}
              onClick={() => setIsMobileMenuOpen(true)}
              className="touch-control rounded-md text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 lg:hidden"
            >
              <Bars3Icon className="h-6 w-6" aria-hidden="true" />
            </button>
            <span className="truncate text-base font-bold text-gray-900">TSV BÜ Tennis</span>
          </div>

          <div className="hidden items-center gap-1 lg:flex">
            {routes.map(({ label, to, Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `touch-control flex items-center gap-2 rounded-md px-3 text-sm font-medium ${
                    isActive ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-100'
                  } focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400`
                }
              >
                {() => (
                  <>
                    <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span>{label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>

          <Menu>
            <MenuButton
              aria-label={displayName}
              className="touch-control flex items-center gap-2 rounded-md px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
            >
              <UserCircleIcon className="h-6 w-6 shrink-0" aria-hidden="true" />
              <span className="hidden max-w-[10rem] truncate sm:inline">{displayName}</span>
            </MenuButton>
            <MenuItems
              anchor="bottom end"
              className="z-50 mt-2 w-56 rounded-md border border-slate-200 bg-white p-1 shadow-lg"
            >
              {isOrga && (
                <MenuItem>
                  <button
                    type="button"
                    onClick={onOpenMailComposer}
                    className="touch-control flex w-full items-center gap-2 rounded-md px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
                  >
                    <EnvelopeIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
                    Rundmail
                  </button>
                </MenuItem>
              )}
              <MenuItem>
                <button
                  type="button"
                  onClick={logout}
                  className="touch-control flex w-full items-center gap-2 rounded-md px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
                >
                  <ArrowRightOnRectangleIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  Abmelden
                </button>
              </MenuItem>
            </MenuItems>
          </Menu>
        </div>
      </nav>
      <TopbarMobileMenu
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        onOpenMailComposer={() => {
          setIsMobileMenuOpen(false);
          onOpenMailComposer();
        }}
      />
    </>
  );
};

export default TopbarNavigation;
