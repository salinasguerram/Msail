import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { api, getRefreshToken, initSession, setSession, setSessionExpiredHandler } from '@/api/client';
import type { Tokens } from '@/auth/tokenStorage';
import { currentLanguage, setLanguage } from '@/i18n';

export type User = {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  country: string | null;
  preferred_language: 'es' | 'en';
  /** Recibe por email los avisos de las regatas que sigue. */
  email_notifications: boolean;
  email_verified: boolean;
  date_joined: string;
  /** Equipo de MSAIL: puede entrar al panel de administración. */
  is_staff?: boolean;
  /** Tiene MSAIL Premium (ve el contenido exclusivo). */
  is_premium?: boolean;
  /** false si entró con Google o Apple y no tiene contraseña. */
  has_password?: boolean;
};

type AuthResponse = Tokens & { user: User };

export type RegisterData = { email: string; password: string; first_name: string; last_name: string };

type AuthContextValue = {
  user: User | null;
  /** true mientras se recupera la sesión guardada al abrir la app. */
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (data: RegisterData) => Promise<User>;
  logout: () => Promise<void>;
  verifyEmail: (code: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  confirmPasswordReset: (email: string, code: string, newPassword: string) => Promise<void>;
  updateLanguage: (language: 'es' | 'en') => Promise<void>;
  /** Nombre, apellido y país de la cuenta. */
  updateMe: (data: Partial<Pick<User, 'first_name' | 'last_name' | 'country' | 'email_notifications'>>) => Promise<User>;
  /** Vuelve a pedir la cuenta (ej. después de pagar Premium). */
  refreshUser: () => Promise<void>;
  /** Elimina la cuenta y todos sus datos (con la contraseña, o el email si entró con Google o Apple). */
  deleteAccount: (confirmation: { password: string } | { email: string }) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSessionExpiredHandler(() => setUser(null));
    (async () => {
      try {
        if (await initSession()) setUser(await api<User>('/auth/me/'));
      } catch {
        // sin red o sesión vencida: se entra como invitado
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const startSession = useCallback(async ({ user: nextUser, ...tokens }: AuthResponse) => {
    await setSession(tokens);
    // El idioma guardado en la cuenta manda, así es el mismo en todos los dispositivos.
    await setLanguage(nextUser.preferred_language);
    setUser(nextUser);
    return nextUser;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login: async (email, password) =>
        startSession(await api<AuthResponse>('/auth/login/', { method: 'POST', body: { email, password }, auth: false })),
      register: async (data) =>
        startSession(
          await api<AuthResponse>('/auth/register/', {
            method: 'POST',
            body: { ...data, preferred_language: currentLanguage() },
            auth: false,
          }),
        ),
      logout: async () => {
        const refresh = getRefreshToken();
        if (refresh) await api('/auth/logout/', { method: 'POST', body: { refresh } }).catch(() => {});
        await setSession(null);
        setUser(null);
      },
      verifyEmail: async (code) => {
        setUser(await api<User>('/auth/verify-email/', { method: 'POST', body: { code } }));
      },
      resendVerification: async () => {
        await api('/auth/verify-email/resend/', { method: 'POST' });
      },
      requestPasswordReset: async (email) => {
        await api('/auth/password-reset/', { method: 'POST', body: { email }, auth: false });
      },
      confirmPasswordReset: async (email, code, newPassword) => {
        await startSession(
          await api<AuthResponse>('/auth/password-reset/confirm/', {
            method: 'POST',
            body: { email, code, new_password: newPassword },
            auth: false,
          }),
        );
      },
      updateLanguage: async (language) => {
        await setLanguage(language);
        if (user) setUser(await api<User>('/auth/me/', { method: 'PATCH', body: { preferred_language: language } }));
      },
      updateMe: async (data) => {
        const updated = await api<User>('/auth/me/', { method: 'PATCH', body: data });
        setUser(updated);
        return updated;
      },
      refreshUser: async () => {
        if (user) setUser(await api<User>('/auth/me/'));
      },
      deleteAccount: async (confirmation) => {
        await api('/auth/delete-account/', { method: 'POST', body: confirmation });
        await setSession(null);
        setUser(null);
      },
    }),
    [user, loading, startSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return context;
}
