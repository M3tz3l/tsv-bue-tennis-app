import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';

const HomeRedirect = () => {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Lädt...</p>
                </div>
            </div>
        );
    }

    return <Navigate to={user ? "/dashboard" : "/login"} replace />;
};

export default HomeRedirect;
