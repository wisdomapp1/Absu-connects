import React from 'react';
import { useApp } from '../../context/AppContext.tsx';
import type { MainNavTab } from '../../types/index.ts';
import { Home, Clapperboard, Users, MessageSquare, Bell, Menu, Plus, Sparkles, EyeOff } from 'lucide-react';
import { Avatar } from '../common/Avatar.tsx';

export const DesktopSidebar: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    currentUser,
    unreadMessagesCount,
    unreadNotificationsCount,
    setCreatePostModalOpen,
    navigateTo,
  } = useApp();

  const navItems = [
    { id: 'home' as MainNavTab, label: 'Home Feed', icon: Home },
    { id: 'reels' as MainNavTab, label: 'Reels', icon: Clapperboard },
    { id: 'friends' as MainNavTab, label: 'Friends & Discovery', icon: Users },
    { id: 'messages' as MainNavTab, label: 'Messages', icon: MessageSquare, badgeCount: unreadMessagesCount },
    { id: 'alerts' as MainNavTab, label: 'Alerts', icon: Bell, badgeCount: unreadNotificationsCount },
    { id: 'more' as MainNavTab, label: 'More Services', icon: Menu },
  ];

  return (
    <aside className="hidden md:flex flex-col w-64 shrink-0 sticky top-20 self-start p-3 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl shadow-sm transition-colors">
      {/* User Quick Profile Snippet */}
      <button
        onClick={() => navigateTo('profile')}
        className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-[var(--color-primary-subtle)]/50 transition-colors text-left mb-2 group"
      >
        <Avatar src={currentUser.avatar} name={currentUser.name} size="md" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)] transition-colors truncate">
            {currentUser.name}
          </p>
          <p className="text-xs text-[var(--color-text-secondary)] truncate">
            {currentUser.department}
          </p>
        </div>
      </button>

      <div className="h-px bg-[var(--color-border)] my-1" />

      {/* Primary Navigation Links */}
      <nav className="flex flex-col gap-1 py-1" aria-label="Desktop primary navigation">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-[var(--color-primary-subtle)] text-[var(--color-primary)] font-semibold shadow-xs'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-main)]'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-5 h-5 ${isActive ? 'text-[var(--color-primary)]' : ''}`} />
                <span>{item.label}</span>
              </div>

              {Boolean(item.badgeCount && item.badgeCount > 0) && (
                <span className="bg-[var(--color-badge)] text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
                  {item.badgeCount! > 99 ? '99+' : item.badgeCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="h-px bg-[var(--color-border)] my-2" />

      {/* Secondary Quick Action: Marketplace Preview */}
      <button
        onClick={() => navigateTo('marketplace')}
        className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-main)] transition-colors"
      >
        <Sparkles className="w-5 h-5 text-amber-500" />
        <div className="flex items-center gap-2">
          <span>Marketplace</span>
          <span className="text-[10px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-md">
            v2
          </span>
        </div>
      </button>

      {/* Community Page: Mr Anonymous */}
      <button
        onClick={() => navigateTo('mr-anonymous')}
        className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-main)] transition-colors"
      >
        <EyeOff className="w-5 h-5 text-violet-500" />
        <div className="flex items-center gap-2">
          <span>Mr Anonymous</span>
          <span className="text-[10px] font-semibold bg-violet-500/15 text-violet-600 dark:text-violet-400 px-1.5 py-0.5 rounded-md">
            Confessions
          </span>
        </div>
      </button>

      {/* Create Post Action CTA */}
      <div className="mt-4 pt-2">
        <button
          onClick={() => setCreatePostModalOpen(true)}
          className="w-full py-3 px-4 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all active:scale-[0.98]"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Create Post</span>
        </button>
      </div>
    </aside>
  );
};
