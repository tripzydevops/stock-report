'use client';

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const { signInWithEmail, signUpWithEmail, enterDemoMode } = useAuth();
  const { language } = useLanguage();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      if (isSignUp) {
        const { error } = await signUpWithEmail(email, password);
        if (error) {
          setErrorMsg(error.message);
        } else {
          setSuccessMsg(
            language === 'tr'
              ? 'Hesabınız oluşturuldu! E-postanızı kontrol edin veya doğrudan giriş yapın.'
              : 'Account created! Check your email confirmation or sign in directly.'
          );
        }
      } else {
        const { error } = await signInWithEmail(email, password);
        if (error) {
          setErrorMsg(error.message);
        } else {
          onClose();
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoMode = () => {
    enterDemoMode();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-gray-850 rounded-2xl max-w-md w-full border border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg p-1"
        >
          ✕
        </button>

        <div className="text-center mb-6">
          <div className="inline-flex p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 text-2xl mb-2">
            👤
          </div>
          <h3 className="text-xl font-black text-gray-900 dark:text-white">
            {isSignUp
              ? (language === 'tr' ? 'Hesap Oluştur' : 'Create an Account')
              : (language === 'tr' ? 'Giriş Yap' : 'Sign In')}
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            {language === 'tr'
              ? 'Kişisel portföyünüzü, emirlerinizi ve DCA analizlerinizi güvenle yönetin.'
              : 'Securely manage your personal portfolio, orders, and DCA strategies.'}
          </p>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs">
            ⚠️ {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs">
            ✓ {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
              {language === 'tr' ? 'E-posta Adresi' : 'Email Address'}
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="trader@marketpulse.com"
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-750 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
              {language === 'tr' ? 'Şifre' : 'Password'}
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-750 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl font-black text-sm text-white bg-blue-600 hover:bg-blue-700 active:scale-98 transition-all shadow-md shadow-blue-500/25 cursor-pointer disabled:opacity-50"
          >
            {loading ? '...' : isSignUp ? (language === 'tr' ? 'Kayıt Ol' : 'Sign Up') : (language === 'tr' ? 'Giriş Yap' : 'Sign In')}
          </button>
        </form>

        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex flex-col items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className="text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer"
          >
            {isSignUp
              ? (language === 'tr' ? 'Zaten hesabınız var mı? Giriş Yapın' : 'Already have an account? Sign In')
              : (language === 'tr' ? 'Hesabınız yok mu? Yeni Hesap Açın' : "Don't have an account? Sign Up")}
          </button>

          <span className="text-gray-400 text-[11px]">— {language === 'tr' ? 'veya' : 'or'} —</span>

          <button
            type="button"
            onClick={handleDemoMode}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-gray-100 hover:bg-gray-200 dark:bg-gray-750 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 transition-colors cursor-pointer w-full"
          >
            👀 {language === 'tr' ? 'Misafir / Model Portföy Modu İle Devam Et' : 'Continue as Guest / Model Portfolio Mode'}
          </button>
        </div>
      </div>
    </div>
  );
}
