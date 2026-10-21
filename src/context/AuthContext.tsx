import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as authService from '../services/authService';
import type { User } from '../types';

interface AuthContextValue {
  user: User | null;
  login: (identifier: string, password: string, remember: boolean) => Promise<User>;
  /** Checks an email verification code; returns the user when the code also signed them in. */
  verifyEmail: (email: string, code: string) => Promise<User | null>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => authService.getStoredUser());

  // Supabase sessions expire; if so, send the user back to the login page
  useEffect(() => {
    if (!user) return;
    void authService.hasValidSession().then((ok) => {
      if (!ok) {
        authService.clearSession();
        setUser(null);
      }
    });
  }, []); // only on first load

  const login = useCallback(async (identifier: string, password: string, remember: boolean) => {
    const u = await authService.login(identifier, password, remember);
    setUser(u);
    return u;
  }, []);

  const verifyEmail = useCallback(async (email: string, code: string) => {
    const u = await authService.verifyEmailCode(email, code);
    if (u) setUser(u);
    return u;
  }, []);

  const logout = useCallback(() => {
    authService.clearSession();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, login, verifyEmail, logout }), [user, login, verifyEmail, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
