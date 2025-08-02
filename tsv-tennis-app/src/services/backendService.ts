import axios, { AxiosInstance } from 'axios';
import type {
  LoginRequest,
  LoginResponse,
  CreateWorkHourRequest,
  WorkHourResponse,
  DashboardResponse
} from '@/types';

// Helper types for API responses
interface ApiResponse {
  success: boolean;
  message?: string;
}

interface ApiError {
  success: false;
  message: string;
}

class BackendService {
  private api: AxiosInstance;
  private baseURL: string;

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
  async login(email: string, password: string): Promise<LoginResponse | ApiError> {
    try {
      const response = await this.api.post<LoginResponse>('/api/login', { email, password });
      return response.data;
    } catch (error: any) {
      console.error('Login error:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Login failed'
      };
    }
  }

  async verifyToken(): Promise<ApiResponse> {
    try {
      const response = await this.api.get<ApiResponse>('/api/verify-token');
      return response.data;
    } catch (error: any) {
      console.error('Token verification error:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Token verification failed'
      };
    }
  }

  // Dashboard methods
  async getDashboard(year: number): Promise<DashboardResponse | ApiError> {
    try {
      const response = await this.api.get<DashboardResponse>(`/api/dashboard/${year}`);
      return response.data;
    } catch (error: any) {
      console.error('Dashboard error:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to fetch dashboard data'
      };
    }
  }

  // Work hours methods
  async getArbeitsstunden(): Promise<WorkHourResponse[] | ApiError> {
    try {
      const response = await this.api.get<WorkHourResponse[]>('/api/arbeitsstunden');
      return response.data;
    } catch (error: any) {
      console.error('Error fetching work hours:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to fetch work hours'
      };
    }
  }

  async createArbeitsstunden(data: CreateWorkHourRequest): Promise<ApiResponse | ApiError> {
    try {
      const response = await this.api.post<ApiResponse>('/api/arbeitsstunden', data);
      return response.data;
    } catch (error: any) {
      console.error('Error creating work hours:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to create work hours'
      };
    }
  }

  async updateArbeitsstunden(id: string, data: CreateWorkHourRequest): Promise<ApiResponse | ApiError> {
    try {
      const response = await this.api.put<ApiResponse>(`/api/arbeitsstunden/${id}`, data);
      return response.data;
    } catch (error: any) {
      console.error('Error updating work hours:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to update work hours'
      };
    }
  }

  async deleteArbeitsstunden(id: string): Promise<ApiResponse | ApiError> {
    try {
      const response = await this.api.delete<ApiResponse>(`/api/arbeitsstunden/${id}`);
      return response.data;
    } catch (error: any) {
      console.error('Error deleting work hours:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to delete work hours'
      };
    }
  }

  async getArbeitsstundeById(id: string): Promise<ApiResponse | ApiError> {
    try {
      const response = await this.api.get<ApiResponse>(`/api/arbeitsstunden/${id}`);
      return response.data;
    } catch (error: any) {
      console.error('Error fetching work hour:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to fetch work hour'
      };
    }
  }
}

// Export singleton instance
export default new BackendService();
