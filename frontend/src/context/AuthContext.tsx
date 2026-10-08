/**
 * Estado global de autenticación: usuario, token (SecureStore) y acciones.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { api, getToken, setToken } from '@/services/api';

export type User = {
  id: number;
  name: string;
  email: string;
  age: number | null;
  weight_kg: number | null;
  height_cm: number | null;
  goal: string | null;
  level: string;
  workouts_per_week: number;
  premium: boolean;
  created_at: string;
};

type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: Record<string, unknown>) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        if (token) {
          const res = await api.get<{ user: User }>('/auth/me');
          setUser(res.user);
        }
      } catch {
        await setToken(null);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ token: string; user: User }>('/auth/login', { email, password });
    await setToken(res.token);
    setUser(res.user);
  }, []);

  const register = useCallback(async (data: Record<string, unknown>) => {
    const res = await api.post<{ token: string; user: User }>('/auth/register', data);
    await setToken(res.token);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    await setToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const res = await api.get<{ user: User }>('/auth/me');
    setUser(res.user);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}