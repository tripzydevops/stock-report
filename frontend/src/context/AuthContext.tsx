'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { User, Session } from '@supabase/supabase-js';

// The canonical Model Portfolio owner ID used for unauthenticated/demo data presentation
export const MODEL_PORTFOLIO_USER_ID = 'b509e10d-863a-4d3a-9b1d-c1ec13e49dcb';
export const ADMIN_USER_ID = MODEL_PORTFOLIO_USER_ID;
export const ADMIN_EMAIL = 'successofmentors@gmail.com';
export const TRIAL_ADMIN_PASSWORD = process.env.NEXT_PUBLIC_TRIAL_ADMIN_PASSWORD || 'PulseA_e4cbcd473c3e54b5ac2c62170eff3adc!';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isDemoMode: boolean;
  isAdmin: boolean;
  signInWithEmail: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUpWithEmail: (email: string, password: string) => Promise<{ error: Error | null }>;
  signInAsAdmin: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  enterDemoMode: () => void;
  exitDemoMode: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);

  useEffect(() => {
    // 1. Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setSession(session);
        setUser(session.user);
        setIsDemoMode(false);
        setIsLoading(false);
      } else {
        const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
        const urlAdminTrigger = urlParams && (
          urlParams.get('admin_token') === 'pulse' ||
          urlParams.get('dev_admin') === 'true' ||
          urlParams.get('admin') === 'true' ||
          urlParams.get('admin') === '1' ||
          urlParams.get('admin') === 'pulse' ||
          urlParams.get('login') === 'admin'
        );
        const localTrialAdmin = typeof window !== 'undefined' && localStorage.getItem('marketpulse_trial_admin_enabled') === 'true';

        if (urlAdminTrigger || localTrialAdmin) {
          if (typeof window !== 'undefined' && urlAdminTrigger) {
            localStorage.setItem('marketpulse_trial_admin_enabled', 'true');
            // Clean up the URL query param without full page reload
            const cleanUrl = window.location.pathname + window.location.hash;
            window.history.replaceState(null, '', cleanUrl);
          }
          supabase.auth.signInWithPassword({
            email: ADMIN_EMAIL,
            password: TRIAL_ADMIN_PASSWORD,
          }).then(({ data, error }) => {
            if (!error && data?.session) {
              setSession(data.session);
              setUser(data.session.user);
              setIsDemoMode(false);
            }
            setIsLoading(false);
          }).catch(() => {
            setIsLoading(false);
          });
        } else {
          setSession(null);
          setUser(null);
          setIsLoading(false);
        }
      }
    });

    // 2. Listen for auth state changes (login, logout, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
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

  const signInAsAdmin = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: ADMIN_EMAIL,
      password: TRIAL_ADMIN_PASSWORD,
    });
    if (!error && data?.session) {
      setSession(data.session);
      setUser(data.session.user);
      setIsDemoMode(false);
      if (typeof window !== 'undefined') {
        localStorage.setItem('marketpulse_trial_admin_enabled', 'true');
      }
    }
    setIsLoading(false);
    return { error: error as Error | null };
  };

  const signOut = async () => {
    setIsLoading(true);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('marketpulse_trial_admin_enabled');
    }
    await supabase.auth.signOut();
    setUser(null);
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

  const isAdmin = Boolean(
    user && (
      user.id === ADMIN_USER_ID ||
      user.email === ADMIN_EMAIL ||
      user.app_metadata?.role === 'admin' ||
      user.user_metadata?.role === 'admin'
    )
  );

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
        signInAsAdmin,
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
      user: null,
      session: null,
      isLoading: false,
      isDemoMode: false,
      isAdmin: false,
      signInWithEmail: async () => ({ error: new Error('Auth context not available') }),
      signUpWithEmail: async () => ({ error: new Error('Auth context not available') }),
      signInAsAdmin: async () => ({ error: new Error('Auth context not available') }),
      signOut: async () => {},
      enterDemoMode: () => {},
      exitDemoMode: () => {},
    };
  }
  return context;
}
