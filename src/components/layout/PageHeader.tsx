import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { Avatar } from '../common/Avatar.tsx';
import { VerifiedBadge } from '../common/VerifiedBadge.tsx';
import { IdentitySwitcher } from '../pages/IdentitySwitcher.tsx';
import {
  Search,
  Plus,
  Bell,
  Flag,
  Settings,
  LogOut,
  ArrowRightLeft,
  Users,
  MessageCircle,
  Compass,
  User as UserIcon,
} from 'lucide-react';
import { formatPageRoleLabel, getPageRoleCapabilities } from '../../lib/pageUtils.ts';

export const PageHeader: React.FC = () => {
  const {
    currentUser,
    activeView,
    activeIdentity,
    activePageNotifsUnreadCount,
    activePageInboxUnreadCount,
    setSearchOpen,
    setCreatePostModalOpen,
    setCreatePageModalOpen,
    navigateTo,
    switchIdentity,
    addToast,
  } = useApp();

  const [menuOpen, setMenuOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { signOut } = useAuth();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (activeIdentity.type !== 'page') return null;

  const { page, role } = activeIdentity;
  const roleCaps = getPageRoleCapabilities(role);

  const handleSignOut = async () => {
    setMenuOpen(false);
    await signOut();
    addToast('Signed out of ABSU Connect', 'info');
  };

  return (
    <>
      <header className="sticky top-0 z-30 w-full bg-[var(--color-bg-card)]/95 backdrop-blur-md border-b border-[var(--color-border)] px-3.5 sm:px-6 transition-colors">
        <div className="max-w-5xl mx-auto h-14 sm:h-16 flex items-center justify-between gap-2">
          {/* Left: Active Page Identity */}
          <button
            type="button"
            onClick={() => navigateTo('page-profile', { pageId: page.id })}
            className="flex items-center gap-2.5 text-left min-h-[44px] min-w-0 focus:outline-none group"
            aria-label={`Open ${page.name} Page profile`}
          >
            <Avatar src={page.avatarUrl} name={page.name} size="sm" className="shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-1 min-w-0">
                <span className="font-extrabold text-sm sm:text-base text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)] truncate leading-tight">
                  {page.name}
                </span>
                {page.isVerified && <VerifiedBadge size={14} />}
              </div>
              <p className="text-[10px] font-semibold text-[var(--color-primary)] tracking-wide uppercase truncate">
                Page Mode · {formatPageRoleLabel(role)}
              </p>
            </div>
          </button>

          {/* Right Action Controls */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="w-11 h-11 rounded-full flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-primary-subtle)]/60 transition-colors"
              aria-label="Search ABSU Connect"
              title="Search"
            >
              <Search className="w-5 h-5" />
            </button>

            {roleCaps.canPublishPosts && (
              <button
                type="button"
                onClick={() => setCreatePostModalOpen(true)}
                className="h-10 px-3 sm:px-3.5 rounded-full bg-[var(--color-primary-subtle)] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white transition-all flex items-center gap-1.5 font-medium text-xs sm:text-sm active:scale-95 shadow-sm"
                aria-label={`Post as ${page.name}`}
                title={`Post as ${page.name}`}
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span className="hidden sm:inline font-semibold">Post</span>
              </button>
            )}

            {/* Page Notifications Bell */}
            <button
              type="button"
              onClick={() => navigateTo('page-notifications', { pageId: page.id })}
              className={`relative w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                activeView === 'page-notifications'
                  ? 'bg-[var(--color-primary-subtle)] text-[var(--color-primary)]'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-primary-subtle)]/60'
              }`}
              aria-label={
                activePageNotifsUnreadCount > 0
                  ? `Page Alerts (${activePageNotifsUnreadCount} unread)`
                  : 'Page Alerts'
              }
              title="Page Alerts"
            >
              <Bell className="w-5 h-5" />
              {activePageNotifsUnreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 bg-[var(--color-badge)] text-white text-[10px] font-bold rounded-full min-w-[17px] h-[17px] flex items-center justify-center px-1 shadow-sm border border-[var(--color-bg-card)] tabular-nums">
                  {activePageNotifsUnreadCount > 99 ? '99+' : activePageNotifsUnreadCount}
                </span>
              )}
            </button>

            {/* Quick Personal Return Button (Tablet/Desktop) */}
            <button
              type="button"
              onClick={() => switchIdentity('personal')}
              className="hidden md:flex items-center gap-1.5 h-10 px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-main)] hover:bg-[var(--color-primary-subtle)] text-xs font-bold text-[var(--color-text-primary)] whitespace-nowrap transition-colors"
              title={`Switch back to ${currentUser.name}`}
            >
              <ArrowRightLeft className="w-3.5 h-3.5 text-[var(--color-primary)]" />
              <span>Personal</span>
            </button>

            {/* Page Menu Dropdown */}
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center px-1 rounded-full ring-2 ring-transparent hover:ring-[var(--color-primary)] transition-all focus:outline-none relative"
                aria-label="Open Page navigation and identity menu"
                aria-expanded={menuOpen}
              >
                <Avatar src={page.avatarUrl} name={page.name} size="sm" />
                <span className="w-4 h-4 rounded-full bg-[#1877F2] text-white flex items-center justify-center absolute bottom-1 right-1 border-2 border-[var(--color-bg-card)]">
                  <Flag className="w-2.5 h-2.5" />
                </span>
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] shadow-xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-3 py-2 border-b border-[var(--color-border)] mb-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-bold text-[var(--color-text-primary)] truncate">
                        {page.name}
                      </p>
                      {page.isVerified && <VerifiedBadge size={14} />}
                    </div>
                    <p className="text-[11px] text-[var(--color-text-secondary)] truncate">
                      {formatPageRoleLabel(role)} · Page Mode
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      setMenuOpen(false);
                      await switchIdentity('personal');
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-[var(--color-primary)] bg-[var(--color-primary-subtle)]/70 hover:bg-[var(--color-primary-subtle)] rounded-xl transition-colors min-h-[42px] mb-1"
                  >
                    <UserIcon className="w-4 h-4 shrink-0" />
                    <span className="truncate">Switch to {currentUser.name}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setSwitcherOpen(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-primary-subtle)] rounded-xl transition-colors min-h-[40px]"
                  >
                    <ArrowRightLeft className="w-4 h-4 text-[var(--color-primary)]" />
                    <span>Switch Managed Page</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      navigateTo('page-profile', { pageId: page.id });
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-primary-subtle)] rounded-xl transition-colors min-h-[40px]"
                  >
                    <Flag className="w-4 h-4 text-[var(--color-primary)]" />
                    <span>View Page Profile</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      navigateTo('page-inbox', { pageId: page.id });
                    }}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-primary-subtle)] rounded-xl transition-colors min-h-[40px]"
                  >
                    <span className="flex items-center gap-2.5">
                      <MessageCircle className="w-4 h-4 text-emerald-500" />
                      <span>Page Inbox</span>
                    </span>
                    {activePageInboxUnreadCount > 0 && (
                      <span className="text-[11px] font-bold text-rose-500 tabular-nums">
                        {activePageInboxUnreadCount}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      navigateTo('page-followers', { pageId: page.id });
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-primary-subtle)] rounded-xl transition-colors min-h-[40px]"
                  >
                    <Users className="w-4 h-4 text-blue-500" />
                    <span>Page Followers</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      navigateTo('page-settings', { pageId: page.id });
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-primary-subtle)] rounded-xl transition-colors min-h-[40px]"
                  >
                    <Settings className="w-4 h-4 text-[var(--color-primary)]" />
                    <span>Page Settings</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      navigateTo('pages');
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-primary-subtle)] rounded-xl transition-colors min-h-[40px]"
                  >
                    <Compass className="w-4 h-4 text-blue-500" />
                    <span>Discover Pages</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setCreatePageModalOpen(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-primary-subtle)] rounded-xl transition-colors min-h-[40px]"
                  >
                    <Plus className="w-4 h-4 text-emerald-500" />
                    <span>+ Create Page</span>
                  </button>

                  <div className="my-1 border-t border-[var(--color-border)]" />

                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[var(--color-error)] hover:bg-[var(--color-error)]/10 rounded-xl transition-colors min-h-[40px]"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <IdentitySwitcher isOpen={switcherOpen} onClose={() => setSwitcherOpen(false)} />
    </>
  );
};
