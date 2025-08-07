import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import backendService from '../services/backendService.ts';
import type { UserResponse, MemberSelectionResponse } from '@/types';

interface AuthResult {
    success: boolean;
    message?: string;
}

interface MemberSelectionResult {
    success: boolean;
    multiple: boolean;
    users?: UserResponse[];
    selectionToken?: string;
    message?: string;
}

interface AuthContextType {
    user: UserResponse | null;
    token: string | null;
    login: (email: string, password: string) => Promise<AuthResult | MemberSelectionResult>;
    selectMember: (memberId: string, selectionToken: string) => Promise<AuthResult>;
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
            const response = await backendService.verifyToken();
            console.log('🔍 AuthContext: Token verification response:', response);
            if (response.success && (response as any).user) {
                setUser((response as any).user);
            } else {
                throw new Error(response.message || 'Token-Überprüfung fehlgeschlagen');
            }
        } catch (error) {
            console.error('🚨 AuthContext: Token verification failed:', error);
            logout();
        } finally {
            setLoading(false);
        }
    };

    const login = async (email: string, password: string): Promise<AuthResult | MemberSelectionResult> => {
        try {
            console.log('🔍 AuthContext: Starting login for:', email);
            const response = await backendService.login(email, password);

            console.log('🔍 AuthContext: Login response:', response);

            if (!response.success) {
                const errorMessage = 'message' in response ? response.message : 'Anmeldung fehlgeschlagen';
                return { success: false, message: errorMessage };
            }

            // Check if this is a multi-member selection response
            if ('multiple' in response && response.multiple) {
                const memberResponse = response as MemberSelectionResponse;
                return {
                    success: true,
                    multiple: true,
                    users: memberResponse.users,
                    selectionToken: memberResponse.selection_token,
                    message: memberResponse.message
                };
            }

            // Single user login response
            if ('token' in response && 'user' in response) {
                const loginResponse = response as any;
                const newToken = loginResponse.token;
                const userData = loginResponse.user;

                console.log('🔍 AuthContext: Setting token and user data');
                console.log('🔍 AuthContext: Token length:', newToken?.length);
                console.log('🔍 AuthContext: User data:', userData);

                setToken(newToken);
                setUser(userData);
                localStorage.setItem('authToken', newToken);
                return { success: true };
            }

            return { success: false, message: 'Unerwartetes Login-Format' };
        } catch (error: any) {
            console.error('🚨 AuthContext: Login error:', error);
            return {
                success: false,
                multiple: false,
                message: error.message || 'Anmeldung fehlgeschlagen. Bitte versuchen Sie es erneut.'
            };
        }
    };

    const selectMember = async (memberId: string, selectionToken: string): Promise<AuthResult> => {
        try {
            console.log('🔍 AuthContext: Selecting member:', memberId);
            const response = await backendService.selectMember(memberId, selectionToken);

            console.log('🔍 AuthContext: Member selection response:', response);

            if (response.success && (response as any).token && (response as any).user) {
                const newToken = (response as any).token;
                const userData = (response as any).user;

                console.log('🔍 AuthContext: Setting token and user data after selection');

                setToken(newToken);
                setUser(userData);
                localStorage.setItem('authToken', newToken);
                return { success: true };
            } else {
                const errorMessage = 'message' in response ? response.message : 'Mitgliederauswahl fehlgeschlagen';
                return { success: false, message: errorMessage };
            }
        } catch (error: any) {
            console.error('🚨 AuthContext: Member selection error:', error);
            return {
                success: false,
                message: error.message || 'Mitgliederauswahl fehlgeschlagen. Bitte versuchen Sie es erneut.'
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
        selectMember,
        logout,
        loading
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
