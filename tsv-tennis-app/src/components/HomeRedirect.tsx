import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';

const HomeRedirect = () => {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[var(--canvas)]">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--primary)] mx-auto"></div>
                    <p className="mt-4 text-[var(--muted)]">Lädt...</p>
                </div>
            </div>
        );
    }

    return <Navigate to={user ? "/dashboard" : "/login"} replace />;
};

export default HomeRedirect;
