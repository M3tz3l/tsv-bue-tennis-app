import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export default function useModalRoute(paramName: string) {
  const [searchParams, setSearchParams] = useSearchParams();

  const value = useMemo(() => {
    const raw = Number(searchParams.get(paramName));
    return Number.isInteger(raw) && raw > 0 ? raw : null;
  }, [paramName, searchParams]);

  const open = useCallback(
    (id: number) => {
      setSearchParams((params) => {
        const next = new URLSearchParams(params);
        next.set(paramName, String(id));
        return next;
      });
    },
    [paramName, setSearchParams],
  );

  const close = useCallback(() => {
    setSearchParams((params) => {
      const next = new URLSearchParams(params);
      next.delete(paramName);
      return next;
    });
  }, [paramName, setSearchParams]);

  return { value, open, close };
}
