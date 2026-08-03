import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
    ArrowRightOnRectangleIcon,
    CalendarDaysIcon,
    ChevronDoubleLeftIcon,
    ChevronDoubleRightIcon,
    ClockIcon,
    EnvelopeIcon,
    HomeIcon,
    UserCircleIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../context/AuthContext';

type ClubNavigationVariant = 'desktop' | 'mobile';

interface ClubNavigationProps {
    variant: ClubNavigationVariant;
    onRundmail: () => void;
}

const routes = [
    { label: 'Übersicht', to: '/dashboard', Icon: HomeIcon, end: true },
    { label: 'Arbeitsstunden', to: '/dashboard/arbeitsstunden', Icon: ClockIcon, end: false },
    { label: 'Veranstaltungen', to: '/dashboard/veranstaltungen', Icon: CalendarDaysIcon, end: false },
] as const;

const ClubNavigation = ({ variant, onRundmail }: ClubNavigationProps) => {
    const { user, logout } = useAuth();
    const [isExpanded, setIsExpanded] = useState(true);
    const isOrga = user?.role?.trim().toLowerCase() === 'orga';
    const isMobile = variant === 'mobile';

    return (
        <nav
            aria-label="Clubnavigation"
            className={isMobile
                ? 'club-navigation-mobile fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(15,23,42,0.08)] backdrop-blur md:hidden'
                : `club-navigation-desktop hidden min-h-screen flex-col border-r border-slate-200 bg-slate-950 px-3 py-5 text-white transition-[width] duration-200 md:flex ${isExpanded ? 'w-64' : 'w-20'}`}
        >
            {!isMobile && (
                <button
                    type="button"
                    aria-label={isExpanded ? 'Navigation einklappen' : 'Navigation erweitern'}
                    aria-expanded={isExpanded}
                    onClick={() => setIsExpanded((expanded) => !expanded)}
                    className="mb-6 flex min-h-11 min-w-11 items-center justify-center self-end rounded-md text-slate-300 hover:bg-slate-800 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
                >
                    {isExpanded ? <ChevronDoubleLeftIcon className="h-5 w-5" /> : <ChevronDoubleRightIcon className="h-5 w-5" />}
                </button>
            )}

            <div className={isMobile ? 'flex items-stretch justify-around' : 'flex flex-1 flex-col gap-2'}>
                {routes.map(({ label, to, Icon, end }) => (
                    <NavLink
                        key={to}
                        to={to}
                        end={end}
                        title={!isMobile && !isExpanded ? label : undefined}
                        className={({ isActive }) => `${isMobile
                            ? 'relative flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-1 rounded-md px-2 text-[11px] font-medium'
                            : 'relative flex min-h-11 min-w-11 items-center gap-3 rounded-md px-3 text-sm font-medium'} ${isActive
                            ? 'text-emerald-700 md:text-emerald-300'
                            : isMobile ? 'text-slate-600 hover:bg-slate-100' : 'text-slate-300 hover:bg-slate-800 hover:text-white'} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400`}
                    >
                        {({ isActive }) => (
                            <>
                                {isActive && <span aria-hidden="true" className={isMobile ? 'absolute inset-x-3 top-0 h-0.5 bg-emerald-500' : 'absolute inset-y-2 left-0 w-0.5 bg-emerald-400'} />}
                                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                                {(isMobile || isExpanded) && <span>{label}</span>}
                            </>
                        )}
                    </NavLink>
                ))}

                {isOrga && (
                    <button
                        type="button"
                        title={!isMobile && !isExpanded ? 'Rundmail' : undefined}
                        onClick={onRundmail}
                        className={isMobile
                            ? 'flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-1 rounded-md px-2 text-[11px] font-medium text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400'
                            : 'flex min-h-11 min-w-11 items-center gap-3 rounded-md px-3 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400'}
                    >
                        <EnvelopeIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
                        {(isMobile || isExpanded) && <span>Rundmail</span>}
                    </button>
                )}
            </div>

            <div className={isMobile ? 'hidden' : 'mt-auto border-t border-slate-800 pt-4'}>
                {isExpanded && (
                    <div className="mb-3 flex items-center gap-3 px-3 text-sm text-slate-300">
                        <UserCircleIcon className="h-6 w-6 shrink-0" aria-hidden="true" />
                        <span className="truncate">{user?.name || user?.email || 'Mitglied'}</span>
                    </div>
                )}
                <button
                    type="button"
                    title={!isExpanded ? 'Abmelden' : undefined}
                    onClick={logout}
                    className="flex min-h-11 min-w-11 w-full items-center justify-center gap-3 rounded-md px-3 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
                >
                    <ArrowRightOnRectangleIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
                    {isExpanded && <span>Abmelden</span>}
                </button>
            </div>
        </nav>
    );
};

export default ClubNavigation;
