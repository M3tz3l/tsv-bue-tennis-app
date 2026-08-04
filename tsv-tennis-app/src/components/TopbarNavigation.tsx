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
        className="club-navigation-motion fixed inset-x-0 top-0 z-40 border-b-2 border-[var(--hairline-strong)] bg-[var(--canvas)]"
      >
        <div className="mx-auto flex h-12 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              aria-label="Menü öffnen"
              aria-expanded={isMobileMenuOpen}
              onClick={() => setIsMobileMenuOpen(true)}
              className="touch-control rounded-md text-[var(--body)] hover:bg-[var(--canvas-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] lg:hidden"
            >
              <Bars3Icon className="h-6 w-6" aria-hidden="true" />
            </button>
            <img src={TSV_Logo} alt="TSV BÜ Tennis Logo" className="h-9 w-auto" />
          </div>

          <div className="hidden items-center gap-1 lg:flex">
            {routes.map(({ label, to, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `touch-control inline-flex items-center px-3 text-sm font-medium ${
                    isActive ? 'text-[var(--primary-active)]' : 'text-[var(--muted)] hover:text-[var(--ink)]'
                  } focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]`
                }
              >
                {label}
              </NavLink>
            ))}
            {isOrga && (
              <button
                type="button"
                onClick={onOpenMailComposer}
                className="touch-control inline-flex items-center px-3 text-sm font-medium text-[var(--muted)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
              >
                Rundmail
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={logout}
            aria-label="Abmelden"
            className="touch-control inline-flex items-center justify-center rounded-md px-2 text-[var(--muted)] hover:bg-[var(--canvas-soft)] hover:text-[var(--error)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
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
