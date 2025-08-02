import axios from 'axios';

class BackendService {
    constructor() {
        // In production, use relative URLs to avoid CORS issues
        // In development, use the explicit backend URL
        this.baseURL = import.meta.env.PROD 
            ? '/api'  // Use relative URL in production (served by same domain)
            : (import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000/api');

        this.api = axios.create({
            baseURL: this.baseURL,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        // Add request interceptor to include auth token
        this.api.interceptors.request.use(
            (config) => {
                const token = localStorage.getItem('authToken');
                if (token) {
                    config.headers.Authorization = `Bearer ${token}`;
                }
                return config;
            },
            (error) => {
                return Promise.reject(error);
            }
        );
    }

    // Authentication methods
    async login(email, password) {
        try {
            const response = await this.api.post('/api/login', { email, password });
            return response.data;
        } catch (error) {
            console.error('Login error:', error);
            return {
                success: false,
                message: error.response?.data?.message || 'Login failed'
            };
        }
    }

    async verifyToken() {
        try {
            const response = await this.api.get('/api/verify-token');
            return response.data;
        } catch (error) {
            console.error('Token verification error:', error);
            return {
                success: false,
                message: error.response?.data?.message || 'Token verification failed'
            };
        }
    }

    async forgotPassword(email) {
        try {
            const response = await this.api.post('/api/forgotPassword', { email });
            return response.data;
        } catch (error) {
            console.error('Forgot password error:', error);
            return {
                success: false,
                message: error.response?.data?.message || 'Failed to send reset email'
            };
        }
    }

    async resetPassword(token, password, userId) {
        try {
            const response = await this.api.post('/api/resetPassword', { 
                token, 
                password, 
                userId 
            });
            return response.data;
        } catch (error) {
            console.error('Reset password error:', error);
            return {
                success: false,
                message: error.response?.data?.message || 'Password reset failed'
            };
        }
    }

    // Work hours methods
    async getArbeitsstunden() {
        try {
            const response = await this.api.get('/api/arbeitsstunden');
            return {
                success: true,
                data: response.data.data || response.data
            };
        } catch (error) {
            console.error('Error fetching Arbeitsstunden:', error);
            return {
                success: false,
                error: error.response?.data?.message || 'Failed to fetch work hours'
            };
        }
    }

    async getArbeitsstundenById(id) {
        try {
            const response = await this.api.get(`/api/arbeitsstunden/${id}`);
            return response.data;
        } catch (error) {
            console.error('Error fetching work hour by ID:', error);
            return {
                success: false,
                error: error.response?.data?.message || 'Failed to fetch work hour'
            };
        }
    }

    async createArbeitsstunden(data) {
        try {
            // Transform data to match backend expectations
            const payload = {
                date: data.Datum,
                description: data.Tätigkeit,
                hours: parseFloat(data.Stunden)
            };
            
            const response = await this.api.post('/api/arbeitsstunden', payload);
            return {
                success: true,
                data: response.data.data,
                message: response.data.message
            };
        } catch (error) {
            console.error('Error creating Arbeitsstunden:', error);
            return {
                success: false,
                error: error.response?.data?.error || error.response?.data?.message || 'Failed to create work hours'
            };
        }
    }

    async updateArbeitsstunden(id, data) {
        try {
            // Transform data to match backend expectations
            const payload = {
                date: data.Datum,
                description: data.Tätigkeit,
                hours: parseFloat(data.Stunden)
            };
            
            const response = await this.api.put(`/api/arbeitsstunden/${id}`, payload);
            return {
                success: true,
                data: response.data.data,
                message: response.data.message
            };
        } catch (error) {
            console.error('Error updating Arbeitsstunden:', error);
            return {
                success: false,
                error: error.response?.data?.error || error.response?.data?.message || 'Failed to update work hours'
            };
        }
    }

    async deleteArbeitsstunden(id) {
        try {
            const response = await this.api.delete(`/api/arbeitsstunden/${id}`);
            return {
                success: true,
                data: { id },
                message: response.data.message
            };
        } catch (error) {
            console.error('Error deleting Arbeitsstunden:', error);
            return {
                success: false,
                error: error.response?.data?.message || 'Failed to delete work hours'
            };
        }
    }

    // Dashboard methods
    async getDashboard(year = new Date().getFullYear()) {
        try {
            const response = await this.api.get(`/api/dashboard/${year}`);
            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            console.error('Error fetching dashboard:', error);
            return {
                success: false,
                error: error.response?.data?.message || 'Failed to fetch dashboard data'
            };
        }
    }

    // User methods
    async getUser() {
        try {
            const response = await this.api.get('/api/user');
            return response.data;
        } catch (error) {
            console.error('Error fetching user:', error);
            return {
                success: false,
                error: error.response?.data?.message || 'Failed to fetch user data'
            };
        }
    }

    // Legacy compatibility methods for existing code
    async getUserByEmail(email) {
        // This method is no longer needed since authentication handles user lookup
        console.warn('getUserByEmail is deprecated - use login instead');
        return {
            success: false,
            error: 'Method deprecated - use login instead'
        };
    }

    async getArbeitsstundenByUserId(userUUID) {
        // This is now handled by the authenticated getArbeitsstunden endpoint
        console.warn('getArbeitsstundenByUserId is deprecated - use getArbeitsstunden instead');
        return this.getArbeitsstunden();
    }

    async getAllArbeitsstunden() {
        // This would require admin privileges - not implemented for security
        console.warn('getAllArbeitsstunden is not available for security reasons');
        return {
            success: false,
            error: 'Admin functionality not available'
        };
    }

    async getAllMitglieder() {
        // This would require admin privileges - not implemented for security
        console.warn('getAllMitglieder is not available for security reasons');
        return {
            success: false,
            error: 'Admin functionality not available'
        };
    }
}

// Export singleton instance
export default new BackendService();
