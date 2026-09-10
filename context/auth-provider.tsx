'use client';

import { createContext, useContext } from 'react';
import { useAuthSession } from '@/hooks/useAuthSession';

type AuthStore = ReturnType<typeof useAuthSession>;

const AuthContext = createContext<AuthStore | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuthSession();
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
