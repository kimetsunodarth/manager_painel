interface User {
  id: string | number;
  role: 'admin' | 'operator';
  token: string;
  name?: string;
  email?: string;
}

export function useUser(): User | null {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Validate required fields
    if (!parsed?.id || !parsed?.role || !parsed?.token) return null;
    if (!['admin', 'operator'].includes(parsed.role)) return null;
    return parsed as User;
  } catch (e) {
    console.warn('[useUser] Failed to parse user from localStorage:', e);
    return null;
  }
}
