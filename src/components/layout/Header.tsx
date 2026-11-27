import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { Avatar } from '../common/Avatar.tsx';
import { BrandLogo } from '../common/BrandLogo.tsx';
import { VerifiedBadge } from '../common/VerifiedBadge.tsx';
import { IdentitySwitcher } from '../pages/IdentitySwitcher.tsx';
import {
  Search,
  Plus,
  Bell,
  User as UserIcon,
  Settings,
  LogOut,
  Sparkles,
  Flag,
  ArrowRightLeft,
  ChevronDown,
} from 'lucide-react';
import { formatPageRoleLabel } from '../../lib/pageUtils.ts';

export const Header: React.FC = () => {
  const {
    currentUser,
    activeView,
    activeIdentity,
    managedPages,
    unreadNotificationsCount,
    setSearchOpen,
    setCreatePostModalOpen,
    setCreatePageModalOpen,
    navigateTo,
    addToast,
  } = useApp();

  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close profile menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const { signOut } = useAuth();

  const handleSignOut = async () => {
    setProfileMenuOpen(false);
    await signOut();
    addToast('Signed out of ABSU Connect', 'info');
  };

  const activeAvatar =
    activeIdentity.type === 'page' ? activeIdentity.page.avatarUrl : currentUser.avatar;
  const activeName =
    activeIdentity.type === 'page' ? activeIdentity.page.name : currentUser.name;

  return (
    <>
      <header className="sticky top-0 z-30 w-full bg-[var(--color-bg-card)]/95 backdrop-blur-md border-b border-[var(--color-border)] px-3.5 sm:px-6 transition-colors">
        <div className="max-w-5xl mx-auto h-14 sm:h-16 flex items-center justify-between gap-2">
          {/* Left: Brand Logo & Wordmark */}
          <button
            onClick={() => navigateTo('home')}
            className="flex items-center gap-1.5 sm:gap-2 text-left group min-h-[44px] shrink-0 focus:outline-none"
            aria-label="ABSU Connect Home"
          >
            <BrandLogo size="md" />

            <div className="flex flex-col">
              <span className="font-extrabold text-[15px] sm:text-xl tracking-tight text-[var(--color-primary)] whitespace-nowrap leading-none font-display">
                ABSU <span className="text-[var(--color-text-primary)]">Connect</span>
              </span>
              <span className="text-[9px] font-semibold text-[var(--color-text-secondary)] tracking-wider uppercase mt-0.5 hidden xs:inline">
                {activeIdentity.type === 'page'
                  ? `Acting as ${activeIdentity.page.name}`
                  : 'Abia State University'}
              </span>
            </div>
          </button>

          {/* Right Action Controls */}
          <div className="flex items-center gap-0.5 sm:gap-2 shrink-0">
            {/* Quick Search trigger */}
            <button
              onClick={() => setSearchOpen(true)}
              className="w-11 h-11 rounded-full flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-primary-subtle)]/60 transition-colors"
              aria-label="Search people, Pages, departments, posts"
              title="Search"
            >
              <Search className="w-5 h-5" />
            </button>

            {/* Create Post Button */}
            <button
              onClick={() => setCreatePostModalOpen(true)}
              className="h-10 px-3 sm:px-3.5 rounded-full bg-[var(--color-primary-subtle)] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white transition-all flex items-center gap-1.5 font-medium text-xs sm:text-sm active:scale-95 shadow-sm"
              aria-label="Create a campus post"
              title="Create Post"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span className="hidden sm:inline font-semibold">Post</span>
            </button>

            {/* Alerts / Notifications Bell Button */}
            <button
              onClick={() => navigateTo('alerts')}
              className={`relative w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                activeView === 'alerts'
                  ? 'bg-[var(--color-primary-subtle)] text-[var(--color-primary)]'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-primary-subtle)]/60'
              }`}
              aria-label={
                unreadNotificationsCount > 0
                  ? `Alerts (${unreadNotificationsCount} unread)`
                  : 'Alerts'
              }
              title="Alerts"
            >
              <Bell className="w-5 h-5" />
              {unreadNotificationsCount > 0 && (
                <span className="absolute top-1.5 right-1.5 bg-[var(--color-badge)] text-white text-[10px] font-bold rounded-full min-w-[17px] h-[17px] flex items-center justify-center px-1 shadow-sm border border-[var(--color-bg-card)] tabular-nums">
                  {unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
                </span>
              )}
            </button>

            {/* Profile / Identity Menu Button */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setProfileMenuOpen((prev) => !prev)}
                className="min-w-[44px] min-h-[44px] flex items-center gap-1 px-1 rounded-full ring-2 ring-transparent hover:ring-[var(--color-primary)] transition-all focus:outline-none relative"
                aria-label="Open profile and Page switcher menu"
                aria-expanded={profileMenuOpen}
              >
                <Avatar src={activeAvatar} name={activeName} size="sm" />
                {activeIdentity.type === 'page' && (
                  <span className="w-4 h-4 rounded-full bg-[#1877F2] text-white flex items-center justify-center absolute bottom-1 right-1 border-2 border-[var(--color-bg-card)]">
                    <Flag className="w-2.5 h-2.5" />
                  </span>
                )}
              </button>

              {/* Profile & Identity Menu Dropdown */}
              {profileMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] shadow-xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-3 py-2.5 border-b border-[var(--color-border)] mb-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-bold text-[var(--color-text-primary)] truncate">
                        {activeName}
                      </p>
                      {activeIdentity.type === 'page' && activeIdentity.page.isVerified && (
                        <VerifiedBadge size={14} />
                      )}
                    </div>
                    <p className="text-xs text-[var(--color-text-secondary)] truncate">
                      {activeIdentity.type === 'page'
                        ? `Managing Page (${formatPageRoleLabel(activeIdentity.role)})`
                        : `${currentUser.department} · ${currentUser.level}`}
                    </p>
                  </div>

                  {/* Quick Account Identity Switcher Trigger */}
                  <button
                    onClick={() => {
                      setProfileMenuOpen(false);
                      setSwitcherOpen(true);
                    }}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-bold text-[var(--color-primary)] bg-[var(--color-primary-subtle)]/70 hover:bg-[var(--color-primary-subtle)] rounded-xl transition-colors min-h-[42px] mb-1"
                  >
                    <div className="flex items-center gap-2">
                      <ArrowRightLeft className="w-4 h-4" />
                      <span>Switch Profile / Page</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {managedPages.length > 0 && (
                        <span className="text-[10px] font-bold tabular-nums">
                          {managedPages.length}
                        </span>
                      )}
                      <ChevronDown className="w-3.5 h-3.5" />
                    </div>
                  </button>

                  {activeIdentity.type === 'page' ? (
                    <button
                      onClick={() => {
                        setProfileMenuOpen(false);
                        navigateTo('page-profile', { pageId: activeIdentity.pageId });
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-primary-subtle)] rounded-xl transition-colors min-h-[40px]"
                    >
                      <Flag className="w-4 h-4 text-[var(--color-primary)]" />
                      <span>Open Page Workspace</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setProfileMenuOpen(false);
                        navigateTo('profile');
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-primary-subtle)] rounded-xl transition-colors min-h-[40px]"
                    >
                      <UserIcon className="w-4 h-4 text-[var(--color-primary)]" />
                      <span>My Profile</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setProfileMenuOpen(false);
                      navigateTo('pages');
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-primary-subtle)] rounded-xl transition-colors min-h-[40px]"
                  >
                    <Flag className="w-4 h-4 text-blue-500" />
                    <span>Discover Pages</span>
                  </button>

                  <button
                    onClick={() => {
                      setProfileMenuOpen(false);
                      setCreatePageModalOpen(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-primary-subtle)] rounded-xl transition-colors min-h-[40px]"
                  >
                    <Plus className="w-4 h-4 text-emerald-500" />
                    <span>+ Create Page</span>
                  </button>

                  <button
                    onClick={() => {
                      setProfileMenuOpen(false);
                      navigateTo('settings');
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-primary-subtle)] rounded-xl transition-colors min-h-[40px]"
                  >
                    <Settings className="w-4 h-4 text-[var(--color-primary)]" />
                    <span>Settings & Privacy</span>
                  </button>

                  <button
                    onClick={() => {
                      setProfileMenuOpen(false);
                      navigateTo('marketplace');
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-primary-subtle)] rounded-xl transition-colors min-h-[40px]"
                  >
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span>Marketplace (v2)</span>
                  </button>

                  <div className="my-1 border-t border-[var(--color-border)]" />

                  <button
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
