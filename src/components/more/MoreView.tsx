import React from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { Avatar } from '../common/Avatar.tsx';
import { BrandLogo } from '../common/BrandLogo.tsx';
import {
  ShoppingBag,
  Bookmark,
  Activity,
  ShieldCheck,
  ShieldAlert,
  Settings,
  HelpCircle,
  Moon,
  Sun,
  LogOut,
  ChevronRight,
  EyeOff,
} from 'lucide-react';

export const MoreView: React.FC = () => {
  const {
    currentUser,
    resolvedTheme,
    toggleTheme,
    navigateTo,
    addToast,
    isSuperAdmin,
    openAdminDashboard,
  } = useApp();
  const { signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    addToast('Signed out of ABSU Connect', 'info');
  };

  const shortcuts = [
    {
      id: 'saved',
      title: 'Saved',
      description: 'Bookmarks & important announcements',
      icon: Bookmark,
      colorClass: 'text-violet-500 bg-violet-500/10',
      badge: null,
      onClick: () => navigateTo('saved'),
    },
    {
      id: 'mr-anonymous',
      title: 'Mr Anonymous',
      description: 'Campus confessions, gist & anonymous submissions',
      icon: EyeOff,
      colorClass: 'text-purple-600 bg-purple-600/10',
      badge: 'Official',
      onClick: () => navigateTo('mr-anonymous'),
    },
    {
      id: 'marketplace',
      title: 'Marketplace',
      description: 'Buy and sell textbooks & student essentials',
      icon: ShoppingBag,
      colorClass: 'text-amber-500 bg-amber-500/10',
      badge: 'Coming Soon',
      onClick: () => navigateTo('marketplace'),
    },
    {
      id: 'activity',
      title: 'Your Activity',
      description: 'Posts, reactions & student engagement',
      icon: Activity,
      colorClass: 'text-rose-500 bg-rose-500/10',
      badge: null,
      onClick: () => navigateTo('activity'),
    },
    {
      id: 'safety',
      title: 'Safety Center',
      description: 'Emergency contacts & campus policies',
      icon: ShieldCheck,
      colorClass: 'text-teal-500 bg-teal-500/10',
      badge: null,
      onClick: () => navigateTo('safety'),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* 1. User Profile Header Card */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 shadow-sm transition-colors">
        <button
          onClick={() => navigateTo('profile')}
          className="flex items-center justify-between w-full text-left group"
        >
          <div className="flex items-center gap-3 min-w-0">
            <Avatar src={currentUser.avatar} name={currentUser.name} size="lg" />
            <div className="min-w-0">
              <h2 className="font-bold text-base text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)] transition-colors truncate">
                {currentUser.name}
              </h2>
              <p className="text-xs text-[var(--color-text-secondary)] truncate">
                {currentUser.department} · {currentUser.level}
              </p>
              <p className="text-[11px] text-[var(--color-primary)] font-semibold mt-0.5">
                View your profile
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-[var(--color-text-secondary)] group-hover:text-[var(--color-primary)] transition-colors shrink-0" />
        </button>
      </div>

      {/* Super Admin Control Center Access */}
      {isSuperAdmin && (
        <div className="bg-gradient-to-r from-emerald-950/80 via-teal-950/80 to-slate-900 border border-emerald-500/40 rounded-2xl p-4 shadow-md transition-all">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-sm text-white">Super Admin Dashboard</h4>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Live Control
                  </span>
                </div>
                <p className="text-xs text-emerald-200/70 truncate">
                  Backend sync, campus moderation, system health & user management
                </p>
              </div>
            </div>
            <button
              onClick={openAdminDashboard}
              className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold shadow-sm transition-all active:scale-95 shrink-0"
            >
              Open Dashboard
            </button>
          </div>
        </div>
      )}

      {/* 2. Responsive Two-Column Shortcut Grid */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)] px-1 mb-2.5">
          Campus Shortcuts
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {shortcuts.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={item.onClick}
                className="min-h-[116px] p-3.5 sm:p-4 rounded-[16px] bg-[var(--color-bg-card)] border border-[var(--color-border)] hover:border-[var(--color-primary)]/50 focus:border-[var(--color-primary)] focus:outline-none shadow-xs text-left transition-all active:scale-[0.98] group flex flex-col justify-between"
              >
                <div className="flex items-start justify-between gap-1 w-full">
                  <div
                    className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 ${item.colorClass}`}
                  >
                    <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  {item.badge && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[var(--color-primary-subtle)] text-[var(--color-primary)] shrink-0">
                      {item.badge}
                    </span>
                  )}
                </div>

                <div className="mt-2 min-w-0">
                  <h4 className="text-sm sm:text-base font-bold text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)] transition-colors truncate">
                    {item.title}
                  </h4>
                  <p className="text-[11px] text-[var(--color-text-secondary)] line-clamp-2 mt-0.5 leading-snug">
                    {item.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Settings & Preferences Group */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)] px-1 mb-2.5">
          Preferences & Controls
        </h3>
        <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-2 shadow-sm transition-colors flex flex-col gap-1">
          {/* Settings & Privacy */}
          <button
            onClick={() => navigateTo('settings')}
            className="flex items-center justify-between p-3 rounded-xl hover:bg-[var(--color-bg-main)] transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[var(--color-primary-subtle)] text-[var(--color-primary)] flex items-center justify-center">
                <Settings className="w-5 h-5" />
              </div>
              <div>
                <span className="text-sm font-bold text-[var(--color-text-primary)]">
                  Settings & Privacy
                </span>
                <p className="text-xs text-[var(--color-text-secondary)]">
                  Account, security & privacy controls
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[var(--color-text-secondary)]" />
          </button>

          {/* Quick Theme Toggle Item */}
          <button
            onClick={toggleTheme}
            className="flex items-center justify-between p-3 rounded-xl hover:bg-[var(--color-bg-main)] transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-violet-500/15 text-[var(--color-primary)] flex items-center justify-center">
                {resolvedTheme === 'dark' ? (
                  <Sun className="w-5 h-5 text-amber-400" />
                ) : (
                  <Moon className="w-5 h-5 text-violet-700" />
                )}
              </div>
              <div>
                <span className="text-sm font-bold text-[var(--color-text-primary)]">
                  Appearance Mode
                </span>
                <p className="text-xs text-[var(--color-text-secondary)]">
                  Currently: {resolvedTheme === 'dark' ? 'Dark Mode' : 'Light Mode'}
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-[var(--color-primary-subtle)] text-[var(--color-primary)]">
              Toggle
            </span>
          </button>

          {/* Help & Support */}
          <button
            onClick={() =>
              addToast('Student Support Desk: support@absuconnect.edu.ng', 'info')
            }
            className="flex items-center justify-between p-3 rounded-xl hover:bg-[var(--color-bg-main)] transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <HelpCircle className="w-5 h-5" />
              </div>
              <div>
                <span className="text-sm font-bold text-[var(--color-text-primary)]">
                  Help & Student Support
                </span>
                <p className="text-xs text-[var(--color-text-secondary)]">
                  Campus life FAQs & IT ticketing
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[var(--color-text-secondary)]" />
          </button>
        </div>
      </div>

      {/* 4. Sign Out Action */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-2 shadow-sm transition-colors">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 w-full p-3 rounded-xl text-left text-[var(--color-error)] hover:bg-[var(--color-error)]/10 transition-colors font-bold text-sm"
        >
          <LogOut className="w-5 h-5" />
          <span>Sign Out</span>
        </button>
      </div>

      {/* 5. Footer Info */}
      <div className="text-center text-[11px] text-[var(--color-text-secondary)] py-2 flex flex-col items-center">
        <BrandLogo size="sm" className="mb-2" />
        <p className="font-semibold text-[var(--color-text-primary)]">ABSU Connect</p>
        <p className="mt-0.5">Abia State University Student Engagement Platform</p>
        <p className="text-[10px] opacity-75 mt-0.5">
          Uturu Main Campus · Aba Health Sciences · Umuahia Campus
        </p>
      </div>

    </div>
  );
};
