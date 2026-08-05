import axios, { AxiosInstance } from 'axios';
import type {
  LoginResponse,
  LoginResponseVariant,
  CreateWorkHourRequest,
  DashboardResponse,
  WorkHourEntry,
  SendBulkMailRequest,
  MailJob,
  UserResponse,
  CreateEventRequest,
  UpdateEventRequest,
  SignupRequest,
  EventSummary,
  EventDetail,
  EventSignup,
  SignupSummary,
} from '@/types';

// Generic API result type with optional data payload
export interface ApiResult<T = undefined> {
  success: boolean;
  data?: T;
  message?: string;
}

type MemberCountResponse = {
  all: number;
  orga: number;
};

export type ApiError = { success: false; message: string; status?: number };
export type VerifyTokenResponse = ApiResult & { user?: UserResponse; status?: number };
export type MailSendResponse = ApiResult & { job_id?: string; total_recipients?: number };
type SendTestMailPayload = { subject?: string; message?: string };

type ApiErrorShape = {
  message?: unknown;
  response?: {
    status?: unknown;
    data?: { message?: unknown };
  };
};

const asApiError = (error: unknown): ApiErrorShape =>
  typeof error === 'object' && error !== null ? error as ApiErrorShape : {};

export function getApiErrorMessage(error: unknown, fallback: string): string {
  const apiError = asApiError(error);
  const responseMessage = apiError.response?.data?.message;
  if (typeof responseMessage === 'string' && responseMessage.length > 0) {
    return responseMessage;
  }
  if (typeof apiError.message === 'string' && apiError.message.length > 0) {
    return apiError.message;
  }
  return fallback;
}

const getApiErrorStatus = (error: unknown): number | undefined => {
  const status = asApiError(error).response?.status;
  return typeof status === 'number' ? status : undefined;
};

const logApiError = (label: string, error: unknown): void => {
  console.error(label, { status: getApiErrorStatus(error) });
};

