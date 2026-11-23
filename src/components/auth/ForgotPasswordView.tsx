import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { AuthLayout } from './AuthLayout.tsx';
import { validateEmail } from '../../utils/logic.ts';
import { Mail, AlertCircle, CheckCircle2, Loader2, ArrowLeft } from 'lucide-react';

export const ForgotPasswordView: React.FC = () => {
  const { resetPasswordForEmail, setAuthView } = useAuth();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!validateEmail(email)) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    const res = await resetPasswordForEmail(email.trim());
    setLoading(false);

    if (!res.success) {
      setErrorMessage(res.error || 'Failed to request password reset. Please try again.');
      return;
    }

    setSubmitted(true);
  };

  return (
    <AuthLayout
      title="Reset Your Password"
      subtitle="Enter your email to receive recovery instructions."
    >
      {submitted ? (
        <div className="flex flex-col items-center text-center py-2">
          <div className="w-12 h-12 rounded-full bg-[var(--color-success)]/15 text-[var(--color-success)] flex items-center justify-center mb-3">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-[var(--color-text-primary)]">
            Check Your Email
          </h2>
          <p className="text-xs text-[var(--color-text-secondary)] mt-2 leading-relaxed max-w-xs">
            If an account is associated with <span className="font-semibold text-[var(--color-text-primary)]">{email}</span>, you will receive a password reset link shortly.
          </p>
          <button
            type="button"
            onClick={() => setAuthView('signin')}
            className="mt-5 w-full py-2.5 px-4 rounded-xl bg-[var(--color-primary)] text-white text-xs sm:text-sm font-bold shadow-sm hover:bg-[var(--color-primary-hover)] transition-all"
          >
            Return to Sign In
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-xs">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-[var(--color-error)]/10 border border-[var(--color-error)]/30 text-xs font-medium text-[var(--color-error)] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div>
            <label className="block font-semibold text-[var(--color-text-primary)] mb-1.5">
              Account Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-[var(--color-text-secondary)] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. student@gmail.com"
                autoComplete="email"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                inputMode="email"
                enterKeyHint="send"
                required
                disabled={loading}
                className="w-full pl-9 pr-3 py-2.5 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-xl text-xs sm:text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:ring-1 focus:ring-[var(--color-primary)] focus:outline-none disabled:opacity-50"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs sm:text-sm font-bold shadow-sm transition-all active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2 min-h-[44px]"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Sending link...</span>
              </>
            ) : (
              <span>Send Password Reset Link</span>
            )}
          </button>

          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => setAuthView('signin')}
              className="text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] inline-flex items-center gap-1.5 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Sign In</span>
            </button>
          </div>
        </form>
      )}
    </AuthLayout>
  );
};
