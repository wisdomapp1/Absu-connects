import React from 'react';
import { useApp } from '../../context/AppContext.tsx';
import type { MainNavTab } from '../../types/index.ts';
import { Home, Users, MessageSquare, Menu, Plus, Sparkles, EyeOff, Flag, Compass } from 'lucide-react';
import { Avatar } from '../common/Avatar.tsx';
import { ReelsIcon } from '../common/ReelsIcon.tsx';
import { VerifiedBadge } from '../common/VerifiedBadge.tsx';
import { MR_ANONYMOUS_PAGE_ID } from '../../lib/pageService.ts';
import { formatPageRoleLabel } from '../../lib/pageUtils.ts';

export const DesktopSidebar: React.FC = () => {
  const {
    activeTab,
    activeView,
    setActiveTab,
    currentUser,
    activeIdentity,
    managedPages,
    unreadMessagesCount,
    setCreatePostModalOpen,
    setCreatePageModalOpen,
    navigateTo,
  } = useApp();

  const navItems: Array<{
    id: MainNavTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badgeCount?: number;
  }> = [
    { id: 'home', label: 'Home Feed', icon: Home },
    { id: 'friends', label: 'Friends & Discovery', icon: Users },
    { id: 'messages', label: 'Messages', icon: MessageSquare, badgeCount: unreadMessagesCount },
    { id: 'reels', label: 'Reels', icon: ReelsIcon },
    { id: 'more', label: 'More Services', icon: Menu },
  ];

  const activeManagedPages = managedPages.filter((e) => e.page.status === 'active');

  return (
    <aside className="hidden md:flex flex-col w-64 shrink-0 sticky top-20 self-start p-3 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl shadow-sm transition-colors">
      {/* User / Active Identity Quick Snippet */}
      <button
        onClick={() =>
          activeIdentity.type === 'page'
            ? navigateTo('page-profile', { pageId: activeIdentity.pageId })
            : navigateTo('profile')
        }
        className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-[var(--color-primary-subtle)]/50 transition-colors text-left mb-2 group"
      >
        <Avatar
          src={activeIdentity.type === 'page' ? activeIdentity.page.avatarUrl : currentUser.avatar}
          name={activeIdentity.type === 'page' ? activeIdentity.page.name : currentUser.name}
          size="md"
        />
        <div className="min-w-0">
          <div className="flex items-center gap-1 min-w-0">
            <p className="text-sm font-bold text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)] transition-colors truncate">
              {activeIdentity.type === 'page' ? activeIdentity.page.name : currentUser.name}
            </p>
            {activeIdentity.type === 'page' && activeIdentity.page.isVerified && (
              <VerifiedBadge size={14} />
            )}
          </div>
          <p className="text-xs text-[var(--color-text-secondary)] truncate">
            {activeIdentity.type === 'page'
              ? `Managing Page (${formatPageRoleLabel(activeIdentity.role)})`
              : currentUser.department}
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

      {/* Pages Section: Your Pages, Discover Pages, Create Page */}
      <div className="space-y-1">
        <div className="px-3.5 py-1 flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
            Pages
          </span>
          {activeManagedPages.length > 0 && (
            <span className="text-[11px] font-bold text-[var(--color-primary)] tabular-nums">
              {activeManagedPages.length}
            </span>
          )}
        </div>

        <button
          onClick={() => navigateTo('pages')}
          className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-sm font-medium transition-colors ${
            activeView === 'pages'
              ? 'bg-[var(--color-primary-subtle)] text-[var(--color-primary)] font-semibold'
              : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-main)]'
          }`}
        >
          <Compass className="w-4.5 h-4.5 text-blue-500" />
          <span>Discover Pages</span>
        </button>

        {activeManagedPages.slice(0, 3).map(({ page, unreadNotificationsCount }) => (
          <button
            key={page.id}
            onClick={() => navigateTo('page-profile', { pageId: page.id })}
            className="w-full flex items-center justify-between gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-bg-main)] transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Avatar
                src={page.avatarUrl}
                name={page.name}
                size="xs"
              />
              <span className="truncate">{page.name}</span>
              {page.isVerified && <VerifiedBadge size={12} />}
            </div>
            {(unreadNotificationsCount ?? 0) > 0 && (
              <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full tabular-nums">
                {unreadNotificationsCount}
              </span>
            )}
          </button>
        ))}

        <button
          onClick={() => setCreatePageModalOpen(true)}
          className="w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary-subtle)]/50 transition-colors"
        >
          <Flag className="w-4.5 h-4.5" />
          <span>+ Create Page</span>
        </button>
      </div>

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
        onClick={() => navigateTo('page-profile', { pageId: MR_ANONYMOUS_PAGE_ID })}
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
