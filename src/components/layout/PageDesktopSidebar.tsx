import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import {
  Home,
  Users,
  MessageCircle,
  Bell,
  Settings,
  Compass,
  Plus,
  ArrowRightLeft,
} from 'lucide-react';
import { Avatar } from '../common/Avatar.tsx';
import { ReelsIcon } from '../common/ReelsIcon.tsx';
import { VerifiedBadge } from '../common/VerifiedBadge.tsx';
import { IdentitySwitcher } from '../pages/IdentitySwitcher.tsx';
import { formatPageRoleLabel, getPageRoleCapabilities } from '../../lib/pageUtils.ts';

export const PageDesktopSidebar: React.FC = () => {
  const {
    activeView,
    currentUser,
    activeIdentity,
    managedPages,
    activePageInboxUnreadCount,
    activePageNotifsUnreadCount,
    setActiveTab,
    navigateTo,
    switchIdentity,
    setCreatePostModalOpen,
  } = useApp();

  const [switcherOpen, setSwitcherOpen] = useState(false);

  if (activeIdentity.type !== 'page') return null;

  const { page, role } = activeIdentity;
  const roleCaps = getPageRoleCapabilities(role);
  const activeManagedCount = managedPages.filter((e) => e.page.status === 'active').length;

  const navItems: Array<{
    id: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badgeCount?: number;
    onClick: () => void;
  }> = [
    {
      id: 'home',
      label: 'Home Feed',
      icon: Home,
      onClick: () => setActiveTab('home'),
    },
    {
      id: 'reels',
      label: 'Reels',
      icon: ReelsIcon,
      onClick: () => setActiveTab('reels'),
    },
    {
      id: 'pages',
      label: 'Discover Pages',
      icon: Compass,
      onClick: () => navigateTo('pages'),
    },
    ...(roleCaps.canManageFollowers
      ? [
          {
            id: 'page-followers',
            label: 'Page Followers',
            icon: Users,
            onClick: () => navigateTo('page-followers', { pageId: page.id }),
          },
        ]
      : []),
    {
      id: 'page-inbox',
      label: 'Page Inbox',
      icon: MessageCircle,
      badgeCount: activePageInboxUnreadCount,
      onClick: () => navigateTo('page-inbox', { pageId: page.id }),
    },
    {
      id: 'page-notifications',
      label: 'Page Alerts',
      icon: Bell,
      badgeCount: activePageNotifsUnreadCount,
      onClick: () => navigateTo('page-notifications', { pageId: page.id }),
    },
    {
      id: 'page-settings',
      label: 'Page Settings',
      icon: Settings,
      onClick: () => navigateTo('page-settings', { pageId: page.id }),
    },
  ];

  return (
    <>
      <aside className="hidden md:flex flex-col w-64 shrink-0 sticky top-20 self-start p-3 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl shadow-sm transition-colors">
        {/* Active Page Quick Snippet */}
        <button
          type="button"
          onClick={() => navigateTo('page-profile', { pageId: page.id })}
          className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-[var(--color-primary-subtle)]/50 transition-colors text-left mb-2 group"
        >
          <Avatar src={page.avatarUrl} name={page.name} size="md" />
          <div className="min-w-0">
            <div className="flex items-center gap-1 min-w-0">
              <p className="text-sm font-bold text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)] transition-colors truncate">
                {page.name}
              </p>
              {page.isVerified && <VerifiedBadge size={14} />}
            </div>
            <p className="text-xs text-[var(--color-text-secondary)] truncate">
              Page Mode · {formatPageRoleLabel(role)}
            </p>
          </div>
        </button>

        <div className="h-px bg-[var(--color-border)] my-1" />

        {/* Page Navigation Links */}
        <nav className="flex flex-col gap-1 py-1" aria-label="Desktop Page navigation">
          {navItems.map((item) => {
            const isActive = activeView === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={item.onClick}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-[var(--color-primary-subtle)] text-[var(--color-primary)] font-semibold shadow-xs'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-main)]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-[var(--color-primary)]' : ''}`} />
                  <span className="truncate">{item.label}</span>
                </div>
                {Boolean(item.badgeCount && item.badgeCount > 0) && (
                  <span className="bg-[var(--color-badge)] text-white text-[11px] font-bold px-2 py-0.5 rounded-full tabular-nums">
                    {item.badgeCount! > 99 ? '99+' : item.badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="h-px bg-[var(--color-border)] my-2" />

        {/* Create Post in Active Page Mode */}
        {roleCaps.canPublishPosts && (
          <button
            type="button"
            onClick={() => setCreatePostModalOpen(true)}
            className="w-full py-3 px-4 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.98]"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Create Post</span>
          </button>
        )}

        {/* Identity Switching Actions */}
        <div className="mt-2.5 space-y-1.5">
          {activeManagedCount > 1 && (
            <button
              type="button"
              onClick={() => setSwitcherOpen(true)}
              className="w-full py-2.5 px-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-main)] hover:bg-[var(--color-primary-subtle)]/50 text-xs font-bold text-[var(--color-text-primary)] flex items-center justify-center gap-2 transition-colors"
            >
              <ArrowRightLeft className="w-3.5 h-3.5 text-[var(--color-primary)]" />
              <span>Switch Managed Page</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => switchIdentity('personal')}
            className="w-full p-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-main)] hover:bg-[var(--color-primary-subtle)]/60 flex items-center gap-2.5 text-left transition-colors"
          >
            <Avatar src={currentUser.avatar} name={currentUser.name} size="xs" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-[var(--color-text-primary)] truncate">
                Switch to Personal
              </p>
              <p className="text-[10px] text-[var(--color-text-secondary)] truncate">
                {currentUser.name}
              </p>
            </div>
            <ArrowRightLeft className="w-3.5 h-3.5 text-[var(--color-primary)] shrink-0" />
          </button>
        </div>
      </aside>

      <IdentitySwitcher isOpen={switcherOpen} onClose={() => setSwitcherOpen(false)} />
    </>
  );
};
