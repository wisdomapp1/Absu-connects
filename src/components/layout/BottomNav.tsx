import React from 'react';
import { useApp } from '../../context/AppContext.tsx';
import type { MainNavTab } from '../../types/index.ts';
import { Home, Users, MessageSquare, Bell, Menu } from 'lucide-react';

interface NavItem {
  id: MainNavTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeCount?: number;
}

export const BottomNav: React.FC = () => {
  const { activeTab, setActiveTab, unreadMessagesCount, unreadNotificationsCount } = useApp();

  const navItems: NavItem[] = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'friends', label: 'Friends', icon: Users },
    { id: 'messages', label: 'Messages', icon: MessageSquare, badgeCount: unreadMessagesCount },
    { id: 'alerts', label: 'Alerts', icon: Bell, badgeCount: unreadNotificationsCount },
    { id: 'more', label: 'More', icon: Menu },
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--color-bg-card)]/95 backdrop-blur-md border-t border-[var(--color-border)] pb-[env(safe-area-inset-bottom)] transition-colors shadow-lg"
      aria-label="Mobile Navigation"
    >
      <div className="grid grid-cols-5 h-16 max-w-lg mx-auto px-1">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          const IconComponent = item.icon;

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center min-h-[44px] min-w-[44px] py-1 transition-all relative ${
                isActive
                  ? 'text-[var(--color-primary)] font-semibold'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <div
                className={`relative px-3 py-1 rounded-full transition-colors flex items-center justify-center ${
                  isActive ? 'bg-[var(--color-primary-subtle)]' : ''
                }`}
              >
                <IconComponent className="w-[22px] h-[22px] stroke-[2.2]" />

                {/* Unread badge */}
                {Boolean(item.badgeCount && item.badgeCount > 0) && (
                  <span className="absolute -top-1 -right-1 bg-[var(--color-badge)] text-white text-[10px] font-bold rounded-full min-w-[17px] h-[17px] flex items-center justify-center px-1 shadow-sm border border-[var(--color-bg-card)]">
                    {item.badgeCount! > 99 ? '99+' : item.badgeCount}
                  </span>
                )}
              </div>

              <span className="text-[11px] leading-tight tracking-tight mt-0.5">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
