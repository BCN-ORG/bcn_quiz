'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiUrl, request } from '@/lib/api';
import type { User } from '@/lib/types';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  reload: () => Promise<void>;
  login: () => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** Profiles/Quiz may nest `{ data: user }` more than once — flatten to the user object. */
function normalizeUser(raw: unknown): User | null {
  if (!raw || typeof raw !== 'object') return null;
  let current = raw as Record<string, unknown>;
  for (let depth = 0; depth < 4; depth += 1) {
    const nested = current.data;
    if (
      nested &&
      typeof nested === 'object' &&
      !Array.isArray(nested) &&
      ('id' in nested || 'email' in nested)
    ) {
      current = nested as Record<string, unknown>;
      continue;
    }
    break;
  }
  if (typeof current.id !== 'string' && typeof current.email !== 'string') {
    return null;
  }
  const roles = Array.isArray(current.roles)
    ? current.roles.filter((role): role is string => typeof role === 'string')
    : undefined;
  const permissions = Array.isArray(current.permissions)
    ? current.permissions.filter(
        (permission): permission is string => typeof permission === 'string',
      )
    : undefined;
  return {
    id: String(current.id ?? ''),
    email: String(current.email ?? ''),
    fullName: typeof current.fullName === 'string' ? current.fullName : null,
    avatarUrl: typeof current.avatarUrl === 'string' ? current.avatarUrl : null,
    role: typeof current.role === 'string' ? current.role : undefined,
    roles,
    permissions,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setUser(normalizeUser(await request.get<unknown>('/auth/me')));
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Re-fetch roles when returning to the tab (Profiles may have changed RBAC).
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === 'visible') void reload();
    };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
    };
  }, [reload]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      reload,
      login: () => window.location.assign(apiUrl('/auth/login')),
      logout: async () => {
        await request.post('/auth/logout');
        setUser(null);
        window.location.assign('/');
      },
    }),
    [loading, reload, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
