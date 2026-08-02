import { NavLink } from 'react-router-dom';

const DashboardNavigation = () => (
    <nav aria-label="Dashboard-Bereiche" className="mb-6 flex flex-wrap gap-2">
        <NavLink
            to="/dashboard/arbeitsstunden"
            className={({ isActive }) => `rounded-md px-4 py-2 text-sm font-medium ${isActive ? 'bg-green-600 text-white' : 'bg-white text-gray-700 shadow-sm hover:bg-green-50'}`}
        >
            Arbeitsstunden
        </NavLink>
        <NavLink
            to="/dashboard/veranstaltungen"
            className={({ isActive }) => `rounded-md px-4 py-2 text-sm font-medium ${isActive ? 'bg-green-600 text-white' : 'bg-white text-gray-700 shadow-sm hover:bg-green-50'}`}
        >
            Veranstaltungen
        </NavLink>
    </nav>
);

export default DashboardNavigation;
