import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import Spinner from './Spinner';

const HomeRedirect = () => {
    const { user, loading } = useAuth();

    if (loading) {
        return <Spinner fullPage label="Lädt..." />;
    }

    return <Navigate to={user ? "/dashboard" : "/login"} replace />;
};

export default HomeRedirect;
