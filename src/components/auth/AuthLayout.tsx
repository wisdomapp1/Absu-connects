import React from 'react';
import { BrandLogo } from '../common/BrandLogo.tsx';
import { useApp } from '../../context/AppContext.tsx';
import { Sun, Moon } from 'lucide-react';

interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle: string;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({
  children,
  title,
  subtitle,
}) => {
  const { resolvedTheme, toggleTheme } = useApp();

  return (
    <div className="min-h-screen bg-[var(--color-bg-main)] text-[var(--color-text-primary)] flex flex-col justify-between p-4 sm:p-6 transition-colors selection:bg-[var(--color-primary-subtle)] selection:text-[var(--color-primary)]">
      {/* Top Header with Brand and Theme toggle */}
      <header className="max-w-md w-full mx-auto flex items-center justify-between py-2">
        <div className="flex items-center gap-2">
          <BrandLogo size="md" />
          <div className="flex flex-col">
            <span className="font-extrabold text-base sm:text-lg tracking-tight text-[var(--color-primary)] whitespace-nowrap leading-none font-display">
              ABSU <span className="text-[var(--color-text-primary)]">Connect</span>
            </span>
            <span className="text-[9px] font-semibold text-[var(--color-text-secondary)] tracking-wider uppercase mt-0.5">
              Abia State University
            </span>
          </div>
        </div>

        <button
          onClick={toggleTheme}
          className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-primary-subtle)]/60 transition-colors"
          aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
          title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {resolvedTheme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-violet-700" />
          )}
        </button>
      </header>

      {/* Main Form Card Container */}
      <main className="max-w-md w-full mx-auto my-auto py-6">
        <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-5 sm:p-7 shadow-sm transition-colors">
          <div className="text-center mb-6">
            <h1 className="text-xl sm:text-2xl font-extrabold text-[var(--color-text-primary)] tracking-tight">
              {title}
            </h1>
            <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] mt-1.5 leading-relaxed">
              {subtitle}
            </p>
          </div>

          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-md w-full mx-auto text-center text-[11px] text-[var(--color-text-secondary)] py-2">
        <p>© 2026 Abia State University Student Community Network</p>
        <p className="text-[10px] opacity-75 mt-0.5">
          Connecting Uturu, Aba & Umuahia Campuses
        </p>
      </footer>
    </div>
  );
};
