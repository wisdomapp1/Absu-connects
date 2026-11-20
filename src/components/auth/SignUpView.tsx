import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { AuthLayout } from './AuthLayout.tsx';
import {
  validateEmail,
  validatePassword,
  validatePasswordMatch,
} from '../../utils/logic.ts';
import {
  User as UserIcon,
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Loader2,
  KeyRound,
} from 'lucide-react';

export const SignUpView: React.FC = () => {
  const { signUp, setAuthView, isConfigured, configError } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmationNotice, setConfirmationNotice] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setConfirmationNotice(null);

    if (!fullName.trim()) {
      setErrorMessage('Please enter your full name.');
      return;
    }
    if (!validateEmail(email)) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      setErrorMessage(passwordValidation.error || 'Password is too weak.');
      return;
    }

    const matchValidation = validatePasswordMatch(password, confirmPassword);
    if (!matchValidation.valid) {
      setErrorMessage(matchValidation.error || 'Passwords do not match.');
      return;
    }

    setLoading(true);
    const res = await signUp(fullName.trim(), email.trim(), password);
    setLoading(false);

    if (!res.success) {
      setErrorMessage(res.error || 'Registration failed. Please try again.');
      return;
    }

    if (res.requireEmailConfirmation) {
      setConfirmationNotice(
        `Account created successfully! A verification email has been sent to ${email}. Please check your inbox and click the confirmation link to complete registration.`
      );
    }
  };

  return (
    <AuthLayout
      title="Create Your Account"
      subtitle="Join Abia State University's student community network."
    >
      {/* Missing configuration notice */}
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

      {/* Email confirmation notice */}
      {confirmationNotice && (
        <div className="mb-4 p-3.5 rounded-xl bg-[var(--color-success)]/15 border border-[var(--color-success)]/30 text-xs text-[var(--color-text-primary)] flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-[var(--color-success)] shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <p className="font-bold text-[var(--color-success)]">
              Confirmation Email Sent
            </p>
            <p className="mt-1 text-[var(--color-text-secondary)]">
              {confirmationNotice}
            </p>
            <button
              type="button"
              onClick={() => setAuthView('signin')}
              className="mt-3 px-3 py-1.5 rounded-lg bg-[var(--color-primary)] text-white text-xs font-semibold"
            >
              Back to Sign In
            </button>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="mb-4 p-3 rounded-xl bg-[var(--color-error)]/10 border border-[var(--color-error)]/30 text-xs font-medium text-[var(--color-error)] flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {!confirmationNotice && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5 text-xs">
          {/* Full Name */}
          <div>
            <label className="block font-semibold text-[var(--color-text-primary)] mb-1">
              Full Name
            </label>
            <div className="relative">
              <UserIcon className="w-4 h-4 text-[var(--color-text-secondary)] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Chinedu Okeke"
                required
                disabled={loading}
                className="w-full pl-9 pr-3 py-2.5 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-xl text-xs sm:text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:ring-1 focus:ring-[var(--color-primary)] focus:outline-none disabled:opacity-50"
              />
            </div>
          </div>

          {/* Email Address */}
          <div>
            <label className="block font-semibold text-[var(--color-text-primary)] mb-1">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-[var(--color-text-secondary)] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. student@gmail.com or student@absu.edu.ng"
                required
                disabled={loading}
                className="w-full pl-9 pr-3 py-2.5 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-xl text-xs sm:text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:ring-1 focus:ring-[var(--color-primary)] focus:outline-none disabled:opacity-50"
              />
            </div>
            <span className="text-[10px] text-[var(--color-text-secondary)] mt-0.5 block">
              Any valid email address is accepted.
            </span>
          </div>

          {/* Password */}
          <div>
            <label className="block font-semibold text-[var(--color-text-primary)] mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[var(--color-text-secondary)] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
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

          {/* Confirm Password */}
          <div>
            <label className="block font-semibold text-[var(--color-text-primary)] mb-1">
              Confirm Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[var(--color-text-secondary)] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                required
                disabled={loading}
                className="w-full pl-9 pr-10 py-2.5 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-xl text-xs sm:text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:ring-1 focus:ring-[var(--color-primary)] focus:outline-none disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] p-1"
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
              >
                {showConfirmPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
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
                <span>Creating account...</span>
              </>
            ) : (
              <span>Create Account</span>
            )}
          </button>

          {/* Link to Sign In */}
          <div className="text-center pt-3 border-t border-[var(--color-border)] text-xs text-[var(--color-text-secondary)]">
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => setAuthView('signin')}
              className="font-bold text-[var(--color-primary)] hover:underline inline-flex items-center ml-1"
            >
              Sign In
            </button>
          </div>
        </form>
      )}
    </AuthLayout>
  );
};
