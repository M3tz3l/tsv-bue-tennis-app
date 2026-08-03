import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

const { mockInstance } = vi.hoisted(() => {
  const instance = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
    },
  };
  return { mockInstance: instance };
});

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => mockInstance),
  },
}));

import BackendService, { getApiErrorMessage } from '../services/backendService';

const requestInterceptor = mockInstance.interceptors.request.use.mock.calls[0][0] as (
  config: { headers: Record<string, string | undefined>; data: unknown }
) => unknown;

type RequestConfig = { headers: Record<string, string | undefined>; data: unknown };

describe('BackendService', () => {
  beforeAll(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('getApiErrorMessage', () => {
    it('falls back when API messages are not strings', () => {
      expect(getApiErrorMessage({ response: { data: { message: { detail: 'bad' } } } }, 'Fallback'))
        .toBe('Fallback');
    });

    it('uses the generic error message when the server message is not usable', () => {
      expect(getApiErrorMessage({
        message: 'Network error',
        response: { data: { message: { detail: 'bad' } } },
      }, 'Fallback')).toBe('Network error');
    });

    it('prefers a string server message over the generic error message', () => {
      expect(getApiErrorMessage({
        message: 'Network error',
        response: { data: { message: 'Server error' } },
      }, 'Fallback')).toBe('Server error');
    });
  });

  it('returns the standardized event server message from failed requests', async () => {
    mockInstance.post.mockRejectedValue({
      response: { status: 409, data: { success: false, message: 'signup deadline has passed', data: null } },
    });

    await expect(BackendService.createEventSignup(4, {
      people_count: 1,
      salad_count: 0,
      cake_count: 0,
      comment: null,
    })).resolves.toEqual({ success: false, message: 'signup deadline has passed' });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('login', () => {
    it('normalizes email to lowercase and trims whitespace', async () => {
      mockInstance.post.mockResolvedValue({
        data: { type: 'single', success: true, token: 'abc', user: {} },
      });

      const result = await BackendService.login('  Test@Example.COM  ', 'password');

      expect(mockInstance.post).toHaveBeenCalledWith('/login', {
        email: 'test@example.com',
        password: 'password',
      });
      expect(result).toEqual({ type: 'single', success: true, token: 'abc', user: {} });
    });

    it('returns a failure result on request error with server message', async () => {
      mockInstance.post.mockRejectedValue({
        response: { data: { message: 'Ungültige Anmeldedaten' } },
      });

      const result = await BackendService.login('test@example.com', 'wrong');

      expect(result).toEqual({ success: false, message: 'Ungültige Anmeldedaten' });
    });

    it('falls back to a default message when the server provides none', async () => {
      mockInstance.post.mockRejectedValue({ response: {} });

      const result = await BackendService.login('test@example.com', 'wrong');

      expect(result).toEqual({ success: false, message: 'Anmeldung fehlgeschlagen' });
    });
  });

  describe('auth token injection', () => {
    it('attaches a Bearer token from localStorage to requests', () => {
      localStorage.setItem('authToken', 'my-token');
      const fakeConfig: RequestConfig = { headers: {}, data: undefined };

      requestInterceptor(fakeConfig);

      expect(fakeConfig.headers.Authorization).toBe('Bearer my-token');
    });

    it('removes Content-Type when sending FormData', () => {
      localStorage.setItem('authToken', 'my-token');
      const fakeConfig: RequestConfig = {
        headers: { 'Content-Type': 'application/json' },
        data: new FormData(),
      };

      requestInterceptor(fakeConfig);

      expect(fakeConfig.headers['Content-Type']).toBeUndefined();
    });
  });

  describe('sendTestMail', () => {
    it('builds FormData with payload, greeting flag and attachments', async () => {
      mockInstance.post.mockResolvedValue({ data: { success: true } });
      const attachment = new File(['content'], 'report.pdf', { type: 'application/pdf' });

      await BackendService.sendTestMail(
        { subject: 'Test', message: 'Hello' },
        [attachment],
        false
      );

      const [url, formData] = mockInstance.post.mock.calls[0];
      expect(url).toBe('/mail/test-send');
      expect(formData.get('subject')).toBe('Test');
      expect(formData.get('message')).toBe('Hello');
      expect(formData.get('include_greeting')).toBe('false');
      expect((formData.get('attachments') as File).name).toBe('report.pdf');
    });

    it('maps 403 to the orga role message', async () => {
      mockInstance.post.mockRejectedValue({ response: { status: 403, data: {} } });

      const result = await BackendService.sendTestMail();

      expect(result).toEqual({
        success: false,
        message: 'Nur Mitglieder mit Rolle "orga" dürfen Testmails senden.',
      });
    });

    it('maps 401 to the expired session message', async () => {
      mockInstance.post.mockRejectedValue({ response: { status: 401, data: {} } });

      const result = await BackendService.sendTestMail();

      expect(result).toEqual({
        success: false,
        message: 'Ihre Sitzung ist abgelaufen. Bitte erneut anmelden.',
      });
    });
  });

  describe('sendBulkMail', () => {
    it('builds FormData including the recipient filter', async () => {
      mockInstance.post.mockResolvedValue({ data: { success: true } });

      await BackendService.sendBulkMail({
        subject: 'Training',
        message: 'Reminder',
        recipient_filter: 'orga',
      });

      const [url, formData] = mockInstance.post.mock.calls[0];
      expect(url).toBe('/mail/send');
      expect(formData.get('subject')).toBe('Training');
      expect(formData.get('message')).toBe('Reminder');
      expect(formData.get('recipient_filter')).toBe('orga');
      expect(formData.get('include_greeting')).toBe('true');
    });
  });

  describe('getDashboard', () => {
    it('calls the correct endpoint with the year', async () => {
      const dashboard = {
        success: true,
        family: null,
        personal: null,
        year: 2026,
      };
      mockInstance.get.mockResolvedValue({ data: dashboard });

      const result = await BackendService.getDashboard(2026);

      expect(mockInstance.get).toHaveBeenCalledWith('/dashboard/2026');
      expect(result).toEqual(dashboard);
    });
  });

  describe('getMailJobStatus', () => {
    it('returns the job payload on success', async () => {
      const job = { id: 'job-1', status: 'processing' };
      mockInstance.get.mockResolvedValue({ data: { success: true, job } });

      const result = await BackendService.getMailJobStatus('job-1');

      expect(mockInstance.get).toHaveBeenCalledWith('/mail/jobs/job-1');
      expect(result).toEqual({ success: true, job });
    });
  });

  describe('work hour endpoints', () => {
    it('creates work hours via POST /arbeitsstunden', async () => {
      mockInstance.post.mockResolvedValue({ data: { success: true } });
      const payload = { Datum: '2026-07-31', Tätigkeit: 'Platzpflege', Stunden: 2 };

      const result = await BackendService.createArbeitsstunden(payload);

      expect(mockInstance.post).toHaveBeenCalledWith('/arbeitsstunden', payload);
      expect(result).toEqual({ success: true });
    });

    it('updates work hours via PUT /arbeitsstunden/:id', async () => {
      mockInstance.put.mockResolvedValue({ data: { success: true } });
      const payload = { Datum: '2026-07-31', Tätigkeit: 'Platzpflege', Stunden: 3 };

      await BackendService.updateArbeitsstunden('wh-1', payload);

      expect(mockInstance.put).toHaveBeenCalledWith('/arbeitsstunden/wh-1', payload);
    });

    it('deletes work hours via DELETE /arbeitsstunden/:id', async () => {
      mockInstance.delete.mockResolvedValue({ data: { success: true } });

      await BackendService.deleteArbeitsstunden('wh-1');

      expect(mockInstance.delete).toHaveBeenCalledWith('/arbeitsstunden/wh-1');
    });

    it('normalizes an empty work-hour delete response', async () => {
      mockInstance.delete.mockResolvedValue({ status: 204, data: '' });
      await expect(BackendService.deleteArbeitsstunden('wh-1')).resolves.toEqual({ success: true });
    });
  });

  describe('event endpoints', () => {
    const eventPayload = {
      type: 'event' as const,
      title: 'Sommerfest',
      description: null,
      event_date: '2026-08-15',
      start_time: '10:00',
      end_time: '12:00',
      location: 'Clubhaus',
      signup_deadline: null,
      capacity: 20,
      allow_salad: true,
      allow_cake: false,
      status: 'published' as const,
    };
    const updatePayload = {
      title: 'Neues Sommerfest', description: null, event_date: null, start_time: null,
      end_time: null, location: null, signup_deadline: null, capacity: null,
      clear_fields: [], allow_salad: null, allow_cake: null, status: null,
    };
    const signupPayload = {
      people_count: 2,
      salad_count: 1,
      cake_count: 0,
      comment: 'Wir bringen Salat.',
    };

    it('uses the event list and detail endpoints', async () => {
      mockInstance.get.mockResolvedValue({ data: { success: true } });

      await BackendService.getEvents();
      await BackendService.getEvent(42);

      expect(mockInstance.get).toHaveBeenNthCalledWith(1, '/events');
      expect(mockInstance.get).toHaveBeenNthCalledWith(2, '/events/42');
    });

    it('uses the event CRUD methods and payloads', async () => {
      mockInstance.post.mockResolvedValue({ data: { success: true } });
      mockInstance.put.mockResolvedValue({ data: { success: true } });
      mockInstance.delete.mockResolvedValue({ data: { success: true } });

      await BackendService.createEvent(eventPayload);
      await BackendService.updateEvent(42, updatePayload);
      await BackendService.deleteEvent(42);

      expect(mockInstance.post).toHaveBeenCalledWith('/events', eventPayload);
      expect(mockInstance.put).toHaveBeenCalledWith('/events/42', updatePayload);
      expect(mockInstance.delete).toHaveBeenCalledWith('/events/42');
    });

    it('uses the signup CRUD and list endpoints', async () => {
      mockInstance.get.mockResolvedValue({ data: { success: true } });
      mockInstance.post.mockResolvedValue({ data: { success: true } });
      mockInstance.put.mockResolvedValue({ data: { success: true } });
      mockInstance.delete.mockResolvedValue({ data: { success: true } });

      await BackendService.createEventSignup(42, signupPayload);
      await BackendService.updateEventSignup(42, signupPayload);
      await BackendService.deleteEventSignup(42);
      await BackendService.getEventSignups(42);

      expect(mockInstance.post).toHaveBeenCalledWith('/events/42/signup', signupPayload);
      expect(mockInstance.put).toHaveBeenCalledWith('/events/42/signup', signupPayload);
      expect(mockInstance.delete).toHaveBeenCalledWith('/events/42/signup');
      expect(mockInstance.get).toHaveBeenCalledWith('/events/42/signups');
    });

    it('normalizes event and signup delete 204 responses to success results', async () => {
      mockInstance.delete.mockResolvedValue({ status: 204, data: '' });

      await expect(BackendService.deleteEvent(42)).resolves.toEqual({ success: true });
      await expect(BackendService.deleteEventSignup(42)).resolves.toEqual({ success: true });
    });

    it('returns German fallback messages for event request failures', async () => {
      mockInstance.get.mockRejectedValue({ response: {} });

      await expect(BackendService.getEvents()).resolves.toEqual({
        success: false,
        message: 'Veranstaltungen konnten nicht geladen werden',
      });
    });
  });
});