const normalizeDeleteResponse = (data: unknown): ApiResult | ApiError =>
  data === '' || data === undefined ? { success: true } : data as ApiResult | ApiError;

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
      (error) => Promise.reject(error)
    );
  }

  // Authentication methods
  async login(email: string, password: string): Promise<LoginResponseVariant | ApiError> {
    try {
      // Normalize email to lowercase for case-insensitive authentication
      const normalizedEmail = email.toLowerCase().trim();
      const response = await this.api.post<LoginResponseVariant>('/login', { email: normalizedEmail, password });
      return response.data;
    } catch (error: unknown) {
      logApiError('Login error:', error);
      return {
        success: false,
        message: getApiErrorMessage(error, 'Anmeldung fehlgeschlagen')
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
    } catch (error: unknown) {
      logApiError('Member selection error:', error);
      return {
        success: false,
        message: getApiErrorMessage(error, 'Mitgliederauswahl fehlgeschlagen')
      };
    }
  }

  async verifyToken(): Promise<VerifyTokenResponse> {
    try {
      const response = await this.api.get<VerifyTokenResponse>('/verify-token');
      return response.data;
    } catch (error: unknown) {
      logApiError('Token verification error:', error);
      const status = getApiErrorStatus(error);
      return {
        success: false,
        message: getApiErrorMessage(error, 'Token-Überprüfung fehlgeschlagen'),
        ...(status === undefined ? {} : { status }),
      };
    }
  }

  async forgotPassword(email: string): Promise<ApiResult | ApiError> {
    try {
      // Normalize email to lowercase for case-insensitive password reset
      const normalizedEmail = email.toLowerCase().trim();
      const response = await this.api.post<ApiResult>('/forgotPassword', { email: normalizedEmail });
      return response.data;
    } catch (error: unknown) {
      logApiError('Forgot password error:', error);
      return {
        success: false,
        message: getApiErrorMessage(error, 'E-Mail konnte nicht gesendet werden')
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
    } catch (error: unknown) {
      logApiError('Reset password error:', error);
      return {
        success: false,
        message: getApiErrorMessage(error, 'Passwort-Zurücksetzung fehlgeschlagen')
      };
    }
  }

  // Dashboard methods
  async getDashboard(year: number): Promise<DashboardResponse | ApiError> {
    try {
      const response = await this.api.get<DashboardResponse>(`/dashboard/${year}`);
      return response.data;
    } catch (error: unknown) {
      logApiError('Dashboard error:', error);
      return {
        success: false,
        message: getApiErrorMessage(error, 'Dashboard-Daten konnten nicht geladen werden')
      };
    }
  }

  async createArbeitsstunden(data: CreateWorkHourRequest): Promise<ApiResult | ApiError> {
    try {
      const response = await this.api.post<ApiResult>('/arbeitsstunden', data);
      return response.data;
    } catch (error: unknown) {
      logApiError('Error creating work hours:', error);
      return {
        success: false,
        message: getApiErrorMessage(error, 'Arbeitsstunden konnten nicht erstellt werden')
      };
    }
  }

  async updateArbeitsstunden(id: string, data: CreateWorkHourRequest): Promise<ApiResult | ApiError> {
    try {
      const response = await this.api.put<ApiResult>(`/arbeitsstunden/${id}`, data);
      return response.data;
    } catch (error: unknown) {
      logApiError('Error updating work hours:', error);
      return {
        success: false,
        message: getApiErrorMessage(error, 'Arbeitsstunden konnten nicht aktualisiert werden')
      };
    }
  }

  async deleteArbeitsstunden(id: string): Promise<ApiResult | ApiError> {
    try {
      const response = await this.api.delete<ApiResult>(`/arbeitsstunden/${id}`);
      return normalizeDeleteResponse(response.data);
    } catch (error: unknown) {
      logApiError('Error deleting work hours:', error);
      return {
        success: false,
        message: getApiErrorMessage(error, 'Arbeitsstunden konnten nicht gelöscht werden')
      };
    }
  }

  async getArbeitsstundenById(id: string): Promise<ApiResult<WorkHourEntry> | ApiError> {
    try {
      const response = await this.api.get<ApiResult<WorkHourEntry>>(`/arbeitsstunden/${id}`);
      return response.data;
    } catch (error: unknown) {
      logApiError('Error fetching work hour:', error);
      return {
        success: false,
        message: getApiErrorMessage(error, 'Arbeitsstunde konnte nicht geladen werden')
      };
    }
  }

  async sendTestMail(payload: SendTestMailPayload = {}, attachments?: File[], includeGreeting: boolean = true): Promise<ApiResult | ApiError> {
    try {
      const formData = new FormData();
      if (payload.subject) formData.append('subject', payload.subject);
      if (payload.message) formData.append('message', payload.message);
      formData.append('include_greeting', String(includeGreeting));
      if (attachments) {
        for (const file of attachments) {
          formData.append('attachments', file, file.name);
        }
      }
      const response = await this.api.post<ApiResult>('/mail/test-send', formData);
      return response.data;
    } catch (error: unknown) {
      logApiError('Error sending test mail:', error);

      const status = getApiErrorStatus(error);
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
        message: getApiErrorMessage(error, 'Testmail konnte nicht gesendet werden')
      };
    }
  }

  async sendBulkMail(payload: SendBulkMailRequest, attachments?: File[], includeGreeting: boolean = true): Promise<MailSendResponse | ApiError> {
    try {
      const formData = new FormData();
      formData.append('subject', payload.subject);
      formData.append('message', payload.message);
      formData.append('recipient_filter', payload.recipient_filter);
      formData.append('include_greeting', String(includeGreeting));
      if (attachments) {
        for (const file of attachments) {
          formData.append('attachments', file, file.name);
        }
      }
      const response = await this.api.post<MailSendResponse>('/mail/send', formData);
      return response.data;
    } catch (error: unknown) {
      logApiError('Error sending bulk mail:', error);

      const status = getApiErrorStatus(error);
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
        message: getApiErrorMessage(error, 'Mail konnte nicht versendet werden')
      };
    }
  }

  async getMemberCounts(): Promise<ApiResult<MemberCountResponse> | ApiError> {
    try {
      const response = await this.api.get<ApiResult<MemberCountResponse>>('/mail/recipient-counts');
      return response.data;
    } catch (error: unknown) {
      logApiError('Error fetching member counts:', error);
      return {
        success: false,
        message: getApiErrorMessage(error, 'Empfängerzahlen konnten nicht abgerufen werden')
      };
    }
  }

  async getMailJobStatus(jobId: string): Promise<{ success: boolean; job?: MailJob; status?: number; message?: string }> {
    try {
      const response = await this.api.get(`/mail/jobs/${jobId}`);
      return response.data;
    } catch (error: unknown) {
      logApiError('Error fetching mail job status:', error);
      return {
        success: false,
        status: getApiErrorStatus(error),
        message: getApiErrorMessage(error, 'Job-Status konnte nicht abgerufen werden')
      };
    }
  }

  async getEvents(): Promise<EventDetail[] | ApiError> {
    try {
      const response = await this.api.get<EventDetail[]>('/events');
      return response.data;
    } catch (error: unknown) {
      logApiError('Error fetching events:', error);
      return { success: false, message: getApiErrorMessage(error, 'Veranstaltungen konnten nicht geladen werden') };
    }
  }

  async getEvent(id: number): Promise<EventDetail | ApiError> {
    try {
      const response = await this.api.get<EventDetail>(`/events/${id}`);
      return response.data;
    } catch (error: unknown) {
      logApiError('Error fetching event:', error);
      return { success: false, message: getApiErrorMessage(error, 'Veranstaltung konnte nicht geladen werden') };
    }
  }

  async createEvent(payload: CreateEventRequest): Promise<EventSummary | ApiError> {
    try {
      const response = await this.api.post<EventSummary>('/events', payload);
      return response.data;
    } catch (error: unknown) {
      logApiError('Error creating event:', error);
      return { success: false, message: getApiErrorMessage(error, 'Veranstaltung konnte nicht erstellt werden') };
    }
  }

  async updateEvent(id: number, payload: UpdateEventRequest): Promise<EventSummary | ApiError> {
    try {
      const response = await this.api.put<EventSummary>(`/events/${id}`, payload);
      return response.data;
    } catch (error: unknown) {
      logApiError('Error updating event:', error);
      return { success: false, message: getApiErrorMessage(error, 'Veranstaltung konnte nicht aktualisiert werden') };
    }
  }

  async deleteEvent(id: number): Promise<ApiResult | ApiError> {
    try {
      const response = await this.api.delete<ApiResult>(`/events/${id}`);
      return normalizeDeleteResponse(response.data);
    } catch (error: unknown) {
      logApiError('Error deleting event:', error);
      return { success: false, message: getApiErrorMessage(error, 'Veranstaltung konnte nicht gelöscht werden') };
    }
  }

  async createEventSignup(id: number, payload: SignupRequest): Promise<EventSignup | ApiError> {
    try {
      const response = await this.api.post<EventSignup>(`/events/${id}/signup`, payload);
      return response.data;
    } catch (error: unknown) {
      logApiError('Error creating event signup:', error);
      return { success: false, message: getApiErrorMessage(error, 'Anmeldung konnte nicht erstellt werden') };
    }
  }

  async updateEventSignup(id: number, payload: SignupRequest): Promise<EventSignup | ApiError> {
    try {
      const response = await this.api.put<EventSignup>(`/events/${id}/signup`, payload);
      return response.data;
    } catch (error: unknown) {
      logApiError('Error updating event signup:', error);
      return { success: false, message: getApiErrorMessage(error, 'Anmeldung konnte nicht aktualisiert werden') };
    }
  }

  async deleteEventSignup(id: number): Promise<ApiResult | ApiError> {
    try {
      const response = await this.api.delete<ApiResult>(`/events/${id}/signup`);
      return normalizeDeleteResponse(response.data);
    } catch (error: unknown) {
      logApiError('Error deleting event signup:', error);
      return { success: false, message: getApiErrorMessage(error, 'Anmeldung konnte nicht gelöscht werden') };
    }
  }

  async getEventSignups(id: number): Promise<SignupSummary | ApiError> {
    try {
      const response = await this.api.get<SignupSummary>(`/events/${id}/signups`);
      return response.data;
    } catch (error: unknown) {
      logApiError('Error fetching event signups:', error);
      return { success: false, message: getApiErrorMessage(error, 'Anmeldungen konnten nicht geladen werden') };
    }
  }
}

// Export singleton instance
export default new BackendService();
