'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { User, Session } from '@supabase/supabase-js';

export const ADMIN_USER_ID = 'b509e10d-863a-4d3a-9b1d-c1ec13e49dcb';
export const ADMIN_EMAIL = 'asknsezen@gmail.com';

export const DEFAULT_ADMIN_USER: User = {
  id: ADMIN_USER_ID,
  app_metadata: { provider: 'email', providers: ['email'], role: 'admin' },
  user_metadata: { name: 'Admin', role: 'admin' },
  aud: 'authenticated',
  confirmation_sent_at: '',
  recovery_sent_at: '',
  email_change_sent_at: '',
  new_email: '',
  invited_at: '',
  action_link: '',
  email: ADMIN_EMAIL,
  phone: '',
  created_at: '2026-10-15T11:59:23.78992Z',
  confirmed_at: '2026-10-15T11:59:23.78992Z',
  email_confirmed_at: '2026-10-15T11:59:23.78992Z',
  phone_confirmed_at: '',
  last_sign_in_at: '2026-11-10T16:00:00.000Z',
  role: 'authenticated',
  updated_at: '2026-11-11T11:00:00.000Z',
  identities: [],
  factors: [],
} as User;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isDemoMode: boolean;
  isAdmin: boolean;
  signInWithEmail: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUpWithEmail: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  enterDemoMode: () => void;
  exitDemoMode: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(DEFAULT_ADMIN_USER);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);

  useEffect(() => {
    // 1. Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? DEFAULT_ADMIN_USER);
      if (session?.user) {
        setIsDemoMode(false);
      }
      setIsLoading(false);
    });

    // 2. Listen for auth state changes (login, logout, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? DEFAULT_ADMIN_USER);
      if (session?.user) {
        setIsDemoMode(false);
      }
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signInWithEmail = async (email: string, password: string) => {
    setIsLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setIsLoading(false);
    return { error: error as Error | null };
  };

  const signUpWithEmail = async (email: string, password: string) => {
    setIsLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });
    setIsLoading(false);
    return { error: error as Error | null };
  };

  const signOut = async () => {
    setIsLoading(true);
    await supabase.auth.signOut();
    setUser(DEFAULT_ADMIN_USER);
    setSession(null);
    setIsDemoMode(false);
    setIsLoading(false);
  };

  const enterDemoMode = () => {
    setIsDemoMode(true);
  };

  const exitDemoMode = () => {
    setIsDemoMode(false);
  };

  const isAdmin = Boolean(user?.id === ADMIN_USER_ID || user?.email === ADMIN_EMAIL || !user);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoading,
        isDemoMode,
        isAdmin,
        signInWithEmail,
        signUpWithEmail,
        signOut,
        enterDemoMode,
        exitDemoMode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    return {
      user: DEFAULT_ADMIN_USER,
      session: null,
      isLoading: false,
      isDemoMode: false,
      isAdmin: true,
      signInWithEmail: async () => ({ error: new Error('Auth context not available') }),
      signUpWithEmail: async () => ({ error: new Error('Auth context not available') }),
      signOut: async () => {},
      enterDemoMode: () => {},
      exitDemoMode: () => {},
    };
  }
  return context;
}
