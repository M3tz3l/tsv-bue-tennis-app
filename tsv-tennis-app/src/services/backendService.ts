import axios, { AxiosInstance } from 'axios';
import type {
  LoginResponse,
  LoginResponseVariant,
  CreateWorkHourRequest,
  DashboardResponse,
  WorkHourEntry,
  SendBulkMailRequest,
  MailJob,
} from '@/types';

// Generic API result type with optional data payload
interface ApiResult<T = undefined> {
  success: boolean;
  data?: T;
  message?: string;
}

type MemberCountResponse = {
  all: number;
  orga: number;
};

type ApiError = { success: false; message: string };
type SendTestMailPayload = { subject?: string; message?: string };

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

    // Add request interceptor to include auth token and handle FormData
    this.api.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('authToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        // Remove Content-Type for FormData so axios sets multipart/form-data with boundary
        if (config.data instanceof FormData) {
          delete config.headers['Content-Type'];
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

  async verifyToken(): Promise<ApiResult> {
    try {
      const response = await this.api.get<ApiResult>('/verify-token');
      return response.data;
    } catch (error: any) {
      console.error('Token verification error:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Token-Überprüfung fehlgeschlagen'
      };
    }
  }

  async forgotPassword(email: string): Promise<ApiResult | ApiError> {
    try {
      // Normalize email to lowercase for case-insensitive password reset
      const normalizedEmail = email.toLowerCase().trim();
      const response = await this.api.post<ApiResult>('/forgotPassword', { email: normalizedEmail });
      return response.data;
    } catch (error: any) {
      console.error('Forgot password error:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'E-Mail konnte nicht gesendet werden'
      };
    }
  }

  async resetPassword(token: string, password: string, userId: string): Promise<ApiResult | ApiError> {
    try {
      const response = await this.api.post<ApiResult>('/resetPassword', {
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

  async createArbeitsstunden(data: CreateWorkHourRequest): Promise<ApiResult | ApiError> {
    try {
      const response = await this.api.post<ApiResult>('/arbeitsstunden', data);
      return response.data;
    } catch (error: any) {
      console.error('Error creating work hours:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Arbeitsstunden konnten nicht erstellt werden'
      };
    }
  }

  async updateArbeitsstunden(id: string, data: CreateWorkHourRequest): Promise<ApiResult | ApiError> {
    try {
      const response = await this.api.put<ApiResult>(`/arbeitsstunden/${id}`, data);
      return response.data;
    } catch (error: any) {
      console.error('Error updating work hours:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Arbeitsstunden konnten nicht aktualisiert werden'
      };
    }
  }

  async deleteArbeitsstunden(id: string): Promise<ApiResult | ApiError> {
    try {
      const response = await this.api.delete<ApiResult>(`/arbeitsstunden/${id}`);
      return response.data;
    } catch (error: any) {
      console.error('Error deleting work hours:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Arbeitsstunden konnten nicht gelöscht werden'
      };
    }
  }

  async getArbeitsstundenById(id: string): Promise<ApiResult<WorkHourEntry> | ApiError> {
    try {
      const response = await this.api.get<ApiResult<WorkHourEntry>>(`/arbeitsstunden/${id}`);
      return response.data;
    } catch (error: any) {
      console.error('Error fetching work hour:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Arbeitsstunde konnte nicht geladen werden'
      };
    }
  }

  async sendTestMail(payload: SendTestMailPayload = {}, attachments?: File[]): Promise<ApiResult | ApiError> {
    try {
      const formData = new FormData();
      if (payload.subject) formData.append('subject', payload.subject);
      if (payload.message) formData.append('message', payload.message);
      if (attachments) {
        for (const file of attachments) {
          formData.append('attachments', file, file.name);
        }
      }
      const response = await this.api.post<ApiResult>('/mail/test-send', formData);
      return response.data;
    } catch (error: any) {
      console.error('Error sending test mail:', error);

      const status = error.response?.status;
      if (status === 403) {
        return {
          success: false,
          message: 'Nur Mitglieder mit Rolle "orga" dürfen Testmails senden.'
        };
      }

      if (status === 400) {
        return {
          success: false,
          message: 'Für Ihr Mitglied ist keine E-Mail-Adresse hinterlegt.'
        };
      }

      if (status === 401) {
        return {
          success: false,
          message: 'Ihre Sitzung ist abgelaufen. Bitte erneut anmelden.'
        };
      }

      return {
        success: false,
        message: error.response?.data?.message || 'Testmail konnte nicht gesendet werden'
      };
    }
  }

  async sendBulkMail(payload: SendBulkMailRequest, attachments?: File[]): Promise<ApiResult | ApiError> {
    try {
      const formData = new FormData();
      formData.append('subject', payload.subject);
      formData.append('message', payload.message);
      formData.append('recipient_filter', payload.recipient_filter);
      if (attachments) {
        for (const file of attachments) {
          formData.append('attachments', file, file.name);
        }
      }
      const response = await this.api.post<ApiResult>('/mail/send', formData);
      return response.data;
    } catch (error: any) {
      console.error('Error sending bulk mail:', error);

      const status = error.response?.status;
      if (status === 403) {
        return {
          success: false,
          message: 'Nur Mitglieder mit Rolle "orga" dürfen Mails versenden.'
        };
      }

      if (status === 401) {
        return {
          success: false,
          message: 'Ihre Sitzung ist abgelaufen. Bitte erneut anmelden.'
        };
      }

      return {
        success: false,
        message: error.response?.data?.message || 'Mail konnte nicht versendet werden'
      };
    }
  }

  async getMemberCounts(): Promise<ApiResult<MemberCountResponse> | ApiError> {
    try {
      const response = await this.api.get<ApiResult<MemberCountResponse>>('/mail/recipient-counts');
      return response.data;
    } catch (error: any) {
      console.error('Error fetching member counts:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Empfängerzahlen konnten nicht abgerufen werden'
      };
    }
  }

  async getMailJobStatus(jobId: string): Promise<{ success: boolean; job?: MailJob; message?: string }> {
    try {
      const response = await this.api.get(`/mail/jobs/${jobId}`);
      return response.data;
    } catch (error: any) {
      console.error('Error fetching mail job status:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Job-Status konnte nicht abgerufen werden'
      };
    }
  }
}

// Export singleton instance
export default new BackendService();
