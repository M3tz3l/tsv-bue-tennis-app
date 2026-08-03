import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { ArrowRightOnRectangleIcon, Bars3Icon } from '@heroicons/react/24/outline';
import { useAuth } from '../context/AuthContext';
import { isOrgaRole } from '../utils/roles';
import { routes } from './navigationRoutes';
import TopbarMobileMenu from './TopbarMobileMenu';
import TSV_Logo from '../assets/TSV_Tennis.svg';

interface TopbarNavigationProps {
  onOpenMailComposer: () => void;
}

const TopbarNavigation = ({ onOpenMailComposer }: TopbarNavigationProps) => {
  const { user, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const isOrga = isOrgaRole(user?.role);

  return (
    <>
      <nav
        aria-label="Clubnavigation"
        className="club-navigation-motion fixed inset-x-0 top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur"
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
            <img src={TSV_Logo} alt="TSV BÜ Tennis Logo" className="h-10 w-auto" />
          </div>

          <div className="hidden items-stretch gap-1 self-stretch lg:flex">
            {routes.map(({ label, to, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `touch-control inline-flex items-center border-b-2 px-3 text-sm font-semibold uppercase tracking-wide ${
                    isActive ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-600 hover:text-slate-900'
                  } focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400`
                }
              >
                {label}
              </NavLink>
            ))}
            {isOrga && (
              <button
                type="button"
                onClick={onOpenMailComposer}
                className="touch-control inline-flex items-center border-b-2 border-transparent px-3 text-sm font-semibold uppercase tracking-wide text-purple-700 hover:text-purple-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
              >
                Rundmail
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={logout}
            aria-label="Abmelden"
            className="touch-control inline-flex items-center justify-center rounded-md px-2 text-slate-600 hover:bg-slate-100 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
          >
            <ArrowRightOnRectangleIcon className="h-5 w-5" aria-hidden="true" />
          </button>
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
