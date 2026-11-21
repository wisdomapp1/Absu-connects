import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import type {
  User,
  Post,
  PostCategory,
  PostAudience,
  FriendRequest,
  Conversation,
  NotificationItem,
  FeedFilter,
  FriendTab,
  MainNavTab,
  ActiveView,
  ToastMessage,
  AttachedMediaItem,
} from '../types/index.ts';
import { calculateUnreadCount } from '../utils/logic.ts';
import { safeStorage, safePushState, safeReplaceState } from '../utils/safeStorage.ts';
import { useAuth } from './AuthContext.tsx';
import { supabase } from '../lib/supabase.ts';
import {
  fetchFeedPostsPage,
  createRealPost,
  deleteRealPost,
  toggleRealPostReaction,
  toggleSavePostInDb,
  createRealComment,
  PostMediaAttachment,
} from '../lib/postService.ts';
import {
  fetchAllProfiles,
  saveProfileToSupabase,
  fetchProfileById,
} from '../lib/profileService.ts';
import {
  fetchUserFriendships,
  sendRealFriendRequest,
  acceptRealFriendRequest,
  declineOrCancelFriendRequest,
  removeRealFriend,
} from '../lib/friendService.ts';
import {
  fetchUserConversations,
  sendRealMessage,
  getOrCreateDirectConversation,
  markConversationAsRead,
  getMutedConversationIds,
  toggleMuteConversationForUser,
  hideConversationForUser,
} from '../lib/messageService.ts';
import {
  updateMyPresence,
  fetchPresences,
  isOnlineTimestamp,
} from '../lib/presenceService.ts';
import {
  fetchUserNotifications,
  createRealNotification,
  createOrUpdateConversationNotification,
  markRealNotificationAsRead,
  markAllRealNotificationsAsRead,
  checkDiscoveryInactivityReminder,
} from '../lib/notificationService.ts';
import {
  submitRealReport,
  fetchUserBlocks,
  blockRealUser,
  unblockRealUser,
} from '../lib/moderationService.ts';
import {
  uploadPostMediaToSupabaseStorage,
  deletePostMediaFilesFromStorage,
} from '../lib/storageService.ts';
import { adminService, isSuperAdminEmail } from '../lib/adminService.ts';
import {
  sendPrivacySafePush,
  playNotificationChime,
  getPushPermissionStatus,
} from '../lib/pushService.ts';
import { MR_ANONYMOUS_PAGE_ID } from '../lib/pageService.ts';
import { initAllPushChannels, isNativeAndroidApp } from '../lib/nativePushService.ts';

export interface AppContextType {
  // Super Admin & Platform Control
  isSuperAdmin: boolean;
  adminViewOpen: boolean;
  openAdminDashboard: () => void;
  closeAdminDashboard: () => void;
  platformBanner: string | null;
  userRestriction: {
    status: 'suspended' | 'disabled';
    restrictionReason?: string;
    suspendedUntil?: string;
  } | null;

  // Theme
  theme: 'light' | 'dark' | 'system';
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  toggleTheme: () => void;

  // Navigation
  activeTab: MainNavTab;
  activeView: ActiveView;
  setActiveTab: (tab: MainNavTab) => void;
  navigateTo: (
    view: ActiveView,
    options?: {
      userId?: string;
      convId?: string;
      communityId?: string;
      eventId?: string;
      postId?: string;
      commentId?: string | null;
      parentCommentId?: string | null;
      openComments?: boolean;
      actorId?: string | null;
    }
  ) => void;
  goBack: () => void;

  // Selected Community, Event & Post Deep-Link Context
  selectedCommunityId: string | null;
  setSelectedCommunityId: (id: string | null) => void;
  selectedEventId: string | null;
  setSelectedEventId: (id: string | null) => void;
  selectedPostId: string | null;
  selectedPostNavContext: {
    commentId?: string | null;
    parentCommentId?: string | null;
    openComments?: boolean;
    actorId?: string | null;
    navToken: number;
  } | null;

  // Current User
  currentUser: User;
  updateCurrentUser: (updated: Partial<User>) => Promise<void>;
  selectedUserId: string | null;
  selectedUser: User | null;

  // Posts
  posts: Post[];
  loadingPosts: boolean;
  loadingMorePosts: boolean;
  hasMorePosts: boolean;
  loadMorePosts: () => Promise<void>;
  refreshPosts: () => Promise<void>;
  feedFilter: FeedFilter;
  setFeedFilter: (filter: FeedFilter) => void;
  createPost: (
    content: string,
    category: PostCategory,
    audience: PostAudience,
    mediaFileOrUrl?: File | string | Array<File | string>,
    callbacks?: { onProgress?: (step: string) => void; onError?: (error: string) => void }
  ) => Promise<boolean>;
  toggleLike: (postId: string) => Promise<void>;
  toggleSave: (postId: string) => void;
  addComment: (postId: string, text: string, parentId?: string | null) => Promise<void>;
  deletePost: (postId: string) => Promise<void>;
  hidePost: (postId: string) => void;
  reportPost: (postId: string, reason: string) => Promise<void>;

  // Friends & Discovery
  users: User[];
  friends: User[];
  discoverUsers: User[];
  loadingUsers: boolean;
  friendRequests: FriendRequest[];
  friendTab: FriendTab;
  setFriendTab: (tab: FriendTab) => void;
  sendFriendRequest: (userId: string) => Promise<void>;
  cancelFriendRequest: (userId: string) => Promise<void>;
  acceptFriendRequest: (requestId: string) => Promise<void>;
  declineFriendRequest: (requestId: string) => Promise<void>;
  removeFriend: (userId: string) => Promise<void>;
  refreshFriends: () => Promise<void>;

  // Moderation & Blocks
  blockedUserIds: Set<string>;
  blockUser: (userId: string) => Promise<boolean>;
  unblockUser: (userId: string) => Promise<boolean>;

  // Messages
  conversations: Conversation[];
  loadingConversations: boolean;
  selectedConversationId: string | null;
  selectedConversation: Conversation | null;
  sendMessage: (convId: string, text?: string, files?: File[]) => Promise<boolean>;
  startConversationWithUser: (user: User) => Promise<void>;
  refreshConversations: () => Promise<void>;
  markConversationRead: (convId: string) => Promise<void>;
  markConversationUnread: (convId: string) => void;
  toggleMuteConversation: (convId: string) => void;
  isConversationMuted: (convId: string) => boolean;
  deleteConversationForMe: (convId: string) => Promise<void>;

  // Presence
  userPresenceMap: Record<string, string>;
  isUserOnline: (userId: string) => boolean;

  // Notifications
  notifications: NotificationItem[];
  loadingNotifications: boolean;
  refreshNotifications: () => Promise<void>;
  markNotificationAsRead: (id: string) => Promise<void>;
  markAllNotificationsAsRead: () => Promise<void>;
  unreadNotificationsCount: number;
  unreadMessagesCount: number;
  notificationPromptOpen: boolean;
  setNotificationPromptOpen: (open: boolean) => void;
  openNotificationPrompt: () => void;

  // Modals & Overlays
  createPostModalOpen: boolean;
  setCreatePostModalOpen: (open: boolean) => void;
  openCreatePostWithMedia: (items: AttachedMediaItem[]) => void;
  initialPostMedia: AttachedMediaItem[];
  clearInitialPostMedia: () => void;
  editProfileModalOpen: boolean;
  setEditProfileModalOpen: (open: boolean) => void;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  imageLightboxUrl: string | null;
  setImageLightboxUrl: (url: string | null) => void;

  // Toasts
  toasts: ToastMessage[];
  addToast: (message: string, type?: 'success' | 'info' | 'warning') => void;
  removeToast: (id: string) => void;

