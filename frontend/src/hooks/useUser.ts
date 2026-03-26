import { useMemo } from 'react';

interface User {
  id: string | number;
  role: 'admin' | 'operator';
  token: string;
  name?: string;
  email?: string;
}

export function useUser(): User | null {
  return useMemo(() => {
    try {
      const raw = localStorage.getItem('user');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // Validate required fields
      if (!parsed?.id || !parsed?.role || !parsed?.token) return null;
      return parsed as User;
    } catch {
      return null;
    }
  }, []);
}
