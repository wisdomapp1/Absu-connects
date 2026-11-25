import React from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { Home, Users, MessageCircle, Settings } from 'lucide-react';
import { ReelsIcon } from '../common/ReelsIcon.tsx';

export const PageBottomNav: React.FC = () => {
  const {
    activeView,
    activeIdentity,
    activePageInboxUnreadCount,
    setActiveTab,
    navigateTo,
    refreshCurrentScreen,
  } = useApp();

  if (activeIdentity.type !== 'page') return null;

  const pageId = activeIdentity.pageId;
  const isReelsMode = activeView === 'reels';

  const items: Array<{
    id: 'home' | 'page-followers' | 'page-inbox' | 'reels' | 'page-settings';
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badgeCount?: number;
    onPress: () => void;
  }> = [
    {
      id: 'home',
      label: 'Home',
      icon: Home,
      onPress: () => setActiveTab('home'),
    },
    {
      id: 'page-followers',
      label: 'Followers',
      icon: Users,
      onPress: () => {
        if (activeView === 'page-followers') {
          window.dispatchEvent(
            new CustomEvent('absu:scroll-top', { detail: { view: 'page-followers' } })
          );
          void refreshCurrentScreen();
        } else {
          navigateTo('page-followers', { pageId });
        }
      },
    },
    {
      id: 'page-inbox',
      label: 'Inbox',
      icon: MessageCircle,
      badgeCount: activePageInboxUnreadCount,
      onPress: () => {
        if (activeView === 'page-inbox') {
          window.dispatchEvent(
            new CustomEvent('absu:scroll-top', { detail: { view: 'page-inbox' } })
          );
        } else {
          navigateTo('page-inbox', { pageId });
        }
      },
    },
    {
      id: 'reels',
      label: 'Reels',
      icon: ReelsIcon,
      onPress: () => setActiveTab('reels'),
    },
    {
      id: 'page-settings',
      label: 'Settings',
      icon: Settings,
      onPress: () => {
        if (activeView === 'page-settings') {
          window.dispatchEvent(
            new CustomEvent('absu:scroll-top', { detail: { view: 'page-settings' } })
          );
        } else {
          navigateTo('page-settings', { pageId });
        }
      },
    },
  ];

  return (
    <nav
      className={`md:hidden fixed bottom-0 left-0 right-0 z-40 backdrop-blur-md border-t pb-[env(safe-area-inset-bottom)] transition-colors shadow-lg ${
        isReelsMode
          ? 'bg-black/95 border-white/15'
          : 'bg-[var(--color-bg-card)]/95 border-[var(--color-border)]'
      }`}
      aria-label="Page Mobile Navigation"
    >
      <div className="grid grid-cols-5 h-16 max-w-lg mx-auto px-1">
        {items.map((item) => {
          const isActive = activeView === item.id;
          const IconComponent = item.icon;

          return (
            <button
              key={item.id}
              type="button"
              onClick={item.onPress}
              className={`flex flex-col items-center justify-center min-h-[44px] min-w-[44px] py-1 transition-all relative ${
                isActive
                  ? isReelsMode
                    ? 'text-white font-semibold'
                    : 'text-[var(--color-primary)] font-semibold'
                  : isReelsMode
                  ? 'text-white/65 hover:text-white'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <div
                className={`relative px-2.5 py-1 rounded-full transition-colors flex items-center justify-center ${
                  isActive
                    ? isReelsMode
                      ? 'bg-white/20'
                      : 'bg-[var(--color-primary-subtle)]'
                    : ''
                }`}
              >
                <IconComponent className="w-[21px] h-[21px] stroke-[2.2]" />
                {Boolean(item.badgeCount && item.badgeCount > 0) && (
                  <span className="absolute -top-1 -right-1 bg-[var(--color-badge)] text-white text-[10px] font-bold rounded-full min-w-[17px] h-[17px] flex items-center justify-center px-1 shadow-sm border border-[var(--color-bg-card)] tabular-nums">
                    {item.badgeCount! > 99 ? '99+' : item.badgeCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] sm:text-[11px] leading-tight tracking-tight mt-0.5 truncate max-w-full">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
