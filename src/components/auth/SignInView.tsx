import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { AuthLayout } from './AuthLayout.tsx';
import { validateEmail } from '../../utils/logic.ts';
import { Eye, EyeOff, Lock, Mail, AlertCircle, Loader2, KeyRound } from 'lucide-react';

export const SignInView: React.FC = () => {
  const { signIn, setAuthView, isConfigured, configError } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!validateEmail(email)) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }
    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    setLoading(true);
    const res = await signIn(email, password);
    setLoading(false);

    if (!res.success) {
      setErrorMessage(res.error || 'Failed to sign in. Please check your credentials.');
    }
  };

  return (
    <AuthLayout
      title="Welcome to ABSU Connect"
      subtitle="Sign in to connect with coursemates, join campus discussions, and stay updated."
    >
      {/* Missing configuration notice if publishable key is not set */}
      {!isConfigured && (
        <div className="mb-4 p-3.5 rounded-xl bg-[var(--color-warning)]/15 border border-[var(--color-warning)]/30 text-xs text-[var(--color-text-primary)] flex items-start gap-2.5">
          <KeyRound className="w-4 h-4 text-[var(--color-warning)] shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <p className="font-bold text-[var(--color-warning)]">
              Supabase Configuration Notice
            </p>
            <p className="mt-0.5 text-[var(--color-text-secondary)]">
              {configError ||
                'Please set VITE_SUPABASE_PUBLISHABLE_KEY in your environment to authenticate against the live project.'}
            </p>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="mb-4 p-3 rounded-xl bg-[var(--color-error)]/10 border border-[var(--color-error)]/30 text-xs font-medium text-[var(--color-error)] flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-xs">
        {/* Email Address */}
        <div>
          <label className="block font-semibold text-[var(--color-text-primary)] mb-1.5">
            Email Address
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-[var(--color-text-secondary)] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. yourname@gmail.com or student@absu.edu.ng"
              required
              disabled={loading}
              className="w-full pl-9 pr-3 py-2.5 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-xl text-xs sm:text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:ring-1 focus:ring-[var(--color-primary)] focus:outline-none disabled:opacity-50"
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block font-semibold text-[var(--color-text-primary)]">
              Password
            </label>
            <button
              type="button"
              onClick={() => setAuthView('forgot-password')}
              className="text-[11px] font-semibold text-[var(--color-primary)] hover:underline"
            >
              Forgot password?
            </button>
          </div>
          <div className="relative">
            <Lock className="w-4 h-4 text-[var(--color-text-secondary)] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              disabled={loading}
              className="w-full pl-9 pr-10 py-2.5 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-xl text-xs sm:text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:ring-1 focus:ring-[var(--color-primary)] focus:outline-none disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] p-1"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full mt-2 py-2.5 px-4 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs sm:text-sm font-bold shadow-sm transition-all active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2 min-h-[44px]"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Signing in...</span>
            </>
          ) : (
            <span>Sign In</span>
          )}
        </button>

        {/* Link to Sign Up */}
        <div className="text-center pt-3 border-t border-[var(--color-border)] text-xs text-[var(--color-text-secondary)]">
          Don't have an ABSU Connect account?{' '}
          <button
            type="button"
            onClick={() => setAuthView('signup')}
            className="font-bold text-[var(--color-primary)] hover:underline inline-flex items-center ml-1"
          >
            Create an account
          </button>
        </div>
      </form>
    </AuthLayout>
  );
};
