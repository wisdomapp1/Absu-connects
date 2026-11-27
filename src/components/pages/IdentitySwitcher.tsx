import React, { useEffect, useRef, useState } from 'react';
import { Check, Plus, Compass, X, Loader2 } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { VerifiedBadge } from '../common/VerifiedBadge.tsx';
import { Avatar } from '../common/Avatar.tsx';
import { formatPageCategoryLabel } from '../../types/pages.ts';
import { formatPageRoleLabel } from '../../lib/pageUtils.ts';

interface IdentitySwitcherProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Facebook-style Account Identity Switcher.
 * Mobile: Clean bottom sheet. Desktop: Clean anchored dropdown popover.
 * Switching identity changes UI perspective (`activeIdentity`) without altering Supabase Auth session.
 */
export const IdentitySwitcher: React.FC<IdentitySwitcherProps> = ({ isOpen, onClose }) => {
  const {
    currentUser,
    activeIdentity,
    managedPages,
    loadingManagedPages,
    switchIdentity,
    navigateTo,
    setCreatePageModalOpen,
  } = useApp();

  const [switchingTarget, setSwitchingTarget] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const activeManagedPages = managedPages.filter((entry) => entry.page.status === 'active');

  const handleSelectPersonal = async () => {
    setSwitchingTarget('personal');
    try {
      await switchIdentity('personal');
      onClose();
    } finally {
      setSwitchingTarget(null);
    }
  };

  const handleSelectPage = async (pageId: string) => {
    setSwitchingTarget(pageId);
    try {
      const ok = await switchIdentity(pageId);
      if (ok) {
        onClose();
      }
    } finally {
      setSwitchingTarget(null);
    }
  };

  const handleCreatePage = () => {
    onClose();
    setCreatePageModalOpen(true);
  };

  const handleDiscoverPages = () => {
    onClose();
    navigateTo('pages');
  };

  const isPersonalActive = activeIdentity.type === 'personal';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[1px] md:bg-transparent md:backdrop-blur-none flex items-end md:items-start md:justify-end md:pt-16 md:pr-6"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full md:w-[340px] bg-[var(--color-bg-card)] border-t md:border border-[var(--color-border)] rounded-t-3xl md:rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 md:slide-in-from-top-2 duration-150"
      >
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-[var(--color-border)] flex items-center justify-between">
          <div>
            <h3 className="text-sm font-extrabold text-[var(--color-text-primary)]">
              Switch Profile or Page
            </h3>
            <p className="text-[11px] text-[var(--color-text-secondary)]">
              Choose who you post, comment, and chat as
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-main)]"
            aria-label="Close switcher"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Profiles & Pages list */}
        <div className="max-h-[65vh] overflow-y-auto p-2.5 space-y-2">
          {/* Personal Profile */}
          <button
            type="button"
            disabled={switchingTarget !== null}
            onClick={handleSelectPersonal}
            className={`w-full min-h-[56px] p-2.5 rounded-xl flex items-center justify-between gap-3 text-left transition-colors ${
              isPersonalActive
                ? 'bg-[var(--color-primary-subtle)] border border-[var(--color-primary)]/30'
                : 'hover:bg-[var(--color-bg-main)] border border-transparent'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <Avatar
                src={currentUser.avatar}
                name={currentUser.name}
                size="md"
                className="shrink-0"
              />
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--color-text-primary)] truncate">
                  {currentUser.name}
                </p>
                <p className="text-[11px] text-[var(--color-text-secondary)] truncate">
                  {isPersonalActive ? 'Active Personal Profile' : 'Switch to Personal Profile'}
                </p>
              </div>
            </div>
            {switchingTarget === 'personal' ? (
              <Loader2 className="w-4 h-4 text-[var(--color-primary)] animate-spin shrink-0" />
            ) : isPersonalActive ? (
              <span className="w-6 h-6 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center shrink-0">
                <Check className="w-3.5 h-3.5" />
              </span>
            ) : null}
          </button>

          {/* Divider */}
          <div className="px-2 pt-2 pb-1 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
              Pages You Manage ({activeManagedPages.length})
            </span>
            <button
              type="button"
              onClick={handleDiscoverPages}
              className="text-[11px] font-semibold text-[var(--color-primary)] hover:underline flex items-center gap-1"
            >
              <Compass className="w-3 h-3" />
              <span>Directory</span>
            </button>
          </div>

          {loadingManagedPages && activeManagedPages.length === 0 ? (
            <div className="py-4 text-center text-xs text-[var(--color-text-secondary)] flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-[var(--color-primary)]" />
              <span>Loading your Pages...</span>
            </div>
          ) : activeManagedPages.length === 0 ? (
            <div className="px-3 py-4 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-center">
              <p className="text-xs font-semibold text-[var(--color-text-primary)]">
                You don't manage any Pages yet
              </p>
              <p className="text-[11px] text-[var(--color-text-secondary)] mt-0.5">
                Launch an official campus Page for your club, fellowship, or business.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {activeManagedPages.map(({ page, role, unreadNotificationsCount }) => {
                const isActive = activeIdentity.type === 'page' && activeIdentity.pageId === page.id;
                const isSwitching = switchingTarget === page.id;
                return (
                  <button
                    key={page.id}
                    type="button"
                    disabled={switchingTarget !== null}
                    onClick={() => handleSelectPage(page.id)}
                    className={`w-full min-h-[56px] p-2.5 rounded-xl flex items-center justify-between gap-3 text-left transition-colors ${
                      isActive
                        ? 'bg-[var(--color-primary-subtle)] border border-[var(--color-primary)]/30'
                        : 'hover:bg-[var(--color-bg-main)] border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <Avatar
                          src={page.avatarUrl}
                          name={page.name}
                          size="md"
                        />
                        {(unreadNotificationsCount ?? 0) > 0 && (
                          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-[var(--color-bg-card)] tabular-nums">
                            {(unreadNotificationsCount ?? 0) > 9 ? '9+' : unreadNotificationsCount}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="text-sm font-bold text-[var(--color-text-primary)] truncate">
                            {page.name}
                          </span>
                          {page.isVerified && <VerifiedBadge size={14} />}
                        </div>
                        <p className="text-[11px] text-[var(--color-text-secondary)] truncate">
                          {formatPageRoleLabel(role)} · {formatPageCategoryLabel(page.category)}
                        </p>
                      </div>
                    </div>
                    {isSwitching ? (
                      <Loader2 className="w-4 h-4 text-[var(--color-primary)] animate-spin shrink-0" />
                    ) : isActive ? (
                      <span className="w-6 h-6 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center shrink-0">
                        <Check className="w-3.5 h-3.5" />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Action */}
        <div className="p-2.5 border-t border-[var(--color-border)] bg-[var(--color-bg-main)]/50 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] md:pb-2.5">
          <button
            type="button"
            onClick={handleCreatePage}
            className="w-full min-h-[44px] px-4 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Create a New Page</span>
          </button>
        </div>
      </div>
    </div>
  );
};
