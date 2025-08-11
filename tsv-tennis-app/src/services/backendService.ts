import axios, { AxiosInstance } from 'axios';
import type {
  LoginRequest,
  LoginResponse,
  LoginResponseVariant,
  MemberSelectionResponse,
  SelectMemberRequest,
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
    // Always use relative URLs since Vite proxy handles the routing in development
    // and in production it's served by the same domain
    this.baseURL = '/api';

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
  async login(email: string, password: string): Promise<LoginResponseVariant | ApiError> {
    try {
      // Normalize email to lowercase for case-insensitive authentication
      const normalizedEmail = email.toLowerCase().trim();
      const response = await this.api.post<LoginResponseVariant>('/login', { email: normalizedEmail, password });
      return response.data;
    } catch (error: any) {
      console.error('Login error:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Anmeldung fehlgeschlagen'
      };
    }
  }

  async selectMember(memberId: string, selectionToken: string): Promise<LoginResponse | ApiError> {
    try {
      const response = await this.api.post<LoginResponse>('/select-member', {
        member_id: memberId,
        selection_token: selectionToken
      });
      return response.data;
    } catch (error: any) {
      console.error('Member selection error:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Mitgliederauswahl fehlgeschlagen'
      };
    }
  }

  async verifyToken(): Promise<ApiResponse> {
    try {
      const response = await this.api.get<ApiResponse>('/verify-token');
      return response.data;
    } catch (error: any) {
      console.error('Token verification error:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Token-Überprüfung fehlgeschlagen'
      };
    }
  }

  async forgotPassword(email: string): Promise<ApiResponse | ApiError> {
    try {
      // Normalize email to lowercase for case-insensitive password reset
      const normalizedEmail = email.toLowerCase().trim();
      const response = await this.api.post<ApiResponse>('/forgotPassword', { email: normalizedEmail });
      return response.data;
    } catch (error: any) {
      console.error('Forgot password error:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'E-Mail konnte nicht gesendet werden'
      };
    }
  }

  async resetPassword(token: string, password: string, userId: string): Promise<ApiResponse | ApiError> {
    try {
      const response = await this.api.post<ApiResponse>('/resetPassword', {
        token,
        password,
        userId
      });
      return response.data;
    } catch (error: any) {
      console.error('Reset password error:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Passwort-Zurücksetzung fehlgeschlagen'
      };
    }
  }

  // Dashboard methods
  async getDashboard(year: number): Promise<DashboardResponse | ApiError> {
    try {
      const response = await this.api.get<DashboardResponse>(`/dashboard/${year}`);
      return response.data;
    } catch (error: any) {
      console.error('Dashboard error:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Dashboard-Daten konnten nicht geladen werden'
      };
    }
  }

  async createArbeitsstunden(data: CreateWorkHourRequest): Promise<ApiResponse | ApiError> {
    try {
      const response = await this.api.post<ApiResponse>('/arbeitsstunden', data);
      return response.data;
    } catch (error: any) {
      console.error('Error creating work hours:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Arbeitsstunden konnten nicht erstellt werden'
      };
    }
  }

  async updateArbeitsstunden(id: string, data: CreateWorkHourRequest): Promise<ApiResponse | ApiError> {
    try {
      const response = await this.api.put<ApiResponse>(`/arbeitsstunden/${id}`, data);
      return response.data;
    } catch (error: any) {
      console.error('Error updating work hours:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Arbeitsstunden konnten nicht aktualisiert werden'
      };
    }
  }

  async deleteArbeitsstunden(id: string): Promise<ApiResponse | ApiError> {
    try {
      const response = await this.api.delete<ApiResponse>(`/arbeitsstunden/${id}`);
      return response.data;
    } catch (error: any) {
      console.error('Error deleting work hours:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Arbeitsstunden konnten nicht gelöscht werden'
      };
    }
  }

  async getArbeitsstundenById(id: string): Promise<ApiResponse | ApiError> {
    try {
      const response = await this.api.get<ApiResponse>(`/arbeitsstunden/${id}`);
      return response.data;
    } catch (error: any) {
      console.error('Error fetching work hour:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Arbeitsstunde konnte nicht geladen werden'
      };
    }
  }
}

// Export singleton instance
export default new BackendService();
