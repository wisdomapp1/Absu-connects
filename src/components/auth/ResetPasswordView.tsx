import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { AuthLayout } from './AuthLayout.tsx';
import { validatePassword, validatePasswordMatch } from '../../utils/logic.ts';
import {
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Loader2,
  KeyRound,
  ArrowRight,
} from 'lucide-react';

export const ResetPasswordView: React.FC = () => {
  const { session, updateUserPassword, setAuthView } = useAuth();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // If user navigated here without a recovery session or token
  const hasValidRecoverySession = Boolean(session);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

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
    const res = await updateUserPassword(password);
    setLoading(false);

    if (!res.success) {
      setErrorMessage(
        res.error ||
          'Failed to update password. Your recovery link may have expired or already been used.'
      );
      return;
    }

    setSuccess(true);
  };

  return (
    <AuthLayout
      title="Create New Password"
      subtitle="Choose a strong, secure password for your ABSU Connect account."
    >
      {success ? (
        <div className="flex flex-col items-center text-center py-2">
          <div className="w-12 h-12 rounded-full bg-[var(--color-success)]/15 text-[var(--color-success)] flex items-center justify-center mb-3">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-[var(--color-text-primary)]">
            Password Updated Successfully
          </h2>
          <p className="text-xs text-[var(--color-text-secondary)] mt-2 leading-relaxed max-w-xs">
            Your password has been changed in your account. You can now access ABSU Connect.
          </p>
          <button
            type="button"
            onClick={() => setAuthView('app')}
            className="mt-5 w-full py-2.5 px-4 rounded-xl bg-[var(--color-primary)] text-white text-xs sm:text-sm font-bold shadow-sm hover:bg-[var(--color-primary-hover)] transition-all flex items-center justify-center gap-2"
          >
            <span>Continue to ABSU Connect</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      ) : !hasValidRecoverySession ? (
        <div className="flex flex-col items-center text-center py-2">
          <div className="w-12 h-12 rounded-full bg-[var(--color-warning)]/15 text-[var(--color-warning)] flex items-center justify-center mb-3">
            <KeyRound className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-[var(--color-text-primary)]">
            Recovery Session Not Detected
          </h2>
          <p className="text-xs text-[var(--color-text-secondary)] mt-2 leading-relaxed max-w-xs">
            This password reset link is invalid, expired, or was already used. Please request a fresh reset link to continue.
          </p>
          <button
            type="button"
            onClick={() => setAuthView('forgot-password')}
            className="mt-5 w-full py-2.5 px-4 rounded-xl bg-[var(--color-primary)] text-white text-xs sm:text-sm font-bold shadow-sm hover:bg-[var(--color-primary-hover)] transition-all"
          >
            Request New Reset Link
          </button>
          <button
            type="button"
            onClick={() => setAuthView('signin')}
            className="mt-2 text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          >
            Back to Sign In
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5 text-xs">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-[var(--color-error)]/10 border border-[var(--color-error)]/30 text-xs font-medium text-[var(--color-error)] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* New Password */}
          <div>
            <label className="block font-semibold text-[var(--color-text-primary)] mb-1">
              New Password
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

          {/* Confirm New Password */}
          <div>
            <label className="block font-semibold text-[var(--color-text-primary)] mb-1">
              Confirm New Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[var(--color-text-secondary)] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your new password"
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
                <span>Updating password...</span>
              </>
            ) : (
              <span>Update Password</span>
            )}
          </button>
        </form>
      )}
    </AuthLayout>
  );
};
