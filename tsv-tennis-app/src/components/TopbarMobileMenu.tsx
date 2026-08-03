import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import {
  ArrowRightOnRectangleIcon,
  EnvelopeIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isOrgaRole } from '../utils/roles';
import { routes } from './TopbarNavigation';

interface TopbarMobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenMailComposer: () => void;
}

const TopbarMobileMenu = ({ isOpen, onClose, onOpenMailComposer }: TopbarMobileMenuProps) => {
  const { user, logout } = useAuth();
  const isOrga = isOrgaRole(user?.role);

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" aria-hidden="true" />
      <div className="fixed inset-0 flex justify-end">
        <DialogPanel className="club-navigation-motion flex h-full w-72 max-w-[85vw] flex-col bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <DialogTitle className="text-base font-bold text-gray-900">Menü</DialogTitle>
            <button
              type="button"
              aria-label="Schließen"
              onClick={onClose}
              className="touch-control rounded-md text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
            >
              <XMarkIcon className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>
          <div className="flex flex-col gap-1 overflow-y-auto px-2 py-4">
            <p className="px-3 pb-2 text-sm text-slate-600">{user?.name || user?.email || 'Mitglied'}</p>
            {routes.map(({ label, to, Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={onClose}
                className={({ isActive }) =>
                  `touch-control flex items-center gap-3 rounded-md px-3 text-sm font-medium ${
                    isActive ? 'bg-emerald-50 text-emerald-700' : 'text-slate-700 hover:bg-slate-100'
                  } focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400`
                }
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
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
                className="touch-control flex items-center gap-3 rounded-md px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
              >
                <EnvelopeIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
                Rundmail
              </button>
            )}
            <button
              type="button"
              onClick={logout}
              className="touch-control flex items-center gap-3 rounded-md px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
            >
              <ArrowRightOnRectangleIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
              Abmelden
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
};

export default TopbarMobileMenu;
