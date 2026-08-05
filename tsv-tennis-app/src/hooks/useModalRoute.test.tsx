import { act, renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import useModalRoute from './useModalRoute';

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter initialEntries={['/dashboard/veranstaltungen?filter=upcoming&eventId=5']}>
    {children}
  </MemoryRouter>
);

const useSearch = () => useLocation().search;

describe('useModalRoute', () => {
  it('reads a positive integer value from the given search param on mount', () => {
    const { result } = renderHook(() => useModalRoute('eventId'), { wrapper });

    expect(result.current.value).toBe(5);
  });

  it('treats missing and invalid values as closed', () => {
    const invalidWrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={['/dashboard/veranstaltungen?eventId=-2']}>
        {children}
      </MemoryRouter>
    );

    const { result } = renderHook(() => useModalRoute('eventId'), { wrapper: invalidWrapper });

    expect(result.current.value).toBeNull();
  });

  it('sets the value while preserving other search params on open', () => {
    const { result } = renderHook(
      () => ({ modal: useModalRoute('eventId'), search: useSearch() }),
      { wrapper },
    );

    act(() => result.current.modal.open(9));

    expect(result.current.modal.value).toBe(9);
    expect(result.current.search).toBe('?filter=upcoming&eventId=9');
  });

  it('clears the value and only its search param on close', () => {
    const { result } = renderHook(
      () => ({ modal: useModalRoute('eventId'), search: useSearch() }),
      { wrapper },
    );

    act(() => result.current.modal.close());

    expect(result.current.modal.value).toBeNull();
    expect(result.current.search).toBe('?filter=upcoming');
  });
});
