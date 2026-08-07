import { useAuth } from '../context/AuthContext';
import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import Spinner from './Spinner';

type ProtectedRouteProps = {
    children: ReactNode;
};

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
    const { user, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return <Spinner fullPage label="Lädt..." />;
    }

    if (!user) {
        return <Navigate to="/login" replace state={{ from: location }} />;
    }

    return <>{children}</>;
};

export default ProtectedRoute;
