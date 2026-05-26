interface User {
  id: string | number;
  role: 'admin' | 'operator' | 'client';
  name?: string;
  email?: string;
  permissions?: string[];
}

export function useUser(): User | null {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Validate required fields
    // Auth é por cookie (token httpOnly), então não exigimos token no localStorage.
    if (!parsed?.id || !parsed?.role) return null;
    if (!['admin', 'operator', 'client'].includes(parsed.role)) return null;
    return parsed as User;
  } catch (e) {
    console.warn('[useUser] Failed to parse user from localStorage:', e);
    return null;
  }
}
