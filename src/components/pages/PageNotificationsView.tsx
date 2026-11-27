import React, { useState } from 'react';
import { Bell, CheckCheck, Loader2, ArrowLeft } from 'lucide-react';
import { Page } from '../../types/pages.ts';
import { NotificationItem } from '../../types/index.ts';
import { resolvePageNotificationRoute } from '../../lib/pageUtils.ts';
import { executeNotificationNavigation } from '../../lib/notificationRouter.ts';
import { useApp } from '../../context/AppContext.tsx';
import { Avatar } from '../common/Avatar.tsx';

interface PageNotificationsViewProps {
  page: Page;
}

/**
 * Isolated Page Notifications View (`notifications.recipient_page_id = page.id`).
 * Uses AppContext's live activePageNotifications store and routes Page alerts natively inside Page Mode.
 */
export const PageNotificationsView: React.FC<PageNotificationsViewProps> = ({ page }) => {
  const {
    currentUser,
    posts,
    conversations,
    activePageNotifications,
    loadingPageNotifications,
    markPageNotificationAsRead,
    markAllPageNotificationsRead,
    navigateTo,
    goBack,
    setFriendTab,
    startConversationWithUser,
    openStoryById,
    addToast,
  } = useApp();

  const [markingAll, setMarkingAll] = useState(false);

  const items = activePageNotifications;
  const unreadCount = items.filter((i) => !i.isRead).length;

  const handleMarkAll = async () => {
    if (markingAll) return;
    setMarkingAll(true);
    try {
      await markAllPageNotificationsRead();
      addToast('Page notifications marked as read.', 'info');
    } finally {
      setMarkingAll(false);
    }
  };

  const handleItemClick = async (notif: NotificationItem) => {
    if (!notif.isRead) {
      void markPageNotificationAsRead(notif.id);
    }

    const route = resolvePageNotificationRoute(notif, page.id);
    if (route.view === 'page-inbox') {
      navigateTo('page-inbox', {
        pageId: route.pageId,
        pageConvId: route.conversationId || null,
      });
      return;
    }

    if (
      route.view === 'page-followers' ||
      route.view === 'page-settings' ||
      route.view === 'page-profile'
    ) {
      navigateTo(route.view, {
        pageId: route.pageId,
        ...(route.pageTab ? { pageTab: route.pageTab } : {}),
      });
      return;
    }

    await executeNotificationNavigation(notif, {
      currentUserId: currentUser.id,
      posts,
      conversations,
      navigateTo,
      setFriendTab,
      startConversationWithUser,
      openStoryById,
      addToast,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={goBack}
            className="min-w-[44px] min-h-[44px] rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-primary)] hover:bg-[var(--color-bg-main)] shrink-0"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg font-extrabold text-[var(--color-text-primary)] truncate">
              Page Alerts
            </h1>
            <p className="text-xs text-[var(--color-text-secondary)] truncate">
              Activity on {page.name} stays separate from your personal alerts
            </p>
          </div>
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            disabled={markingAll}
            onClick={handleMarkAll}
            className="min-h-[40px] px-3.5 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] text-xs font-bold text-[var(--color-primary)] flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span>Mark read</span>
          </button>
        )}
      </div>

      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl overflow-hidden">
        {loadingPageNotifications && items.length === 0 ? (
          <div className="p-10 flex flex-col items-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-[var(--color-primary)]" />
            <p className="text-xs text-[var(--color-text-secondary)]">Loading Page alerts...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <Bell className="w-8 h-8 text-[var(--color-text-secondary)] mx-auto opacity-60" />
            <p className="text-sm font-bold text-[var(--color-text-primary)]">
              No Page notifications yet
            </p>
            <p className="text-xs text-[var(--color-text-secondary)]">
              New followers, likes, comments, and Page inbox alerts appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => handleItemClick(n)}
                className={`w-full p-3.5 flex items-start gap-3 text-left hover:bg-[var(--color-bg-main)] transition-colors ${
                  !n.isRead ? 'bg-[var(--color-primary-subtle)]/35' : ''
                }`}
              >
                <Avatar src={n.actor.avatar} name={n.actor.name} size="md" className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm text-[var(--color-text-primary)]">
                    <span className="font-bold">{n.actor.name}</span>{' '}
                    <span className="text-[var(--color-text-secondary)]">{n.content}</span>
                  </p>
                  <p className="text-[11px] text-[var(--color-text-secondary)] mt-0.5">
                    {n.timestamp}
                  </p>
                </div>
                {!n.isRead && (
                  <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-primary)] mt-1.5 shrink-0" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
