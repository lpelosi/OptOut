import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, clearTokens, loadTokens, onAuthChange, setTokens } from '@/api/client';

type AuthState = {
  ready: boolean; // finished restoring tokens from storage
  signedIn: boolean;
  signInWithApple: (identityToken: string, fullName?: string) => Promise<void>;
  signInWithGoogle: (idToken: string) => Promise<void>;
  requestMagicCode: (email: string) => Promise<void>;
  verifyMagicCode: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    loadTokens().then((has) => {
      setSignedIn(has);
      setReady(true);
    });
    return onAuthChange(setSignedIn);
  }, []);

  const store = async (data: { accessToken: string; refreshToken: string }) =>
    setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });

  const value: AuthState = {
    ready,
    signedIn,
    signInWithApple: async (identityToken, fullName) => {
      const data = await api<any>('/api/auth/apple', { method: 'POST', auth: false, body: { identityToken, fullName } });
      await store(data);
    },
    signInWithGoogle: async (idToken) => {
      const data = await api<any>('/api/auth/google', { method: 'POST', auth: false, body: { idToken } });
      await store(data);
    },
    requestMagicCode: async (email) => {
      await api('/api/auth/magic/request', { method: 'POST', auth: false, body: { email } });
    },
    verifyMagicCode: async (email, code) => {
      const data = await api<any>('/api/auth/magic/verify', { method: 'POST', auth: false, body: { email, code } });
      await store(data);
    },
    signOut: async () => {
      await clearTokens();
    },
    deleteAccount: async () => {
      await api('/api/auth/delete-account', { method: 'DELETE' });
      await clearTokens();
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
