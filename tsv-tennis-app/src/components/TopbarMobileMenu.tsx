import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isOrgaRole } from '../utils/roles';
import { routes } from './navigationRoutes';

interface TopbarMobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenMailComposer: () => void;
}

const TopbarMobileMenu = ({ isOpen, onClose, onOpenMailComposer }: TopbarMobileMenuProps) => {
  const { user } = useAuth();
  const isOrga = isOrgaRole(user?.role);

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" aria-hidden="true" />
      <div className="fixed inset-0 flex justify-start">
        <DialogPanel className="club-navigation-motion flex h-full w-72 max-w-[85vw] flex-col border-r border-[var(--hairline)] bg-white">
          <div className="flex items-center justify-between border-b border-[var(--hairline)] px-4 py-3">
            <DialogTitle className="text-base font-extrabold text-[var(--ink)]">Menü</DialogTitle>
            <button
              type="button"
              aria-label="Schließen"
              onClick={onClose}
              className="touch-control rounded-md text-[var(--body)] hover:bg-[var(--canvas-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
            >
              <XMarkIcon className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>
          <div className="flex flex-col gap-1 overflow-y-auto px-2 py-4">
            {routes.map(({ label, to, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={onClose}
                className={({ isActive }) =>
                  `touch-control flex items-center border-l-2 px-3 text-sm font-medium ${
                    isActive ? 'border-[var(--primary)] text-[var(--primary-active)]' : 'border-transparent text-[var(--body)] hover:bg-[var(--canvas-soft)] hover:text-[var(--ink)]'
                  } focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]`
                }
              >
                {label}
              </NavLink>
            ))}
            {isOrga && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenMailComposer();
                }}
                className="touch-control flex items-center border-l-2 border-transparent px-3 text-sm font-medium text-[var(--body)] hover:bg-[var(--canvas-soft)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
              >
                Rundmail
              </button>
            )}
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
};

export default TopbarMobileMenu;
