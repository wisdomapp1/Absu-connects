import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useLocalCache } from '../../hooks/useLocalCache.ts';
import { Avatar } from '../common/Avatar.tsx';
import { VerifiedBadge } from '../common/VerifiedBadge.tsx';
import type { Conversation } from '../../types/index.ts';
import {
  Search,
  MessageSquarePlus,
  MessageSquare,
  BellOff,
  MoreVertical,
  Mail,
  Trash2,
  Bell,
  WifiOff,
  Clock,
  Loader2,
} from 'lucide-react';

interface ConversationListProps {
  onSelectChat?: (chatId: string) => void;
}

export const ConversationList: React.FC<ConversationListProps> = ({ onSelectChat }) => {
  const {
    conversations: globalConversations,
    loadingConversations,
    navigateTo,
    isUserOnline,
    isConversationMuted,
    toggleMuteConversation,
    markConversationUnread,
    deleteConversationForMe,
  } = useApp();

  const { isOffline, cachedChats, queuedMessages } = useLocalCache();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeMenuConvId, setActiveMenuConvId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close context menu on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenuConvId(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Display priority: If global conversations are loaded, use them; otherwise use instant cached chats
  const displayConversations: Conversation[] =
    globalConversations.length > 0 ? globalConversations : cachedChats;

  const filtered = displayConversations.filter(
    (c) =>
      c.participant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.lastMessage.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.participant.department &&
        c.participant.department.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleOpenConversation = (convId: string) => {
    if (onSelectChat) {
      onSelectChat(convId);
    } else {
      navigateTo('conversation', { convId });
    }
  };

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Offline Alert Bar */}
      {isOffline && (
        <div className="bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 rounded-xl px-3.5 py-2 text-xs font-medium flex items-center justify-between gap-2 shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>You are offline - messages will be sent when online</span>
          </div>
          {queuedMessages.length > 0 && (
            <span className="flex items-center gap-1 text-[11px] font-bold bg-amber-500/20 px-2 py-0.5 rounded-full">
              <Clock className="w-3 h-3" /> {queuedMessages.length} queued
            </span>
          )}
        </div>
      )}

      {/* Header & Search */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 shadow-sm transition-colors">
        <div className="flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-extrabold text-[var(--color-text-primary)]">
            Messages
          </h1>
          <button
            onClick={() => navigateTo('friends')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--color-primary-subtle)] text-[var(--color-primary)] text-xs font-bold hover:bg-[var(--color-primary)] hover:text-white transition-colors"
          >
            <MessageSquarePlus className="w-4 h-4" />
            <span>New Chat</span>
          </button>
        </div>

        {/* Search */}
        <div className="relative mt-3">
          <Search className="w-4 h-4 text-[var(--color-text-secondary)] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            autoCorrect="on"
            autoCapitalize="none"
            spellCheck={true}
            enterKeyHint="search"
            className="w-full pl-9 pr-3 py-2 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-xl text-xs sm:text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
          />
        </div>
      </div>

      {/* Loading state when no cache available yet */}
      {loadingConversations && displayConversations.length === 0 ? (
        <div className="p-10 text-center bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl flex flex-col items-center justify-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary)]" />
          <p className="text-xs text-[var(--color-text-secondary)]">Loading chats...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-8 text-center bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl flex flex-col items-center justify-center gap-2">
          <MessageSquare className="w-10 h-10 text-[var(--color-text-secondary)] opacity-50" />
          <h3 className="text-sm font-bold text-[var(--color-text-primary)]">
            {searchQuery ? 'No matching conversations' : 'No conversations yet'}
          </h3>
          <p className="text-xs text-[var(--color-text-secondary)] max-w-xs">
            {searchQuery
              ? 'Try searching by a different name or course'
              : 'Connect with your campus friends or coursemates in the Friends tab to start chatting.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 relative">
          {filtered.map((conv) => {
            const isMuted = isConversationMuted(conv.id);
            const isMenuOpen = activeMenuConvId === conv.id;

            return (
              <div
                key={conv.id}
                className="relative min-h-[70px] p-3.5 bg-[var(--color-bg-card)] border border-[var(--color-border)] hover:border-[var(--color-primary)]/40 rounded-2xl shadow-sm flex items-center justify-between gap-3 transition-all group"
              >
                {/* Main click target for opening conversation */}
                <button
                  type="button"
                  onClick={() => handleOpenConversation(conv.id)}
                  className="flex items-center gap-3 min-w-0 flex-1 text-left"
                >
                  <Avatar
                    src={conv.participant.avatar}
                    name={conv.participant.name}
                    size="md"
                    showOnline={!conv.isPageChat && isUserOnline(conv.participant.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="font-bold text-sm text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)] transition-colors truncate">
                        {conv.participant.name}
                      </p>
                      {conv.isPageChat && conv.pageIsVerified && <VerifiedBadge size={14} />}
                      <span className="text-[11px] text-[var(--color-text-secondary)] truncate">
                        {conv.isPageChat ? 'Page' : conv.participant.department}
                      </span>
                      {isMuted && (
                        <span title="Muted" className="shrink-0 flex items-center">
                          <BellOff className="w-3.5 h-3.5 text-[var(--color-text-secondary)] opacity-70" />
                        </span>
                      )}
                    </div>
                    <p
                      className={`text-xs truncate mt-0.5 ${
                        conv.unreadCount > 0
                          ? 'font-bold text-[var(--color-text-primary)]'
                          : 'text-[var(--color-text-secondary)]'
                      }`}
                    >
                      {conv.lastMessage || 'Tap to chat'}
                    </p>
                  </div>
                </button>

                {/* Right metadata & action trigger */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <div
                    onClick={() => handleOpenConversation(conv.id)}
                    className="flex flex-col items-end gap-1.5 cursor-pointer pr-1"
                  >
                    <span className="text-[11px] text-[var(--color-text-secondary)]">
                      {conv.lastMessageTime}
                    </span>
                    {conv.unreadCount > 0 && (
                      <span className="bg-[var(--color-primary)] text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                        {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                      </span>
                    )}
                  </div>

                  {/* 3-dots context menu */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuConvId((prev) => (prev === conv.id ? null : conv.id));
                      }}
                      className="p-1 rounded-xl text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-main)] transition-colors"
                      aria-label="Conversation options"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {isMenuOpen && (
                      <div
                        ref={menuRef}
                        className="absolute right-0 top-full mt-1 w-48 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl shadow-xl py-1.5 z-30 animate-in fade-in zoom-in-95"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            markConversationUnread(conv.id);
                            setActiveMenuConvId(null);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-main)] transition-colors text-left"
                        >
                          <Mail className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                          <span>Mark as unread</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            toggleMuteConversation(conv.id);
                            setActiveMenuConvId(null);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-main)] transition-colors text-left"
                        >
                          {isMuted ? (
                            <>
                              <Bell className="w-3.5 h-3.5 text-emerald-500" />
                              <span>Unmute notifications</span>
                            </>
                          ) : (
                            <>
                              <BellOff className="w-3.5 h-3.5 text-[var(--color-text-secondary)]" />
                              <span>Mute notifications</span>
                            </>
                          )}
                        </button>
                        <div className="my-1 border-t border-[var(--color-border)]" />
                        <button
                          type="button"
                          onClick={() => {
                            deleteConversationForMe(conv.id);
                            setActiveMenuConvId(null);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-rose-500 hover:bg-rose-500/10 transition-colors text-left"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete chat for me</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ConversationList;