  // Global Pull-to-Refresh
  isRefreshingScreen: boolean;
  refreshCurrentScreen: () => Promise<{ success: boolean; message: string }>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export interface NavigationEntry {
  view: ActiveView;
  tab?: MainNavTab;
  userId?: string | null;
  convId?: string | null;
  communityId?: string | null;
  eventId?: string | null;
  postId?: string | null;
  commentId?: string | null;
  parentCommentId?: string | null;
  openComments?: boolean;
  actorId?: string | null;
}

// Clean fallback structure when user profile is loading
const defaultEmptyUser: User = {
  id: '',
  name: 'Student',
  avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=ABSU&backgroundColor=6d45d9&textColor=ffffff',
  handle: '@student',
  department: 'Undergraduate',
  faculty: 'Abia State University',
  level: '100 Level',
  campus: 'Uturu (Main Campus)',
  bio: '',
  interests: [],
  relationshipState: 'self',
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Theme state with local persistence (legitimate UI preference)
  const [theme, setThemeState] = useState<'light' | 'dark' | 'system'>(() => {
    const saved = safeStorage.getItem('absu_theme');
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
    return 'system';
  });

  const [systemIsDark, setSystemIsDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      try {
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
      } catch {
        return false;
      }
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e: MediaQueryListEvent) => setSystemIsDark(e.matches);
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    } catch {}
  }, []);

  const resolvedTheme: 'light' | 'dark' =
    theme === 'system' ? (systemIsDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (resolvedTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [resolvedTheme]);

  const setTheme = (newTheme: 'light' | 'dark' | 'system') => {
    setThemeState(newTheme);
    safeStorage.setItem('absu_theme', newTheme);
    addToast(`Theme switched to ${newTheme}`, 'info');
  };

  const toggleTheme = () => {
    const next = resolvedTheme === 'dark' ? 'light' : 'dark';
    setTheme(next);
  };

  // Auth & Profile
  const auth = useAuth();
  const authUserId = auth.user?.id || null;
  const refreshAuthProfileRef = useRef(auth.refreshProfile);
  refreshAuthProfileRef.current = auth.refreshProfile;

  const [currentUser, setCurrentUser] = useState<User>(() => auth.profile || defaultEmptyUser);

  useEffect(() => {
    if (auth.profile) {
      setCurrentUser(auth.profile);
    } else if (!authUserId) {
      setCurrentUser(defaultEmptyUser);
    }
  }, [auth.profile, authUserId]);

  // Super Admin state & live verification
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [adminViewOpen, setAdminViewOpen] = useState<boolean>(false);
  const [platformBanner, setPlatformBanner] = useState<string | null>(null);
  const [userRestriction, setUserRestriction] = useState<{
    status: 'suspended' | 'disabled';
    restrictionReason?: string;
    suspendedUntil?: string;
  } | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const verifyAdmin = async () => {
      const token = auth.session?.access_token;
      const email = auth.user?.email;

      if (!token || !email) {
        setIsSuperAdmin(false);
        setAdminViewOpen(false);
        return;
      }

      // Check against configured authorized administration emails
      if (!isSuperAdminEmail(email)) {
        setIsSuperAdmin(false);
        setAdminViewOpen(false);
        return;
      }

      try {
        const res = await adminService.verifySuperAdmin(token);
        if (!isCancelled) {
          setIsSuperAdmin(Boolean(res.isSuperAdmin));
        }
      } catch {
        if (!isCancelled) {
          // If server verification threw a transient network error but user holds a valid authorized session, keep check consistent
          setIsSuperAdmin(isSuperAdminEmail(email));
        }
      }
    };

    verifyAdmin();

    return () => {
      isCancelled = true;
    };
  }, [auth.session?.access_token, auth.user?.email]);

  useEffect(() => {
    // Fetch public platform broadcast banner if active
    let isCancelled = false;
    const fetchBanner = async () => {
      try {
        const res = await adminService.getPlatformBanner();
        if (!isCancelled && res.banner) {
          setPlatformBanner(res.banner);
        }
      } catch {
        // quiet ignore
      }
    };
    fetchBanner();

    // Check account restriction status for active session
    const checkUserRestriction = async () => {
      const token = auth.session?.access_token;
      if (!token) {
        setUserRestriction(null);
        return;
      }
      try {
        const res = await fetch('/api/users/me/restriction', {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null);
        const ct = (res?.headers.get('content-type') || '').toLowerCase();
        if (res && res.ok && ct.includes('application/json') && !isCancelled) {
          const data = await res.json().catch(() => null);
          if (data?.isRestricted && data?.restriction) {
            setUserRestriction(data.restriction);
          } else {
            setUserRestriction(null);
          }
        }
      } catch {}
    };
    checkUserRestriction();

    return () => {
      isCancelled = true;
    };
  }, [auth.session?.access_token]);

  const openAdminDashboard = useCallback(() => {
    if (isSuperAdmin) {
      setAdminViewOpen(true);
      safePushState({ isOverlay: true, type: 'admin' }, '', window.location.pathname);
    }
  }, [isSuperAdmin]);

  const closeAdminDashboard = useCallback(() => {
    setAdminViewOpen(false);
  }, []);

  // Resolve deep link route from URL query on startup (e.g. from Web Push notification clicks)
  const initialRoute = (() => {
    if (typeof window !== 'undefined' && window.location.search) {
      try {
        const params = new URLSearchParams(window.location.search);
        const view = params.get('view') as ActiveView;
        const convId = params.get('convId') || null;
        const userId = params.get('userId') || null;
        const communityId = params.get('communityId') || null;
        const eventId = params.get('eventId') || null;
        const postId = params.get('postId') || null;
        const commentId = params.get('commentId') || null;
        const parentCommentId = params.get('parentCommentId') || null;
        const openComments = params.get('openComments') === '1' || Boolean(commentId);
        if (view) {
          const mainTabs: MainNavTab[] = ['home', 'friends', 'messages', 'alerts', 'more'];
          const tab: MainNavTab = mainTabs.includes(view as MainNavTab)
            ? (view as MainNavTab)
            : view === 'conversation' || view === 'contact-info'
            ? 'messages'
            : view === 'user-profile'
            ? 'friends'
            : 'home';
          return {
            view,
            tab,
            convId,
            userId,
            communityId,
            eventId,
            postId,
            commentId,
            parentCommentId,
            openComments,
          };
        }
      } catch {}
    }
    return {
      view: 'home' as ActiveView,
      tab: 'home' as MainNavTab,
      convId: null,
      userId: null,
      communityId: null,
      eventId: null,
      postId: null,
      commentId: null,
      parentCommentId: null,
      openComments: false,
    };
  })();

  // Navigation history & active state
  const [activeTab, setActiveTabState] = useState<MainNavTab>(initialRoute.tab);
  const [activeView, setActiveView] = useState<ActiveView>(initialRoute.view);
  const [navHistory, setNavHistory] = useState<NavigationEntry[]>([
    {
      view: initialRoute.view,
      tab: initialRoute.tab,
      userId: initialRoute.userId,
      convId: initialRoute.convId,
      communityId: initialRoute.communityId,
      eventId: initialRoute.eventId,
      postId: initialRoute.postId,
      commentId: initialRoute.commentId,
      parentCommentId: initialRoute.parentCommentId,
      openComments: initialRoute.openComments,
    },
  ]);

  // Modals & Overlays
  const [createPostModalOpen, setCreatePostModalOpenState] = useState<boolean>(false);
  const [initialPostMedia, setInitialPostMedia] = useState<AttachedMediaItem[]>([]);
  const [editProfileModalOpen, setEditProfileModalOpenState] = useState<boolean>(false);
  const [searchOpen, setSearchOpenState] = useState<boolean>(false);
  const [imageLightboxUrl, setImageLightboxUrlState] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Navigation & overlay tracking refs for Android Back / Popstate / Capacitor synchronization
  const activeViewRef = useRef<ActiveView>('home');
  const activeTabRef = useRef<MainNavTab>('home');
  const navHistoryRef = useRef<NavigationEntry[]>([
    {
      view: initialRoute.view,
      tab: initialRoute.tab,
      userId: initialRoute.userId,
      convId: initialRoute.convId,
      communityId: initialRoute.communityId,
      eventId: initialRoute.eventId,
      postId: initialRoute.postId,
      commentId: initialRoute.commentId,
      parentCommentId: initialRoute.parentCommentId,
      openComments: initialRoute.openComments,
    },
  ]);
  const createPostModalOpenRef = useRef<boolean>(false);
  const editProfileModalOpenRef = useRef<boolean>(false);
  const searchOpenRef = useRef<boolean>(false);
  const imageLightboxUrlRef = useRef<string | null>(null);
  const adminViewOpenRef = useRef<boolean>(false);
  const lastBackPressRef = useRef<number>(0);

  // Keep refs synchronized
  useEffect(() => { activeViewRef.current = activeView; }, [activeView]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { navHistoryRef.current = navHistory; }, [navHistory]);
  useEffect(() => { createPostModalOpenRef.current = createPostModalOpen; }, [createPostModalOpen]);
  useEffect(() => { editProfileModalOpenRef.current = editProfileModalOpen; }, [editProfileModalOpen]);
  useEffect(() => { searchOpenRef.current = searchOpen; }, [searchOpen]);
  useEffect(() => { imageLightboxUrlRef.current = imageLightboxUrl; }, [imageLightboxUrl]);
  useEffect(() => { adminViewOpenRef.current = adminViewOpen; }, [adminViewOpen]);

  // Dismissible overlay setters that synchronize with browser history
  const setCreatePostModalOpen = useCallback((open: boolean) => {
    setCreatePostModalOpenState(open);
    if (open) {
      safePushState({ isOverlay: true, type: 'createPost' }, '', window.location.pathname);
    }
  }, []);

  const setEditProfileModalOpen = useCallback((open: boolean) => {
    setEditProfileModalOpenState(open);
    if (open) {
      safePushState({ isOverlay: true, type: 'editProfile' }, '', window.location.pathname);
    }
  }, []);

  const setSearchOpen = useCallback((open: boolean) => {
    setSearchOpenState(open);
    if (open) {
      safePushState({ isOverlay: true, type: 'search' }, '', window.location.pathname);
    }
  }, []);

  const setImageLightboxUrl = useCallback((url: string | null) => {
    setImageLightboxUrlState(url);
    if (url) {
      safePushState({ isOverlay: true, type: 'lightbox' }, '', window.location.pathname);
    }
  }, []);

  const openCreatePostWithMedia = useCallback((items: AttachedMediaItem[]) => {
    setInitialPostMedia(items);
    setCreatePostModalOpen(true);
  }, [setCreatePostModalOpen]);

  const clearInitialPostMedia = useCallback(() => {
    setInitialPostMedia([]);
  }, []);

  const setActiveTab = (tab: MainNavTab) => {
    if (activeTabRef.current === tab && activeViewRef.current === tab) {
      return;
    }
    setActiveTabState(tab);
    setActiveView(tab);
    const entry: NavigationEntry = { view: tab, tab };
    setNavHistory((prev) => [...prev, entry]);
    navHistoryRef.current = [...navHistoryRef.current, entry];
    safePushState({ view: tab, tab }, '', window.location.pathname);
  };

  const navigateTo = (
    view: ActiveView,
    options?: {
      userId?: string;
      convId?: string;
      communityId?: string;
      eventId?: string;
      postId?: string;
      commentId?: string | null;
      parentCommentId?: string | null;
      openComments?: boolean;
      actorId?: string | null;
    }
  ) => {
    let targetView = view;
    if (view === 'user-profile' && options?.userId) {
      if (
        options.userId === '0c3240e3-ae39-461d-bd7a-4963859b9bc7' ||
        options.userId === 'b4f38505-fce6-44be-8727-8ebf04eb2ceb'
      ) {
        targetView = 'mr-anonymous';
      } else {
        setSelectedUserId(options.userId);
      }
    }
    if (options?.communityId) {
      setSelectedCommunityId(options.communityId);
    }
    if (options?.eventId) {
      setSelectedEventId(options.eventId);
    }
    if (options?.postId) {
      const currentEntry = navHistoryRef.current[navHistoryRef.current.length - 1];
      const isDuplicatePostNav =
        activeViewRef.current === 'post-detail' &&
        targetView === 'post-detail' &&
        currentEntry?.postId === options.postId &&
        (currentEntry?.commentId || null) === (options.commentId || null);

      setSelectedPostId(options.postId);
      setSelectedPostNavContext({
        commentId: options.commentId || null,
        parentCommentId: options.parentCommentId || null,
        openComments: Boolean(options.openComments || options.commentId),
        actorId: options.actorId || null,
        navToken: Date.now(),
      });

      if (isDuplicatePostNav) {
        return;
      }
    }
    if (options?.convId) {
      setSelectedConversationId(options.convId);
      markConversationAsRead(options.convId);
      setConversations((prev) => {
        let changed = false;
        const next = prev.map((c) => {
          if (c.id === options.convId && c.unreadCount > 0) {
            changed = true;
            return { ...c, unreadCount: 0 };
          }
          return c;
        });
        return changed ? next : prev;
      });
    }

    const nextTab: MainNavTab = ['home', 'friends', 'messages', 'alerts', 'more'].includes(targetView)
      ? (targetView as MainNavTab)
      : activeTabRef.current;

    setActiveView(targetView);
    if (['home', 'friends', 'messages', 'alerts', 'more'].includes(targetView)) {
      setActiveTabState(targetView as MainNavTab);
    }

    const nextEntry: NavigationEntry = {
      view: targetView,
      tab: nextTab,
      userId: options?.userId || (targetView === 'user-profile' ? options?.userId || null : null),
      convId: options?.convId || (targetView === 'conversation' ? options?.convId || null : null),
      communityId: options?.communityId || (targetView === 'community-detail' ? options?.communityId || null : null),
      eventId: options?.eventId || (targetView === 'event-detail' ? options?.eventId || null : null),
      postId: options?.postId || (targetView === 'post-detail' ? options?.postId || null : null),
      commentId: options?.commentId || null,
      parentCommentId: options?.parentCommentId || null,
      openComments: Boolean(options?.openComments || options?.commentId),
      actorId: options?.actorId || null,
    };

    setNavHistory((prev) => [...prev, nextEntry]);
    navHistoryRef.current = [...navHistoryRef.current, nextEntry];
    safePushState({ view: targetView, options }, '', window.location.pathname);
  };

  const navigateToRef = useRef(navigateTo);
  navigateToRef.current = navigateTo;

  const goBack = useCallback(() => {
    // 1. If any dismissible overlay is open, dismiss it first
    if (imageLightboxUrlRef.current) {
      setImageLightboxUrlState(null);
      return;
    }
    if (createPostModalOpenRef.current) {
      setCreatePostModalOpenState(false);
      setInitialPostMedia([]);
      return;
    }
    if (editProfileModalOpenRef.current) {
      setEditProfileModalOpenState(false);
      return;
    }
    if (searchOpenRef.current) {
      setSearchOpenState(false);
      return;
    }
    if (adminViewOpenRef.current) {
      setAdminViewOpen(false);
      return;
    }

    // 2. In-memory navigation stack popping (reliable across Web and Capacitor APK)
    const history = [...navHistoryRef.current];
    if (history.length > 1) {
      history.pop(); // remove current view
      const prevEntry = history[history.length - 1];
      navHistoryRef.current = history;
      setNavHistory(history);

      setActiveView(prevEntry.view);
      if (prevEntry.tab) {
        setActiveTabState(prevEntry.tab);
      } else if (['home', 'friends', 'messages', 'alerts', 'more'].includes(prevEntry.view as any)) {
        setActiveTabState(prevEntry.view as MainNavTab);
      }

      setSelectedUserId(prevEntry.userId ?? null);
      setSelectedConversationId(prevEntry.convId ?? null);
      setSelectedCommunityId(prevEntry.communityId ?? null);
      setSelectedEventId(prevEntry.eventId ?? null);
      setSelectedPostId(prevEntry.postId ?? null);
      setSelectedPostNavContext(
        prevEntry.postId
          ? {
              commentId: prevEntry.commentId || null,
              parentCommentId: prevEntry.parentCommentId || null,
              openComments: Boolean(prevEntry.openComments || prevEntry.commentId),
              actorId: prevEntry.actorId || null,
              navToken: Date.now(),
            }
          : null
      );
      return;
    }

    // 3. Fallback hierarchical back if entered directly via URL or empty stack
    if (activeViewRef.current !== 'home') {
      setActiveView('home');
      setActiveTabState('home');
      setSelectedUserId(null);
      setSelectedConversationId(null);
      setSelectedCommunityId(null);
      setSelectedEventId(null);
      setSelectedPostId(null);
      setSelectedPostNavContext(null);
    }
  }, []);

  // System PopState and Android Back Button Navigation Controller
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Anchor the root history entry so Android Back gesture has a state to pop from
    safeReplaceState({ view: 'home', tab: 'home', root: true }, '', window.location.pathname);

    const handlePopState = () => {
      // Step A: Close any dismissible overlay first without changing the underlying screen
      if (imageLightboxUrlRef.current) {
        setImageLightboxUrlState(null);
        return;
      }
      if (createPostModalOpenRef.current) {
        setCreatePostModalOpenState(false);
        setInitialPostMedia([]);
        return;
      }
      if (editProfileModalOpenRef.current) {
        setEditProfileModalOpenState(false);
        return;
      }
      if (searchOpenRef.current) {
        setSearchOpenState(false);
        return;
      }
      if (adminViewOpenRef.current) {
        setAdminViewOpen(false);
        return;
      }

      // Step B: Pop previous view from history stack if available
      if (navHistoryRef.current.length > 1) {
        goBack();
        return;
      }

      // Step C: If not on home, return to home
      if (activeViewRef.current !== 'home') {
        goBack();
        return;
      }

      // Step D: We are on Home! Double-tap back exit protection
      const now = Date.now();
      if (now - lastBackPressRef.current < 2000) {
        // Confirmed second press: allow natural browser exit
        return;
      } else {
        lastBackPressRef.current = now;
        // Re-push home state so phone doesn't kick user out to desktop on first tap
        safePushState({ view: 'home', tab: 'home', root: true }, '', window.location.pathname);
        addToast('Press back again to exit ABSU Connect', 'info');
      }
    };

    window.addEventListener('popstate', handlePopState);

    // Capacitor Native Android Hardware Back Button & App URL Deep-Link Integration
    let capBackHandle: { remove: () => Promise<void> } | null = null;
    let capUrlHandle: { remove: () => Promise<void> } | null = null;
    let cancelled = false;

    if (Capacitor.isNativePlatform()) {
      CapacitorApp.addListener('backButton', () => {
        // 1. Overlay check
        if (imageLightboxUrlRef.current) {
          setImageLightboxUrlState(null);
          return;
        }
        if (createPostModalOpenRef.current) {
          setCreatePostModalOpenState(false);
          setInitialPostMedia([]);
          return;
        }
        if (editProfileModalOpenRef.current) {
          setEditProfileModalOpenState(false);
          return;
        }
        if (searchOpenRef.current) {
          setSearchOpenState(false);
          return;
        }
        if (adminViewOpenRef.current) {
          setAdminViewOpen(false);
          return;
        }

        // 2. Navigation history stack or internal views
        if (activeViewRef.current !== 'home' || navHistoryRef.current.length > 1) {
          goBack();
          return;
        }

        // 3. Home exit confirmation
        const now = Date.now();
        if (now - lastBackPressRef.current < 2000) {
          CapacitorApp.exitApp().catch(() => {});
        } else {
          lastBackPressRef.current = now;
          addToast('Press back again to exit ABSU Connect', 'info');
        }
      })
        .then((handle) => {
          if (cancelled) {
            handle.remove().catch(() => {});
          } else {
            capBackHandle = handle;
          }
        })
        .catch(() => {});

      CapacitorApp.addListener('appUrlOpen', (event) => {
        if (event?.url) {
          window.dispatchEvent(
            new CustomEvent('absu:notification-navigate', { detail: { url: event.url } })
          );
        }
      })
        .then((handle) => {
          if (cancelled) {
            handle.remove().catch(() => {});
          } else {
            capUrlHandle = handle;
          }
        })
        .catch(() => {});
    }

    return () => {
      cancelled = true;
      window.removeEventListener('popstate', handlePopState);
      capBackHandle?.remove().catch(() => {});
      capUrlHandle?.remove().catch(() => {});
    };
  }, [goBack]);

  // Real Database Collections (Empty by default — NO MOCK ARRAYS)
  const [posts, setPosts] = useState<Post[]>([]);
  const [loadingPosts, setLoadingPosts] = useState<boolean>(true);
  const [loadingMorePosts, setLoadingMorePosts] = useState<boolean>(false);
  const [hasMorePosts, setHasMorePosts] = useState<boolean>(false);
  const nextPostsCursorRef = useRef<string | null>(null);
  const [feedFilter, setFeedFilter] = useState<FeedFilter>('for-you');

  const [users, setUsers] = useState<User[]>([]);
  const [friends, setFriends] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState<boolean>(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(initialRoute.userId);
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(initialRoute.communityId);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(initialRoute.eventId);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(initialRoute.postId);
  const [selectedPostNavContext, setSelectedPostNavContext] = useState<{
    commentId?: string | null;
    parentCommentId?: string | null;
    openComments?: boolean;
    actorId?: string | null;
    navToken: number;
  } | null>(() =>
    initialRoute.postId
      ? {
          commentId: initialRoute.commentId,
          parentCommentId: initialRoute.parentCommentId,
          openComments: initialRoute.openComments,
          actorId: null,
          navToken: Date.now(),
        }
      : null
  );

  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [friendTab, setFriendTab] = useState<FriendTab>('discover');
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  const [inFlightFriendRequests, setInFlightFriendRequests] = useState<Set<string>>(new Set());

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [mutedConvIds, setMutedConvIds] = useState<Set<string>>(new Set());
  const [loadingConversations, setLoadingConversations] = useState<boolean>(true);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(initialRoute.convId);

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState<boolean>(true);
  const [notificationPromptOpen, setNotificationPromptOpen] = useState<boolean>(false);
  const [userPresenceMap, setUserPresenceMap] = useState<Record<string, string>>({});

  const openNotificationPrompt = useCallback(() => {
    setNotificationPromptOpen(true);
  }, []);

  // When user opens the app, initialize push channels (Android APK + Web FCM) and show onboarding if needed
  useEffect(() => {
    if (!authUserId || auth.loading) return;

    let cancelled = false;

    const syncPushOnStartup = async () => {
      // 1. Initialize Capacitor Android FCM (APK) OR Firebase Web FCM (Browser when permission already granted)
      const channelReady = await initAllPushChannels(authUserId).catch((err) => {
        console.debug('[AppContext] Push channel init note:', err);
        return false;
      });

      if (cancelled) return;

      const isBrowserGranted =
        typeof Notification !== 'undefined' && Notification.permission === 'granted';

      if (isBrowserGranted || (isNativeAndroidApp() && channelReady)) {
        safeStorage.setItem(`absu_push_enabled_${authUserId}`, 'true');
        return;
      }

      // If local storage was mistakenly marked true without real browser permission, reset it
      if (safeStorage.getItem(`absu_push_enabled_${authUserId}`) === 'true') {
        safeStorage.removeItem(`absu_push_enabled_${authUserId}`);
      }

      // Check cooldown if user chose 'Maybe Later' recently
      const dismissedUntil = safeStorage.getItem('absu_notif_prompt_dismissed_until');
      if (dismissedUntil && Number(dismissedUntil) > Date.now()) {
        return;
      }

      setTimeout(() => {
        if (!cancelled) {
          setNotificationPromptOpen(true);
        }
      }, 1200);
    };

    syncPushOnStartup();

    return () => {
      cancelled = true;
    };
  }, [authUserId, auth.loading]);

  // Listen for Service Worker & native Capacitor push notification click navigation messages when app is already open
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const navigateFromTargetUrl = (targetUrl: string) => {
      try {
        const parsed = new URL(targetUrl, window.location.origin);
        const view = (parsed.searchParams.get('view') as ActiveView) || 'alerts';
        navigateToRef.current(view, {
          userId: parsed.searchParams.get('userId') || undefined,
          convId: parsed.searchParams.get('convId') || undefined,
          communityId: parsed.searchParams.get('communityId') || undefined,
          eventId: parsed.searchParams.get('eventId') || undefined,
          postId: parsed.searchParams.get('postId') || undefined,
          commentId: parsed.searchParams.get('commentId'),
          parentCommentId: parsed.searchParams.get('parentCommentId'),
          openComments:
            parsed.searchParams.get('openComments') === '1' ||
            Boolean(parsed.searchParams.get('commentId')),
        });
      } catch {
        window.location.href = targetUrl;
      }
    };

    const handleSwMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg || msg.type !== 'ABSU_NOTIFICATION_NAVIGATE' || typeof msg.url !== 'string') return;
      navigateFromTargetUrl(msg.url);
    };

    const handleCustomNavigate = (event: Event) => {
      const url = (event as CustomEvent<{ url?: string }>)?.detail?.url;
      if (typeof url === 'string' && url.length > 0) {
        navigateFromTargetUrl(url);
      }
    };

    window.addEventListener('absu:notification-navigate', handleCustomNavigate);
    const hasSw = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
    if (hasSw) {
      navigator.serviceWorker.addEventListener('message', handleSwMessage);
    }
    return () => {
      window.removeEventListener('absu:notification-navigate', handleCustomNavigate);
      if (hasSw) {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage);
      }
    };
  }, []);

  // Synchronize muted conversations from local storage
  useEffect(() => {
    if (authUserId) {
      setMutedConvIds(getMutedConversationIds(authUserId));
    }
  }, [authUserId]);

  // Discoverable users: pure non-friends, not requested, not blocked, not self, prioritized by campus match
  const discoverUsers = React.useMemo(() => {
    const filtered = users.filter((u) => {
      if (!u.id || (authUserId && u.id === authUserId)) return false;
      if (u.relationshipState !== 'none') return false;
      if (blockedUserIds.has(u.id)) return false;
      return true;
    });

    const myDept = (currentUser.department || '').trim().toLowerCase();
    const myFaculty = (currentUser.faculty || '').trim().toLowerCase();
    const myLevel = (currentUser.level || '').trim().toLowerCase();
    const myInterests = new Set((currentUser.interests || []).map((i) => i.trim().toLowerCase()));
    const isGenericDept = !myDept || myDept === 'student' || myDept === 'undergraduate' || myDept === 'undergraduate student';
    const isGenericFaculty = !myFaculty || myFaculty === 'abia state university';

    const scoreUser = (u: User): number => {
      let score = 0;
      const uDept = (u.department || '').trim().toLowerCase();
      const uFaculty = (u.faculty || '').trim().toLowerCase();
      const uLevel = (u.level || '').trim().toLowerCase();

      if (!isGenericDept && uDept && uDept === myDept) score += 100;
      if (!isGenericFaculty && uFaculty && uFaculty === myFaculty) score += 50;
      if (myLevel && uLevel && uLevel === myLevel) score += 25;
      if (myInterests.size > 0 && Array.isArray(u.interests)) {
        for (const interest of u.interests) {
          if (myInterests.has(interest.trim().toLowerCase())) score += 15;
        }
      }
      if (isOnlineTimestamp(userPresenceMap[u.id])) score += 10;
      return score;
    };

    return [...filtered].sort((a, b) => scoreUser(b) - scoreUser(a));
  }, [users, authUserId, blockedUserIds, currentUser.department, currentUser.faculty, currentUser.level, currentUser.interests, userPresenceMap]);

  // Trigger at-most-once 24h discovery inactivity reminder for idle accounts
  const checkedInactivityRef = useRef<string | null>(null);
  useEffect(() => {
    if (!authUserId || !auth.user?.created_at || loadingUsers) return;
    if (checkedInactivityRef.current === authUserId) return;
    checkedInactivityRef.current = authUserId;
    const ageMs = Date.now() - new Date(auth.user.created_at).getTime();
    if (ageMs >= 24 * 60 * 60 * 1000 && friends.length === 0) {
      checkDiscoveryInactivityReminder(authUserId)
        .then(() => loadNotifications())
        .catch(() => {});
    }
  }, [authUserId, auth.user?.created_at, loadingUsers, friends.length]);

  const addToast = (message: string, type: 'success' | 'info' | 'warning' = 'info') => {
    const id = 'toast_' + Date.now() + Math.random().toString(36).substring(2, 6);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Initial-load flags so background refreshes/realtime updates never flash skeletons over rendered data
  const hasLoadedPostsRef = useRef<boolean>(false);
  const hasLoadedUsersRef = useRef<boolean>(false);
  const hasLoadedConversationsRef = useRef<boolean>(false);
  const hasLoadedNotificationsRef = useRef<boolean>(false);
  const lastFocusSyncAtRef = useRef<number>(0);

  // Data Loading from Supabase (via server-authoritative feed route)
  const loadPosts = useCallback(async () => {
    if (!hasLoadedPostsRef.current) {
      setLoadingPosts(true);
    }
    try {
      const result = await fetchFeedPostsPage(authUserId || undefined, { limit: 100 });
      setPosts(result.posts);
      setHasMorePosts(result.hasMore);
      nextPostsCursorRef.current = result.nextCursor;
      hasLoadedPostsRef.current = true;
    } finally {
      setLoadingPosts(false);
    }
  }, [authUserId]);

  const loadMorePosts = useCallback(async () => {
    const cursor = nextPostsCursorRef.current;
    if (loadingMorePosts || !hasMorePosts || !cursor) return;
    setLoadingMorePosts(true);
    try {
      const result = await fetchFeedPostsPage(authUserId || undefined, {
        limit: 100,
        before: cursor,
      });
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const appended = result.posts.filter((p) => !seen.has(p.id));
        return [...prev, ...appended];
      });
      setHasMorePosts(result.hasMore);
      nextPostsCursorRef.current = result.nextCursor;
    } finally {
      setLoadingMorePosts(false);
    }
  }, [authUserId, loadingMorePosts, hasMorePosts]);

  const loadUsersAndFriends = useCallback(async () => {
    if (!authUserId) return;
    if (!hasLoadedUsersRef.current) {
      setLoadingUsers(true);
    }

    try {
      const [friendshipData, blockData] = await Promise.all([
        fetchUserFriendships(authUserId),
        fetchUserBlocks(authUserId),
      ]);

      const friendIdSet = new Set(friendshipData.friends.map((f) => f.id));
      const sentIdSet = new Set(friendshipData.outgoingRequests.map((r) => r.user.id));
      const receivedIdSet = new Set(friendshipData.incomingRequests.map((r) => r.user.id));
      const blockedSet = new Set(blockData.allBlockedIds);
      setBlockedUserIds(blockedSet);

      // Build exclusion list for Discover query: self, accepted friends, pending sent, pending received, and blocked
      const excludeIds = Array.from(
        new Set([
          authUserId,
          ...Array.from(friendIdSet),
          ...Array.from(sentIdSet),
          ...Array.from(receivedIdSet),
          ...Array.from(blockedSet),
        ])
      );

      const discoverProfiles = await fetchAllProfiles(authUserId, 50, excludeIds);

      const decoratedDiscoverStudents: User[] = discoverProfiles.map((s) => ({
        ...s,
        relationshipState: 'none',
      }));

      const decoratedFriends: User[] = friendshipData.friends.map((f) => ({
        ...f,
        relationshipState: 'friends',
      }));

      setFriends(decoratedFriends);
      setUsers([...decoratedFriends, ...decoratedDiscoverStudents]);
      setFriendRequests([
        ...friendshipData.incomingRequests,
        ...friendshipData.outgoingRequests,
      ]);
      hasLoadedUsersRef.current = true;
    } finally {
      setLoadingUsers(false);
    }
  }, [authUserId]);

  const loadConversations = useCallback(async () => {
    if (!authUserId) return;
    if (!hasLoadedConversationsRef.current) {
      setLoadingConversations(true);
    }
    try {
      const loaded = await fetchUserConversations(authUserId);
      setConversations(loaded);
      hasLoadedConversationsRef.current = true;
    } finally {
      setLoadingConversations(false);
    }
  }, [authUserId]);

  const loadNotifications = useCallback(async () => {
    if (!authUserId) return;
    if (!hasLoadedNotificationsRef.current) {
      setLoadingNotifications(true);
    }
    try {
      const loaded = await fetchUserNotifications(authUserId);
      setNotifications(loaded);
      hasLoadedNotificationsRef.current = true;
    } finally {
      setLoadingNotifications(false);
    }
  }, [authUserId]);

  // Initial fetch when authenticated user ID changes
  useEffect(() => {
    if (authUserId) {
      hasLoadedPostsRef.current = false;
      hasLoadedUsersRef.current = false;
      hasLoadedConversationsRef.current = false;
      hasLoadedNotificationsRef.current = false;
      loadPosts();
      loadUsersAndFriends();
      loadConversations();
      loadNotifications();
    } else {
      hasLoadedPostsRef.current = false;
      hasLoadedUsersRef.current = false;
      hasLoadedConversationsRef.current = false;
      hasLoadedNotificationsRef.current = false;
      nextPostsCursorRef.current = null;
      setHasMorePosts(false);
      setPosts([]);
      setUsers([]);
      setFriendRequests([]);
      setConversations([]);
      setNotifications([]);
      setLoadingPosts(false);
      setLoadingUsers(false);
      setLoadingConversations(false);
      setLoadingNotifications(false);
    }
  }, [authUserId, loadPosts, loadUsersAndFriends, loadConversations, loadNotifications]);

  // Refresh posts cleanly when a new user finishes onboarding/profile setup into the app
  const prevAuthViewRef = useRef(auth.authView);
  useEffect(() => {
    const prevView = prevAuthViewRef.current;
    prevAuthViewRef.current = auth.authView;
    if (authUserId && auth.authView === 'app' && prevView !== 'app') {
      loadPosts();
      loadUsersAndFriends();
    }
  }, [auth.authView, authUserId, loadPosts, loadUsersAndFriends]);

  // Realtime Supabase Channel Subscriptions with Multi-Device Read Sync
  useEffect(() => {
    if (!authUserId) return;

    // Debounced posts loader so rapid reaction/comment/update bursts do not thrash Home feed
    let postDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    const triggerDebouncedPostLoad = () => {
      if (postDebounceTimer) clearTimeout(postDebounceTimer);
      postDebounceTimer = setTimeout(() => {
        loadPosts();
      }, 900);
    };

    // 1. Posts table changes
    const postChannel = supabase
      .channel('public:posts')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'posts' },
        () => {
          triggerDebouncedPostLoad();
        }
      )
      .subscribe();

    // Debounced conversation loader for rapid Realtime bursts (750ms reduces redundant heavy fetches)
    let convDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    const triggerDebouncedConvLoad = () => {
      if (convDebounceTimer) clearTimeout(convDebounceTimer);
      convDebounceTimer = setTimeout(() => {
        loadConversations();
      }, 750);
    };

    // 2. Messages table changes
    const msgChannel = supabase
      .channel('public:messages')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        () => {
          triggerDebouncedConvLoad();
        }
      )
      .subscribe();

    // 3. Conversation members changes (authoritative read-receipt & multi-device sync)
    const cmChannel = supabase
      .channel(`public:conversation_members:${authUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation_members',
          filter: `user_id=eq.${authUserId}`,
        },
        () => {
          triggerDebouncedConvLoad();
        }
      )
      .subscribe();

    // 4. Notifications table changes (INSERT, UPDATE, DELETE for live real-time sync across devices)
    const notifChannel = supabase
      .channel(`public:notifications:${authUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${authUserId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            playNotificationChime();
            const rec = payload.new as any;
            if (rec?.title || rec?.body) {
              addToast(`🔔 ${rec.title || 'ABSU Connect'}: ${rec.body}`, 'info');
            }
          }
          loadNotifications();
        }
      )
      .subscribe();

    // 5. Visibility and Window Focus Sync (throttled to prevent bursts on dialog/iframe clicks)
    const onWindowFocusOrVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastFocusSyncAtRef.current < 15000) return;
      lastFocusSyncAtRef.current = now;
      loadConversations();
      loadNotifications();
    };
    window.addEventListener('visibilitychange', onWindowFocusOrVisible);
    window.addEventListener('focus', onWindowFocusOrVisible);

    // 6. Resilient Polling: refresh notifications every 20s when tab is active
    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadNotifications();
      }
    }, 20000);

    return () => {
      if (postDebounceTimer) clearTimeout(postDebounceTimer);
      if (convDebounceTimer) clearTimeout(convDebounceTimer);
      supabase.removeChannel(postChannel);
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(cmChannel);
      supabase.removeChannel(notifChannel);
      window.removeEventListener('visibilitychange', onWindowFocusOrVisible);
      window.removeEventListener('focus', onWindowFocusOrVisible);
      clearInterval(intervalId);
    };
  }, [authUserId, loadPosts, loadConversations, loadNotifications]);

  // Tracking ref for deduplicating presence peer queries
  const lastPresenceFetchedKeyRef = useRef<string>('');

  // Presence Heartbeat: refresh every 45s while visible (Authenticated users only)
  useEffect(() => {
    if (!auth.user || auth.loading) {
      setUserPresenceMap({});
      return;
    }

    const userId = auth.user.id;
    updateMyPresence(userId);

    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        updateMyPresence(userId);
      }
    }, 45000);

    const onVis = () => {
      if (document.visibilityState === 'visible') {
        updateMyPresence(userId);
      }
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [auth.user?.id, auth.loading]);

  // Realtime Presence Channel (Authenticated session only)
  useEffect(() => {
    if (!auth.user || auth.loading) return;

    let presenceChan: ReturnType<typeof supabase.channel> | null = null;
    try {
      presenceChan = supabase
        .channel(`user_presence_${auth.user.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'user_presence' },
          (payload) => {
            const rec = payload.new as { user_id?: string; last_seen_at?: string };
            if (rec && rec.user_id && rec.last_seen_at) {
              setUserPresenceMap((prev) => ({
                ...prev,
                [rec.user_id!]: rec.last_seen_at!,
              }));
            }
          }
        )
        .subscribe();
    } catch {
      // quiet fallback
    }

    return () => {
      if (presenceChan) {
        supabase.removeChannel(presenceChan);
      }
    };
  }, [auth.user?.id, auth.loading]);

  // Fetch initial presences for visible peers (Authenticated users only)
  useEffect(() => {
    if (!auth.user || auth.loading) return;

    const ids = Array.from(
      new Set([
        ...users.map((u) => u.id),
        ...conversations.map((c) => c.participant?.id),
      ])
    ).filter(Boolean).sort();

    const idsKey = ids.join(',');
    if (ids.length === 0 || idsKey === lastPresenceFetchedKeyRef.current) {
      return;
    }
    lastPresenceFetchedKeyRef.current = idsKey;

    fetchPresences(ids).then((map) => {
      if (map && Object.keys(map).length > 0) {
        setUserPresenceMap((prev) => ({ ...prev, ...map }));
      }
    });
  }, [users, conversations, auth.user?.id, auth.loading]);

  // Post Actions (Connected to Real Backend)
  // Global Pull-to-Refresh across ABSU Connect
  const [isRefreshingScreen, setIsRefreshingScreen] = useState(false);
  const isRefreshingScreenRef = useRef(false);

  const refreshCurrentScreen = useCallback(async (): Promise<{ success: boolean; message: string }> => {
    if (isRefreshingScreenRef.current) {
      return { success: false, message: 'Refresh already in progress' };
    }
    isRefreshingScreenRef.current = true;
    setIsRefreshingScreen(true);
    const currentView = activeViewRef.current;
    try {
      if (currentView === 'home') {
        await Promise.all([loadPosts(), loadUsersAndFriends()]);
        return { success: true, message: 'Campus feed updated' };
      } else if (currentView === 'friends') {
        await loadUsersAndFriends();
        return { success: true, message: 'Friends & requests updated' };
      } else if (currentView === 'messages' || currentView === 'conversation') {
        await loadConversations();
        return { success: true, message: 'Messages refreshed' };
      } else if (currentView === 'alerts') {
        await loadNotifications();
        return { success: true, message: 'Notifications updated' };
      } else if (currentView === 'profile') {
        await Promise.all([refreshAuthProfileRef.current(), loadPosts()]);
        return { success: true, message: 'Profile updated' };
      } else if (currentView === 'user-profile') {
        await Promise.all([loadUsersAndFriends(), loadPosts()]);
        return { success: true, message: 'Student profile updated' };
      } else {
        await Promise.all([loadPosts(), loadNotifications()]);
        return { success: true, message: 'Data refreshed' };
      }
    } catch (err: unknown) {
      console.warn('[PullToRefresh] Error refreshing data:', err);
      return { success: false, message: 'Failed to refresh data' };
    } finally {
      isRefreshingScreenRef.current = false;
      setIsRefreshingScreen(false);
    }
  }, [loadPosts, loadUsersAndFriends, loadConversations, loadNotifications]);

  // Post Actions (Connected to Real Supabase Backend — Supabase Storage Only)
  const createPost = async (
    content: string,
    category: PostCategory,
    audience: PostAudience,
    mediaFileOrUrl?: File | string | Array<File | string>,
    callbacks?: { onProgress?: (step: string) => void; onError?: (error: string) => void }
  ): Promise<boolean> => {
    if (!auth.user) {
      const msg = 'Please sign in to publish posts.';
      callbacks?.onError?.(msg);
      addToast(msg, 'warning');
      return false;
    }

    if (userRestriction) {
      const msg =
        userRestriction.status === 'suspended'
          ? `Your account is temporarily suspended${userRestriction.restrictionReason ? `: ${userRestriction.restrictionReason}` : ''}. Posting is restricted.`
          : `Your account is disabled${userRestriction.restrictionReason ? `: ${userRestriction.restrictionReason}` : ''}.`;
      callbacks?.onError?.(msg);
      addToast(msg, 'warning');
      return false;
    }

    const rawItems: Array<File | string> = Array.isArray(mediaFileOrUrl)
      ? mediaFileOrUrl
      : mediaFileOrUrl
      ? [mediaFileOrUrl]
      : [];

    const mediaList: PostMediaAttachment[] = [];
    const uploadedStoragePaths: string[] = [];

    for (let i = 0; i < rawItems.length; i++) {
      const item = rawItems[i];
      let fileToUpload: File | null = null;

      if (item instanceof File) {
        fileToUpload = item;
      } else if (typeof item === 'string' && item.trim()) {
        // Convert campus preset or local asset URL to a File so ALL newly uploaded post media lives in Supabase Storage
        const trimmedUrl = item.trim();
        try {
          callbacks?.onProgress?.(`Preparing photo (${i + 1}/${rawItems.length})...`);
          const resp = await fetch(trimmedUrl);
          if (!resp.ok) {
            throw new Error(`Could not load selected campus preset image (${resp.status}).`);
          }
          const blob = await resp.blob();
          const ext = blob.type.includes('webp') ? 'webp' : blob.type.includes('png') ? 'png' : 'jpg';
          fileToUpload = new File([blob], `campus_photo_${i + 1}.${ext}`, {
            type: blob.type || 'image/webp',
            lastModified: Date.now(),
          });
        } catch (presetErr: unknown) {
          if (uploadedStoragePaths.length > 0) {
            await deletePostMediaFilesFromStorage(uploadedStoragePaths);
          }
          const msg = presetErr instanceof Error ? presetErr.message : 'Failed to prepare selected photo.';
          callbacks?.onError?.(msg);
          addToast(`${msg} Post was not published.`, 'warning');
          return false;
        }
      }

      if (fileToUpload) {
        const isVideo =
          fileToUpload.type.startsWith('video/') ||
          Boolean(fileToUpload.name.match(/\.(mp4|webm|mov|m4v|ogg)$/i));

        if (isVideo) {
          if (uploadedStoragePaths.length > 0) {
            await deletePostMediaFilesFromStorage(uploadedStoragePaths);
          }
          const msg = 'Video posting is currently disabled. Please choose photos only.';
          callbacks?.onError?.(msg);
          addToast(msg, 'warning');
          return false;
        }

        const stepMsg = `Uploading photo (${i + 1}/${rawItems.length}) to Supabase Storage...`;
        callbacks?.onProgress?.(stepMsg);
        addToast(stepMsg, 'info');

        const sbRes = await uploadPostMediaToSupabaseStorage(
          auth.user.id,
          fileToUpload,
          (status) => callbacks?.onProgress?.(`${status} (${i + 1}/${rawItems.length})`)
        );

        if (sbRes.success && sbRes.media) {
          uploadedStoragePaths.push(sbRes.media.asset_id);
          mediaList.push({
            secure_url: sbRes.media.secure_url,
            asset_id: sbRes.media.asset_id,
            format: sbRes.media.format,
            bytes: sbRes.media.bytes,
            width: sbRes.media.width,
            height: sbRes.media.height,
            kind: 'image',
            provider: 'supabase',
            position: i,
          });
        } else {
          // Clean up any media uploaded earlier in this batch so no orphaned files remain
          if (uploadedStoragePaths.length > 0) {
            await deletePostMediaFilesFromStorage(uploadedStoragePaths);
          }
          const finalErr = sbRes.error || 'Media upload to Supabase Storage failed.';
          console.error('[createPost Media Upload Error]', finalErr);
          callbacks?.onError?.(finalErr);
          addToast(`${finalErr} Post was not published.`, 'warning');
          return false;
        }
      }
    }

    callbacks?.onProgress?.('Saving post...');
    const visibility = audience === 'Friends Only' ? 'friends' : audience === 'Campus Only' ? 'campus' : 'public';
    const res = await createRealPost({
      authorId: auth.user.id,
      body: content,
      visibility,
      media: mediaList,
    });

    if (res.success && res.post) {
      setPosts((prev) => [res.post!, ...prev]);
      addToast('Post published to campus feed!', 'success');
      // Background sync to ensure reactions/relations are fresh
      loadPosts();
      return true;
    } else {
      const errMsg = res.error || 'Failed to publish post to database.';
      callbacks?.onError?.(errMsg);
      addToast(errMsg, 'warning');
      return false;
    }
  };

  const toggleLike = async (postId: string) => {
    if (!auth.user) {
      addToast('Sign in to like posts.', 'warning');
      return;
    }

    const targetPost = posts.find((p) => p.id === postId);
    const wasLiked = targetPost?.isLiked ?? false;

    // Optimistic UI update
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id === postId) {
          const isLiked = !p.isLiked;
          const likesCount = isLiked ? p.likesCount + 1 : Math.max(0, p.likesCount - 1);
          return { ...p, isLiked, likesCount };
        }
        return p;
      })
    );

    const res = await toggleRealPostReaction(postId, auth.user.id);
    if (!res.success) {
      addToast(res.error || 'Reaction could not be saved', 'warning');
      // Revert optimistic update
      setPosts((prev) =>
        prev.map((p) => {
          if (p.id === postId) {
            const isLiked = !p.isLiked;
            const likesCount = isLiked ? p.likesCount + 1 : Math.max(0, p.likesCount - 1);
            return { ...p, isLiked, likesCount };
          }
          return p;
        })
      );
    } else if (!wasLiked && targetPost && targetPost.author.id !== auth.user.id) {
      const isPagePost = Boolean(
        targetPost.pageId ||
        targetPost.isPagePost ||
        targetPost.author.id === MR_ANONYMOUS_PAGE_ID ||
        targetPost.author.name?.toLowerCase() === 'mr anonymous'
      );

      // Only dispatch individual student notification if target is a real peer (not a campus community page)
      if (!isPagePost) {
        const deepUrl = `/?view=post-detail&postId=${postId}`;
        createRealNotification({
          recipientId: targetPost.author.id,
          actorId: auth.user.id,
          type: 'like',
          entityType: 'post',
          entityId: postId,
          postId,
          senderName: currentUser.name,
          url: deepUrl,
        }).catch(() => {});

        sendPrivacySafePush({
          recipientId: targetPost.author.id,
          type: 'like',
          senderName: currentUser.name,
          url: deepUrl,
        }).catch(() => {});
      }
    }
  };

  const toggleSave = async (postId: string) => {
    const target = posts.find((p) => p.id === postId);
    const wasSaved = target?.isSaved ?? false;

    setPosts((prev) =>
      prev.map((post) => {
        if (post.id === postId) {
          const isSaved = !post.isSaved;
          addToast(isSaved ? 'Post bookmarked' : 'Removed from bookmarks', 'info');
          return { ...post, isSaved };
        }
        return post;
      })
    );

    if (!auth.user) return;
    const res = await toggleSavePostInDb(postId, auth.user.id, wasSaved);
    if (!res.success) {
      // Revert if persistence failed
      setPosts((prev) =>
        prev.map((post) => (post.id === postId ? { ...post, isSaved: wasSaved } : post))
      );
      if (res.error) addToast(res.error, 'warning');
    }
  };

  const addComment = async (postId: string, text: string, parentId?: string | null) => {
    if (!auth.user) {
      addToast('Sign in to comment.', 'warning');
      return;
    }

    const res = await createRealComment({
      postId,
      authorId: auth.user.id,
      body: text,
      parentId,
    });

    if (res.success && res.comment) {
      const createdComment = res.comment;

      setPosts((prev) =>
        prev.map((post) => {
          if (post.id === postId) {
            const nextCount = (post.commentsCount !== undefined ? post.commentsCount : post.comments.length) + 1;
            if (parentId) {
              return {
                ...post,
                commentsCount: nextCount,
                comments: post.comments.map((c) =>
                  c.id === parentId
                    ? { ...c, replies: [...(c.replies || []), createdComment] }
                    : c
                ),
              };
            }
            return {
              ...post,
              commentsCount: nextCount,
              comments: [...post.comments, createdComment],
            };
          }
          return post;
        })
      );
      addToast(parentId ? 'Reply published!' : 'Comment published!', 'success');

      // Dispatch privacy-safe notifications carrying exact post, comment, and parent comment IDs
      const cachedPost = posts.find((p) => p.id === postId);
      let postAuthorId: string | null = cachedPost?.author.id || null;
      let isPagePost = Boolean(
        cachedPost &&
          (cachedPost.pageId ||
            cachedPost.isPagePost ||
            cachedPost.author.id === MR_ANONYMOUS_PAGE_ID ||
            cachedPost.author.name?.toLowerCase() === 'mr anonymous')
      );

      // Resolve post metadata from Supabase if post wasn't in the cached feed slice
      if (!cachedPost) {
        try {
          const { data: postRow } = await supabase
            .from('posts')
            .select('author_id, page_id')
            .eq('id', postId)
            .maybeSingle();
          if (postRow) {
            postAuthorId = postRow.author_id || null;
            isPagePost = Boolean(postRow.page_id || postAuthorId === MR_ANONYMOUS_PAGE_ID);
          }
        } catch {}
      }

      // Resolve parent comment author when replying
      let parentAuthorId: string | null = null;
      if (parentId) {
        const findCommentAuthor = (list: typeof cachedPost extends undefined ? never : NonNullable<typeof cachedPost>['comments']): string | null => {
          for (const c of list) {
            if (c.id === parentId) return c.author.id;
            if (c.replies?.length) {
              const nested = findCommentAuthor(c.replies);
              if (nested) return nested;
            }
          }
          return null;
        };
        if (cachedPost?.comments?.length) {
          parentAuthorId = findCommentAuthor(cachedPost.comments);
        }
        if (!parentAuthorId) {
          try {
            const { data: parentRow } = await supabase
              .from('comments')
              .select('author_id')
              .eq('id', parentId)
              .maybeSingle();
            parentAuthorId = parentRow?.author_id || null;
          } catch {}
        }
      }

      const qs = new URLSearchParams({
        view: 'post-detail',
        postId,
        commentId: createdComment.id,
        openComments: '1',
      });
      if (parentId) qs.set('parentCommentId', parentId);
      const deepUrl = `/?${qs.toString()}`;

      // 1. Notify parent comment author if replying to someone else's comment
      if (parentId && parentAuthorId && parentAuthorId !== auth.user.id && parentAuthorId !== MR_ANONYMOUS_PAGE_ID) {
        createRealNotification({
          recipientId: parentAuthorId,
          actorId: auth.user.id,
          type: 'comment',
          entityType: 'comment_reply',
          entityId: createdComment.id,
          postId,
          commentId: createdComment.id,
          parentCommentId: parentId,
          body: 'replied to your comment.',
          senderName: currentUser.name,
          url: deepUrl,
        }).catch(() => {});

        sendPrivacySafePush({
          recipientId: parentAuthorId,
          type: 'comment',
          senderName: currentUser.name,
          url: deepUrl,
        }).catch(() => {});
      }

      // 2. Notify post author if different from actor and parent comment author (and not a community page)
      if (
        postAuthorId &&
        postAuthorId !== auth.user.id &&
        postAuthorId !== parentAuthorId &&
        !isPagePost
      ) {
        const postNotifEntityType = parentId ? 'comment_reply' : 'comment';
        createRealNotification({
          recipientId: postAuthorId,
          actorId: auth.user.id,
          type: 'comment',
          entityType: postNotifEntityType,
          entityId: createdComment.id,
          postId,
          commentId: createdComment.id,
          parentCommentId: parentId || undefined,
          body: parentId ? 'replied to a comment on your post.' : 'commented on your post.',
          senderName: currentUser.name,
          url: deepUrl,
        }).catch(() => {});

        sendPrivacySafePush({
          recipientId: postAuthorId,
          type: 'comment',
          senderName: currentUser.name,
          url: deepUrl,
        }).catch(() => {});
      }
    } else {
      addToast(res.error || 'Failed to post comment to database.', 'warning');
    }
  };

  const deletePost = async (postId: string) => {
    if (!auth.user) return;
    const res = await deleteRealPost(postId, auth.user.id);
    if (res.success) {
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      addToast('Post removed', 'info');
    } else {
      addToast(res.error || 'Failed to delete post from database.', 'warning');
    }
  };

  const hidePost = (postId: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    addToast('Post hidden from your feed', 'info');
  };

  const reportPost = async (postId: string, reason: string) => {
    if (!auth.user) {
      addToast('Sign in to report posts.', 'warning');
      return;
    }
    const res = await submitRealReport({
      reporterId: auth.user.id,
      targetId: postId,
      targetType: 'post',
      reason,
    });
    if (res.success) {
      addToast(`Report received: "${reason}". Thank you for keeping ABSU safe.`, 'warning');
    } else {
      addToast(res.error || 'Failed to submit report', 'warning');
    }
  };

  // User & Friend actions
  const updateCurrentUser = async (updated: Partial<User>) => {
    setCurrentUser((prev) => ({ ...prev, ...updated }));
    if (auth.user) {
      safeStorage.setItem(`absu_onboarding_${auth.user.id}`, 'completed');
      safeStorage.setItem(`absu_user_onboarded_${auth.user.id}`, 'true');

      const res = await saveProfileToSupabase(auth.user.id, {
        fullName: updated.name,
        department: updated.department,
        faculty: updated.faculty,
        level: updated.level,
        campus: updated.campus,
        bio: updated.bio,
        avatarUrl: updated.avatar,
        avatarAssetId: updated.avatarAssetId,
      });
      if (res.success) {
        addToast('Profile updated in Supabase', 'success');
        auth.refreshProfile();
      } else {
        addToast(res.error || 'Failed to update profile.', 'warning');
      }
    }
  };

  const sendFriendRequest = async (userId: string) => {
    if (!auth.user) {
      addToast('Sign in to send friend requests.', 'warning');
      return;
    }
    if (inFlightFriendRequests.has(userId)) return;

    setInFlightFriendRequests((prev) => new Set(prev).add(userId));
    try {
      const targetUser = users.find((u) => u.id === userId);
      const res = await sendRealFriendRequest(auth.user.id, userId);

      if (res.success) {
        // Create real database notification
        createRealNotification({
          recipientId: userId,
          actorId: auth.user.id,
          type: 'friend_request',
          entityType: 'friend_request',
          entityId: res.friendshipId,
        }).catch(() => {});

        // Trigger real privacy-safe push notification
        sendPrivacySafePush({
          recipientId: userId,
          type: 'friend_request',
          senderName: currentUser.name,
          url: '/?view=friends',
        }).catch(() => {});

        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, relationshipState: 'request_sent' } : u))
        );
        if (targetUser) {
          const newReq: FriendRequest = {
            id: res.friendshipId || ('req_' + Date.now()),
            user: { ...targetUser, relationshipState: 'request_sent' },
            createdAt: 'Just now',
            mutualCount: 0,
            type: 'sent',
          };
          setFriendRequests((prev) => [newReq, ...prev]);
        }
        addToast(`Friend request sent to ${targetUser?.name || 'student'}`, 'success');
      } else {
        addToast(res.error || 'Failed to send friend request.', 'warning');
      }
    } finally {
      setInFlightFriendRequests((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  };

  const blockUser = async (userId: string): Promise<boolean> => {
    if (!auth.user) {
      addToast('Please sign in first', 'warning');
      return false;
    }
    const res = await blockRealUser({ blockerId: auth.user.id, blockedId: userId });
    if (res.success) {
      setBlockedUserIds((prev) => new Set(prev).add(userId));
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      setFriends((prev) => prev.filter((u) => u.id !== userId));
      const targetConv = conversations.find((c) => c.participant.id === userId);
      if (targetConv) {
        hideConversationForUser(auth.user.id, targetConv.id);
        setConversations((prev) => prev.filter((c) => c.id !== targetConv.id));
      }
      addToast('User blocked', 'info');
      return true;
    } else {
      addToast(res.error || 'Failed to block user', 'warning');
      return false;
    }
  };

  const unblockUser = async (userId: string): Promise<boolean> => {
    if (!auth.user) return false;
    const res = await unblockRealUser({ blockerId: auth.user.id, blockedId: userId });
    if (res.success) {
      setBlockedUserIds((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
      addToast('User unblocked', 'info');
      loadUsersAndFriends();
      return true;
    } else {
      addToast(res.error || 'Failed to unblock user', 'warning');
      return false;
    }
  };

  const toggleMuteConversation = (convId: string) => {
    if (!auth.user) return;
    const isMuted = toggleMuteConversationForUser(auth.user.id, convId);
    setMutedConvIds(getMutedConversationIds(auth.user.id));
    addToast(isMuted ? 'Conversation muted' : 'Conversation unmuted', 'info');
  };

  const isConversationMuted = (convId: string): boolean => {
    return mutedConvIds.has(convId);
  };

  const deleteConversationForMe = async (convId: string) => {
    if (!auth.user) return;
    hideConversationForUser(auth.user.id, convId);
    setConversations((prev) => prev.filter((c) => c.id !== convId));
    if (selectedConversationId === convId) {
      setSelectedConversationId(null);
      navigateTo('messages');
    }
    addToast('Conversation deleted for you', 'info');
  };

  const markConversationUnread = (convId: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === convId ? { ...c, unreadCount: Math.max(c.unreadCount, 1) } : c))
    );
    addToast('Marked as unread', 'info');
  };

  const cancelFriendRequest = async (userId: string) => {
    const req = friendRequests.find((r) => r.user.id === userId && r.type === 'sent');
    if (req) {
      await declineOrCancelFriendRequest(req.id);
    }
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, relationshipState: 'none' } : u))
    );
    setFriendRequests((prev) => prev.filter((r) => r.user.id !== userId));
    addToast('Friend request cancelled', 'info');
  };

  const acceptFriendRequest = async (requestId: string) => {
    const req = friendRequests.find((r) => r.id === requestId);
    if (!req || !auth.user) return;

    const res = await acceptRealFriendRequest(requestId);
    if (res.success) {
      // Create real database notification
      createRealNotification({
        recipientId: req.user.id,
        actorId: auth.user.id,
        type: 'friend_accept',
        entityType: 'friend_accepted',
        entityId: requestId,
      }).catch(() => {});

      // Trigger real privacy-safe push notification to requester
      sendPrivacySafePush({
        recipientId: req.user.id,
        type: 'friend_accept',
        senderName: currentUser.name,
        url: `/?view=user-profile&userId=${auth.user?.id}`,
      }).catch(() => {});

      setUsers((prev) =>
        prev.map((u) => (u.id === req.user.id ? { ...u, relationshipState: 'friends' } : u))
      );
      setFriendRequests((prev) => prev.filter((r) => r.id !== requestId));
      addToast(`Connected with ${req.user.name} as friends!`, 'success');
      loadUsersAndFriends();
    } else {
      addToast(res.error || 'Failed to accept friend request.', 'warning');
    }
  };

  const declineFriendRequest = async (requestId: string) => {
    const req = friendRequests.find((r) => r.id === requestId);
    if (!req) return;

    await declineOrCancelFriendRequest(requestId);
    setFriendRequests((prev) => prev.filter((r) => r.id !== requestId));
    setUsers((prev) =>
      prev.map((u) => (u.id === req.user.id ? { ...u, relationshipState: 'none' } : u))
    );
    addToast('Friend request declined', 'info');
  };

  const removeFriend = async (userId: string) => {
    if (!auth.user) return;
    await removeRealFriend(auth.user.id, userId);
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, relationshipState: 'none' } : u))
    );
    addToast('Friend removed', 'info');
  };

  // Messaging actions
  const sendMessage = async (convId: string, text?: string, files?: File[]): Promise<boolean> => {
    const trimmed = (text || '').trim();
    if (!trimmed && (!files || files.length === 0)) return false;
    if (!auth.user) {
      addToast('Please sign in to send messages.', 'warning');
      return false;
    }

    if (files && files.length > 0) {
      addToast(`Uploading ${files.length} attachment${files.length > 1 ? 's' : ''}...`, 'info');
    }

    const res = await sendRealMessage({
      conversationId: convId,
      senderId: auth.user.id,
      text: trimmed,
      files,
      senderName: currentUser.name,
    });

    if (res.success && res.message) {
      const newMsg = res.message;

      // Note: createOrUpdateConversationNotification and Android push dispatch
      // are executed authoritatively inside sendRealMessage, ensuring exactly one push dispatch per message.
      const targetConv = conversations.find((c) => c.id === convId);
      if (targetConv?.participant?.id && targetConv.participant.id !== auth.user.id) {
        sendPrivacySafePush({
          recipientId: targetConv.participant.id,
          type: 'message',
          senderName: currentUser.name,
          url: `/?view=conversation&convId=${convId}`,
        }).catch(() => {});
      }

      setConversations((prev) =>
        prev.map((c) => {
          if (c.id === convId) {
            const previewText = newMsg.text || (newMsg.attachments?.length ? '📎 Attachment' : 'Message');
            return {
              ...c,
              lastMessage: previewText,
              lastMessageTime: 'Just now',
              messages: [...c.messages, newMsg],
            };
          }
          return c;
        })
      );
      return true;
    } else {
      addToast(res.error || 'Failed to deliver message.', 'warning');
      return false;
    }
  };

  const startConversationWithUser = async (user: User) => {
    if (!auth.user) {
      addToast('Sign in to message students.', 'warning');
      return;
    }

    const res = await getOrCreateDirectConversation(auth.user.id, user);
    if (res.success && res.conversation) {
      const conv = res.conversation;
      setConversations((prev) => {
        const exists = prev.some((c) => c.id === conv.id);
        return exists ? prev : [conv, ...prev];
      });
      setSelectedConversationId(conv.id);
      navigateTo('conversation', { convId: conv.id });
    } else {
      addToast(res.error || 'Failed to open conversation.', 'warning');
    }
  };

  // Notifications actions
  const markNotificationAsRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
    await markRealNotificationAsRead(id);
  };

  const markAllNotificationsAsRead = async () => {
    if (!auth.user) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    await markAllRealNotificationsAsRead(auth.user.id);
    addToast('All notifications marked as read', 'info');
  };

  // Derived values
  const unreadNotificationsCount = calculateUnreadCount(notifications);
  const unreadMessagesCount = conversations.reduce((acc, c) => acc + c.unreadCount, 0);

  const selectedUser = selectedUserId
    ? (users.find((u) => u.id === selectedUserId) ||
       (currentUser.id === selectedUserId ? currentUser : null) ||
       posts.find((p) => p.author.id === selectedUserId)?.author ||
       conversations.find((c) => c.participant?.id === selectedUserId)?.participant ||
       null)
    : null;

  // Auto-fetch profile for selected user if not yet in users state
  useEffect(() => {
    if (!selectedUserId || selectedUserId === currentUser.id) return;
    if (!users.some((u) => u.id === selectedUserId)) {
      fetchProfileById(selectedUserId).then((prof) => {
        if (prof) {
          setUsers((prev) => {
            if (prev.some((u) => u.id === prof.id)) return prev;
            return [...prev, prof];
          });
        }
      });
    }
  }, [selectedUserId, currentUser.id, users]);

  const selectedConversation = selectedConversationId
    ? (conversations.find((c) => c.id === selectedConversationId) || null)
    : null;

  const markConversationRead = useCallback(
    async (convId: string) => {
      if (!convId || !auth.user) return;

      let participantId: string | undefined;

      // 1. Immediately update conversation unread count in React state safely without recreating array if already 0
      setConversations((prev) => {
        let changed = false;
        const next = prev.map((c) => {
          if (c.id === convId) {
            participantId = c.participant?.id;
            if (c.unreadCount > 0) {
              changed = true;
              return { ...c, unreadCount: 0 };
            }
          }
          return c;
        });
        return changed ? next : prev;
      });

      // 2. Immediately mark all associated message notifications as read in React state
      setNotifications((prev) => {
        let notifChanged = false;
        const next = prev.map((n) => {
          const isRelatedMessageAlert =
            !n.isRead &&
            n.type === 'message' &&
            ((n.conversationId && n.conversationId === convId) ||
              (participantId && n.actor?.id === participantId));
          if (isRelatedMessageAlert) {
            notifChanged = true;
            return { ...n, isRead: true };
          }
          return n;
        });
        return notifChanged ? next : prev;
      });

      // 3. Update Supabase database and server resolution route
      await markConversationAsRead(convId, auth.user.id, participantId);
    },
    [auth.user?.id]
  );

  const isUserOnline = useCallback(
    (userId: string): boolean => {
      if (!userId) return false;
      return isOnlineTimestamp(userPresenceMap[userId]);
    },
    [userPresenceMap]
  );

  return (
    <AppContext.Provider
      value={{
        theme,
        resolvedTheme,
        setTheme,
        toggleTheme,
        activeTab,
        activeView,
        setActiveTab,
        navigateTo,
        goBack,
        currentUser,
        updateCurrentUser,
        selectedUserId,
        selectedUser,
        selectedCommunityId,
        setSelectedCommunityId,
        selectedEventId,
        setSelectedEventId,
        selectedPostId,
        selectedPostNavContext,
        posts,
        loadingPosts,
        loadingMorePosts,
        hasMorePosts,
        loadMorePosts,
        refreshPosts: loadPosts,
        feedFilter,
        setFeedFilter,
        createPost,
        toggleLike,
        toggleSave,
        addComment,
        deletePost,
        hidePost,
        reportPost,
        users,
        friends,
        discoverUsers,
        loadingUsers,
        friendRequests,
        friendTab,
        setFriendTab,
        sendFriendRequest,
        cancelFriendRequest,
        acceptFriendRequest,
        declineFriendRequest,
        removeFriend,
        refreshFriends: loadUsersAndFriends,
        // Moderation & Blocks
        blockedUserIds,
        blockUser,
        unblockUser,
        // Conversations
        conversations,
        loadingConversations,
        selectedConversationId,
        selectedConversation,
        sendMessage,
        startConversationWithUser,
        refreshConversations: loadConversations,
        markConversationRead,
        markConversationUnread,
        toggleMuteConversation,
        isConversationMuted,
        deleteConversationForMe,
        userPresenceMap,
        isUserOnline,
        notifications,
        loadingNotifications,
        refreshNotifications: loadNotifications,
        markNotificationAsRead,
        markAllNotificationsAsRead,
        unreadNotificationsCount,
        unreadMessagesCount,
        notificationPromptOpen,
        setNotificationPromptOpen,
        openNotificationPrompt,
        createPostModalOpen,
        setCreatePostModalOpen,
        openCreatePostWithMedia,
        initialPostMedia,
        clearInitialPostMedia,
        editProfileModalOpen,
        setEditProfileModalOpen,
        searchOpen,
        setSearchOpen,
        imageLightboxUrl,
        setImageLightboxUrl,
        toasts,
        addToast,
        removeToast,
        isRefreshingScreen,
        refreshCurrentScreen,
        // Super Admin & Platform Control
        isSuperAdmin,
        adminViewOpen,
        openAdminDashboard,
        closeAdminDashboard,
        platformBanner,
        userRestriction,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
