import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
}));

vi.mock('./context/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: mocks.useAuth,
}));
vi.mock('./pages/Login', () => ({ default: () => <div>Login page</div> }));
vi.mock('./pages/Events', () => ({ default: () => <div>Events page</div> }));
vi.mock('./pages/Dashboard', () => ({ default: () => <div>Dashboard page</div> }));

import App from './App';

describe('dashboard routes', () => {
  beforeEach(() => {
    mocks.useAuth.mockReturnValue({ user: { id: 'member-1' }, loading: false });
  });

  it('renders events for a direct authenticated events link', async () => {
    window.history.pushState({}, '', '/dashboard/veranstaltungen');

    render(<App />);

    expect(await screen.findByText('Events page')).toBeInTheDocument();
  });

  it('protects the direct events link for unauthenticated users', async () => {
    mocks.useAuth.mockReturnValue({ user: null, loading: false });
    window.history.pushState({}, '', '/dashboard/veranstaltungen');

    render(<App />);

    expect(await screen.findByText('Login page')).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe('/login'));
  });

  it('keeps the existing dashboard entry for authenticated users', async () => {
    window.history.pushState({}, '', '/dashboard');

    render(<App />);

    expect(await screen.findByText('Dashboard page')).toBeInTheDocument();
  });

  it('redirects an unauthenticated direct dashboard link to login', async () => {
    mocks.useAuth.mockReturnValue({ user: null, loading: false });
    window.history.pushState({}, '', '/dashboard/arbeitsstunden');

    render(<App />);

    expect(await screen.findByText('Login page')).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe('/login'));
  });
});
