import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import backendService from '../services/backendService.ts';
import type { UserResponse, MemberSelectionResponse, LoginResponse } from '@/types';
import { getApiErrorMessage } from '@/services/backendService';
import type { ApiError } from '@/services/backendService';

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

const isApiError = (response: ApiError | { success: boolean }): response is ApiError =>
    response.success === false;

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

const AUTH_USER_KEY = 'authUser';

function getStoredUser(): UserResponse | null {
    try {
        const storedUser = localStorage.getItem(AUTH_USER_KEY);
        return storedUser ? JSON.parse(storedUser) as UserResponse : null;
    } catch {
        return null;
    }
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
    const [user, setUser] = useState<UserResponse | null>(getStoredUser);
    const [loading, setLoading] = useState<boolean>(true);
    const [token, setToken] = useState<string | null>(localStorage.getItem('authToken'));

    useEffect(() => {
        if (token) {
            // Verify token and get user data
            void verifyToken();
        } else {
            setLoading(false);
        }
    }, [token]);

    const verifyToken = async () => {
        try {
            const response = await backendService.verifyToken();
            if (response.success && response.user) {
                setUser(response.user);
                localStorage.setItem(AUTH_USER_KEY, JSON.stringify(response.user));
            } else if (response.status !== 401) {
                // Keep the cached session during transient backend/Teable failures.
                console.error('🚨 AuthContext: Token verification temporarily unavailable');
            } else {
                throw new Error(response.message || 'Token-Überprüfung fehlgeschlagen');
            }
        } catch {
            logout();
        } finally {
            setLoading(false);
        }
    };

    const login = async (email: string, password: string): Promise<AuthResult | MemberSelectionResult> => {
        try {
            const response = await backendService.login(email, password);

            if (isApiError(response)) {
                const errorMessage = response.message || 'Anmeldung fehlgeschlagen';
                return { success: false, message: errorMessage };
            }

            // Check if this is a multi-member selection response
            if (response.type === 'multiple') {
                const memberResponse: MemberSelectionResponse & { type: 'multiple' } = response;
                return {
                    success: true,
                    multiple: true,
                    users: memberResponse.users,
                    selectionToken: memberResponse.selection_token,
                    message: memberResponse.message
                };
            }

            // Single user login response
            if (response.type === 'single') {
                const loginResponse: LoginResponse & { type: 'single' } = response;
                const newToken = loginResponse.token;
                const userData = loginResponse.user;

                setToken(newToken);
                setUser(userData);
                localStorage.setItem('authToken', newToken);
                localStorage.setItem(AUTH_USER_KEY, JSON.stringify(userData));
                return { success: true };
            }

            return { success: false, message: 'Unerwartetes Login-Format' };
        } catch (error: unknown) {
            return {
                success: false,
                multiple: false,
                message: getApiErrorMessage(error, 'Anmeldung fehlgeschlagen. Bitte versuchen Sie es erneut.')
            };
        }
    };

    const selectMember = async (memberId: string, selectionToken: string): Promise<AuthResult> => {
        try {
            const response = await backendService.selectMember(memberId, selectionToken);

            if (response.success && response.token && response.user) {
                const newToken = response.token;
                const userData = response.user;

                setToken(newToken);
                setUser(userData);
                localStorage.setItem('authToken', newToken);
                localStorage.setItem(AUTH_USER_KEY, JSON.stringify(userData));
                return { success: true };
            } else {
                const errorMessage = 'message' in response ? response.message : 'Mitgliederauswahl fehlgeschlagen';
                return { success: false, message: errorMessage };
            }
        } catch (error: unknown) {
            return {
                success: false,
                message: getApiErrorMessage(error, 'Mitgliederauswahl fehlgeschlagen. Bitte versuchen Sie es erneut.')
            };
        }
    };

    const logout = () => {
        setUser(null);
        setToken(null);
        localStorage.removeItem('authToken');
        localStorage.removeItem(AUTH_USER_KEY);
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
