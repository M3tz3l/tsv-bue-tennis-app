import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import axios from 'axios';
import type { UserResponse } from '@/types';

interface LoginResponse {
    success: boolean;
    token: string;
    user: UserResponse;
}

interface AuthResult {
    success: boolean;
    message?: string;
}

interface AuthContextType {
    user: UserResponse | null;
    token: string | null;
    login: (email: string, password: string) => Promise<AuthResult>;
    logout: () => void;
    loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

interface AuthProviderProps {
    children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
    const [user, setUser] = useState<UserResponse | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [token, setToken] = useState<string | null>(localStorage.getItem('authToken'));

    useEffect(() => {
        if (token) {
            // Verify token and get user data
            verifyToken();
        } else {
            setLoading(false);
        }
    }, [token]);

    const verifyToken = async () => {
        try {
            console.log('🔍 AuthContext: Verifying token:', token?.substring(0, 20) + '...');
            const response = await axios.get(`${(import.meta as any).env.VITE_BACKEND_URL}/api/verify-token`, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            console.log('🔍 AuthContext: Token verification response:', response.data);
            setUser(response.data.user);
        } catch (error) {
            console.error('🚨 AuthContext: Token verification failed:', error);
            logout();
        } finally {
            setLoading(false);
        }
    };

    const login = async (email: string, password: string): Promise<AuthResult> => {
        try {
            console.log('🔍 AuthContext: Starting login for:', email);
            const response = await axios.post<LoginResponse>(`${(import.meta as any).env.VITE_BACKEND_URL}/api/login`, {
                email,
                password
            });
            
            console.log('🔍 AuthContext: Login response:', response.data);
            
            if (response.data.success) {
                const { token: newToken, user: userData } = response.data;
                console.log('🔍 AuthContext: Setting token and user data');
                console.log('🔍 AuthContext: Token length:', newToken?.length);
                console.log('🔍 AuthContext: User data:', userData);
                
                setToken(newToken);
                setUser(userData);
                localStorage.setItem('authToken', newToken);
                return { success: true };
            } else {
                return { success: false, message: 'Login failed' };
            }
        } catch (error: any) {
            console.error('🚨 AuthContext: Login error:', error);
            return { 
                success: false, 
                message: error.response?.data?.message || 'Anmeldung fehlgeschlagen. Bitte versuchen Sie es erneut.' 
            };
        }
    };

    const logout = () => {
        setUser(null);
        setToken(null);
        localStorage.removeItem('authToken');
    };

    const value = {
        user,
        token,
        login,
        logout,
        loading
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
