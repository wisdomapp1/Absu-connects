import React, { useState, useRef } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import type { NotificationItem, NotificationType } from '../../types/index.ts';
import { Avatar } from '../common/Avatar.tsx';
import { executeNotificationNavigation } from '../../lib/notificationRouter.ts';
import {
  Bell,
  Heart,
  MessageCircle,
  UserPlus,
  UserCheck,
  CheckCheck,
  Megaphone,
  Archive,
  Clock,
  Sparkles,
  RefreshCw,
  Users,
  Eye,
} from 'lucide-react';

export const AlertsView: React.FC = () => {
  const {
    notifications,
    loadingNotifications,
    refreshNotifications,
    posts,
    conversations,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    navigateTo,
    setFriendTab,
    openNotificationPrompt,
    startConversationWithUser,
    openStoryById,
    addToast,
  } = useApp();
  const { user: _user } = useAuth();

  const [destination, setDestination] = useState<'recent' | 'archived'>('recent');
  const [filterType, setFilterType] = useState<'all' | 'unread'>('all');
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const lastClickRef = useRef<{ id: string; ts: number }>({ id: '', ts: 0 });

  const isPushActive = typeof Notification !== 'undefined' && Notification.permission === 'granted';

  // Keep personal Alerts strictly isolated from Page-targeted notifications (`recipientPageId`)
  const personalNotifications = notifications.filter((n) => !n.recipientPageId);
  const recentList = personalNotifications.filter((n) => !n.isArchived);
  const archivedList = personalNotifications.filter((n) => n.isArchived);

  const currentList = destination === 'recent' ? recentList : archivedList;

  const filtered =
    filterType === 'unread'
      ? currentList.filter((n) => !n.isRead)
      : currentList;

  const recentUnreadCount = recentList.filter((n) => !n.isRead).length;
  const archivedUnreadCount = archivedList.filter((n) => !n.isRead).length;

  const handleManualRefresh = async () => {
    setIsManualRefreshing(true);
    try {
      await refreshNotifications();
    } finally {
      setIsManualRefreshing(false);
    }
  };

  const getEventIcon = (type: NotificationType) => {
    switch (type) {
      case 'like':
      case 'story_reaction':
      case 'story_like':
        return <Heart className="w-3.5 h-3.5 text-red-500 fill-current" />;
      case 'comment':
      case 'story_comment':
        return <MessageCircle className="w-3.5 h-3.5 text-blue-500 fill-current" />;
      case 'story_view':
        return <Eye className="w-3.5 h-3.5 text-emerald-500" />;
      case 'friend_request':
        return <UserPlus className="w-3.5 h-3.5 text-[var(--color-primary)]" />;
      case 'friend_accept':
        return <UserCheck className="w-3.5 h-3.5 text-[var(--color-success)]" />;
      case 'campus_notice':
        return <Megaphone className="w-3.5 h-3.5 text-amber-500" />;
      case 'welcome_discovery':
        return <Sparkles className="w-3.5 h-3.5 text-[var(--color-primary)]" />;
      case 'discovery_suggestion':
      case 'discovery_reminder':
        return <Users className="w-3.5 h-3.5 text-emerald-500" />;
      default:
        return <Bell className="w-3.5 h-3.5 text-[var(--color-primary)]" />;
    }
  };

  const handleNotificationClick = async (item: NotificationItem) => {
    const now = Date.now();
    if (lastClickRef.current.id === item.id && now - lastClickRef.current.ts < 500) {
      return;
    }
    lastClickRef.current = { id: item.id, ts: now };

    markNotificationAsRead(item.id);

    await executeNotificationNavigation(item, {
      currentUserId: _user?.id,
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
    <div className="flex flex-col gap-3">
      {/* Push Notification Setup Banner if not yet active */}
      {!isPushActive && (
        <div className="p-3.5 rounded-2xl bg-[var(--color-primary-subtle)] border border-[var(--color-primary)]/30 flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[var(--color-primary)] text-white flex items-center justify-center shrink-0 shadow-xs">
              <Bell className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-[var(--color-text-primary)] truncate">
                Allow Notifications for ABSU Connect
              </p>
              <p className="text-[11px] text-[var(--color-text-secondary)] truncate">
                Get real-time alerts when coursemates message or connect with you.
              </p>
            </div>
          </div>
          <button
            onClick={openNotificationPrompt}
            className="px-3.5 py-1.5 rounded-xl bg-[var(--color-primary)] text-white text-xs font-bold hover:opacity-90 shrink-0 shadow-sm active:scale-95 transition-all"
          >
            Allow
          </button>
        </div>
      )}

      {/* Header */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 shadow-sm transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-extrabold text-[var(--color-text-primary)]">
              Alerts
            </h1>
            {recentUnreadCount > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--color-primary-subtle)] text-[var(--color-primary)]">
                {recentUnreadCount} new
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleManualRefresh}
              disabled={isManualRefreshing || loadingNotifications}
              className="p-1.5 rounded-xl hover:bg-[var(--color-bg-main)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-all"
              title="Refresh notifications"
              aria-label="Refresh alerts"
            >
              <RefreshCw
                className={`w-4 h-4 ${isManualRefreshing || loadingNotifications ? 'animate-spin text-[var(--color-primary)]' : ''}`}
              />
            </button>

            <button
              onClick={markAllNotificationsAsRead}
              className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-primary)] hover:underline"
            >
              <CheckCheck className="w-4 h-4" />
              <span>Mark all read</span>
            </button>
          </div>
        </div>

        {/* Primary Destination Switcher: Recent (<7 days) vs Archive (7+ days) */}
        <div className="grid grid-cols-2 gap-2 mt-3.5">
          <button
            onClick={() => setDestination('recent')}
            className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              destination === 'recent'
                ? 'bg-[var(--color-primary)] text-white shadow-xs'
                : 'bg-[var(--color-bg-main)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-border)]/50'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Active Recent</span>
            {recentList.length > 0 && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-semibold ${
                  destination === 'recent'
                    ? 'bg-white/20 text-white'
                    : 'bg-[var(--color-border)] text-[var(--color-text-secondary)]'
                }`}
              >
                {recentList.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setDestination('archived')}
            className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              destination === 'archived'
                ? 'bg-[var(--color-primary)] text-white shadow-xs'
                : 'bg-[var(--color-bg-main)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-border)]/50'
            }`}
          >
            <Archive className="w-4 h-4" />
            <span>Archived (7d+)</span>
            {archivedList.length > 0 && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-semibold ${
                  destination === 'archived'
                    ? 'bg-white/20 text-white'
                    : 'bg-[var(--color-border)] text-[var(--color-text-secondary)]'
                }`}
              >
                {archivedList.length}
              </span>
            )}
          </button>
        </div>

        {/* Sub-filter: All vs Unread */}
        <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-[var(--color-border)]">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                filterType === 'all'
                  ? 'bg-[var(--color-text-primary)] text-[var(--color-bg-card)]'
                  : 'bg-[var(--color-bg-main)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              All {destination === 'recent' ? 'Recent' : 'Archived'}
            </button>
            <button
              onClick={() => setFilterType('unread')}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                filterType === 'unread'
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-[var(--color-bg-main)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              Unread
              {(destination === 'recent' ? recentUnreadCount : archivedUnreadCount) > 0 && (
                <span className="ml-1 text-[10px] opacity-90">
                  ({destination === 'recent' ? recentUnreadCount : archivedUnreadCount})
                </span>
              )}
            </button>
          </div>

          <span className="text-[11px] text-[var(--color-text-secondary)] hidden sm:inline">
            {destination === 'recent' ? 'Last 7 days · Active alerts' : 'Preserved permanently · Archived'}
          </span>
        </div>
      </div>

      {/* Archive Policy Banner */}
      {destination === 'archived' && (
        <div className="px-3.5 py-2.5 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
          <Sparkles className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
          <span>
            Notifications older than 7 days are safely retained in your archive. Nothing is ever deleted, and archived items do not count toward your active Alerts badge.
          </span>
        </div>
      )}

      {/* Loading Skeleton */}
      {loadingNotifications && notifications.length === 0 ? (
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="p-3.5 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] flex items-center gap-3 animate-pulse"
            >
              <div className="w-10 h-10 rounded-full bg-[var(--color-border)] shrink-0" />
              <div className="flex-1 flex flex-col gap-2">
                <div className="w-3/4 h-3.5 rounded bg-[var(--color-border)]" />
                <div className="w-1/4 h-2.5 rounded bg-[var(--color-border)]" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-8 text-center bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl flex flex-col items-center justify-center gap-2">
          {destination === 'recent' ? (
            <Bell className="w-10 h-10 text-[var(--color-text-secondary)] opacity-50" />
          ) : (
            <Archive className="w-10 h-10 text-[var(--color-text-secondary)] opacity-50" />
          )}
          <h3 className="text-sm font-bold text-[var(--color-text-primary)]">
            {destination === 'recent'
              ? filterType === 'unread'
                ? 'No unread recent notifications'
                : 'No recent notifications'
              : filterType === 'unread'
              ? 'No unread archived notifications'
              : 'Archive is empty'}
          </h3>
          <p className="text-xs text-[var(--color-text-secondary)] max-w-xs">
            {destination === 'recent'
              ? filterType === 'unread'
                ? "You've caught up on all recent campus alerts from the last 7 days."
                : "When peers interact with your posts or profile, you'll see alerts here."
              : 'Notifications older than 7 days will automatically appear here for your records.'}
          </p>

          {destination === 'recent' && archivedList.length > 0 && (
            <button
              onClick={() => setDestination('archived')}
              className="mt-2 px-4 py-2 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] hover:border-[var(--color-primary)] text-xs font-bold text-[var(--color-primary)] transition-all flex items-center gap-1.5 shadow-2xs"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>View Archived Notifications ({archivedList.length})</span>
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNotificationClick(item)}
              className={`p-3.5 rounded-2xl border transition-all text-left flex items-start gap-3 shadow-xs hover:border-[var(--color-primary)]/40 ${
                item.isRead
                  ? 'bg-[var(--color-bg-card)] border-[var(--color-border)]'
                  : 'bg-[var(--color-primary-subtle)]/30 border-[var(--color-primary)]/30'
              }`}
            >
              <div className="relative shrink-0">
                <Avatar src={item.actor.avatar} name={item.actor.name} size="md" />
                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[var(--color-bg-card)] border border-[var(--color-border)] flex items-center justify-center shadow-xs">
                  {getEventIcon(item.type)}
                </div>
              </div>

              <div className="flex-1 min-w-0">
                {item.title && (
                  <p className="text-xs sm:text-sm font-extrabold text-[var(--color-text-primary)] mb-0.5">
                    {item.title}
                  </p>
                )}
                <p className="text-xs sm:text-sm text-[var(--color-text-primary)] leading-snug">
                  {!item.title && <span className="font-bold">{item.actor.name} </span>}
                  <span>{item.content}</span>
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[11px] text-[var(--color-text-secondary)]">
                    {item.timestamp}
                  </span>
                  {item.isArchived && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-[var(--color-bg-main)] text-[var(--color-text-secondary)] border border-[var(--color-border)]">
                      Archived
                    </span>
                  )}
                </div>
              </div>

              {!item.isRead && (
                <div
                  className="w-2.5 h-2.5 rounded-full bg-[var(--color-primary)] shrink-0 self-center"
                  title="Unread alert"
                />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
