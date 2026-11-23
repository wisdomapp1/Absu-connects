import { supabase } from './supabase.ts';
import type { NotificationItem, NotificationType } from '../types/index.ts';
import { mapProfileRowToUser, SupabaseProfileRow } from './profileService.ts';
import { formatTimeAgo } from './postService.ts';
import { MR_ANONYMOUS_PAGE_ID } from './pageService.ts';
import { dispatchAndroidPush } from './nativePushService.ts';

/**
 * Returns privacy-safe action text for the notification.
 * Strictly never includes message bodies, excerpts, or private attachment details.
 */
export function getPrivacySafeNotificationText(
  type: NotificationType,
  entityType?: string | null
): string {
  const cleanEntity = (entityType || '').toLowerCase().trim();
  if (cleanEntity === 'comment_reply') {
    return 'replied to your comment.';
  }
  if (cleanEntity === 'comment_reaction') {
    return 'liked your comment.';
  }

  switch (type) {
    case 'message':
      return 'sent you a message.';
    case 'story_comment':
      return 'replied to your story.';
    case 'story_reaction':
    case 'story_like':
      return 'reacted to your story.';
    case 'story_view':
      return 'viewed your story.';
    case 'friend_request':
      return 'sent you a friend request.';
    case 'friend_accept':
      return 'accepted your friend request.';
    case 'comment':
      return 'commented on your post.';
    case 'like':
      return 'liked your post.';
    case 'mention':
      return 'mentioned you in a post.';
    case 'campus_notice':
      return 'published a campus announcement.';
    case 'game_invitation':
      return 'invited you to play a game.';
    case 'welcome_discovery':
      return 'Explore Discover in Friend Navigator to meet classmates across ABSU.';
    case 'discovery_suggestion':
      return 'New classmates matching your department are on ABSU Connect.';
    case 'discovery_reminder':
      return 'Tap here to discover ABSU peers and start building your campus network.';
    case 'community_post':
      return 'shared a new post in your community.';
    case 'event_reminder':
      return 'upcoming campus event reminder.';
    default:
      return 'interacted with you on ABSU Connect.';
  }
}

export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function isValidUuid(id?: string | null): boolean {
  if (!id) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id.trim());
}

async function getAuthHeaders(includeJson = true): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (includeJson) headers['Content-Type'] = 'application/json';
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  } catch {
    // ignore
  }
  return headers;
}

/**
 * Maps frontend TypeScript NotificationType to PostgreSQL notification_type enum in Supabase.
 */
export function mapAppTypeToDbEnum(type: NotificationType): string {
  switch (type) {
    case 'like':
      return 'reaction';
    case 'friend_accept':
      return 'friend_accepted';
    case 'campus_notice':
      return 'announcement';
    case 'game_invitation':
      return 'game_invite';
    case 'welcome_discovery':
    case 'discovery_suggestion':
    case 'discovery_reminder':
      return 'system';
    default:
      return type;
  }
}

/**
 * Maps database notification_type enum + entity_type string to frontend TypeScript NotificationType.
 */
export function mapDbEnumToAppType(rawType: string, entityType?: string | null): NotificationType {
  const cleanEntity = (entityType || '').toLowerCase().trim();
  const clean = (rawType || '').toLowerCase().trim();

  // Check Story notification types FIRST before generic comment/reaction checks
  if (clean === 'story_comment' || cleanEntity === 'story_comment') return 'story_comment';
  if (clean === 'story_reaction' || cleanEntity === 'story_reaction') return 'story_reaction';
  if (clean === 'story_like' || cleanEntity === 'story_like') return 'story_like';
  if (clean === 'story_view' || cleanEntity === 'story_view') return 'story_view';
  if (cleanEntity === 'story') {
    if (clean.includes('comment') || clean.includes('reply')) return 'story_comment';
    if (clean.includes('react') || clean.includes('like')) return 'story_reaction';
    if (clean.includes('view')) return 'story_view';
  }

  if (cleanEntity === 'discovery_welcome') return 'welcome_discovery';
  if (cleanEntity === 'discovery_suggestion') return 'discovery_suggestion';
  if (cleanEntity === 'discovery_reminder') return 'discovery_reminder';

  if (clean === 'welcome_discovery') return 'welcome_discovery';
  if (clean === 'discovery_suggestion') return 'discovery_suggestion';
  if (clean === 'discovery_reminder') return 'discovery_reminder';
  if (clean === 'community_post') return 'community_post';
  if (clean === 'event_reminder') return 'event_reminder';
  if (clean === 'event_update') return 'event_update';
  if (clean === 'community_invite') return 'community_invite';
  if (clean === 'community_approved') return 'community_approved';
  if (clean === 'community_rejected') return 'community_rejected';
  if (clean.includes('message') || clean.includes('chat') || clean.includes('dm')) {
    return 'message';
  }
  if (clean === 'friend_accepted' || (clean.includes('friend') && clean.includes('accept'))) {
    return 'friend_accept';
  }
  if (clean.includes('friend') || clean.includes('request')) {
    return 'friend_request';
  }
  if (clean === 'reaction' || clean.includes('like')) {
    return 'like';
  }
  if (clean.includes('comment')) {
    return 'comment';
  }
  if (clean.includes('mention')) {
    return 'mention';
  }
  if (clean === 'announcement' || clean.includes('campus') || clean.includes('notice')) {
    return 'campus_notice';
  }
  if (clean === 'game_invite' || clean.includes('game')) {
    return 'game_invitation';
  }
  return 'campus_notice';
}

async function parseApiJson(res: Response | null): Promise<any | null> {
  if (!res) return null;
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (!ct.includes('application/json')) return null;
  return await res.json().catch(() => null);
}

/**
 * Fetch notifications for current user with strict privacy protection.
 * - Uses server endpoint (with service-role bypass) first when mounted.
 * - Falls back cleanly on static hosts (Vercel / Capacitor APK) with full actor profile hydration,
 *   comment/reply target resolution (including legacy entity_type='post' comment alerts),
 *   and conversation lookup for message notifications.
 */
export async function fetchUserNotifications(
  currentUserId: string,
  filter: 'all' | 'recent' | 'archived' = 'all'
): Promise<NotificationItem[]> {
  if (!currentUserId) return [];

  try {
    let rawRows: any[] = [];

    // 1. Try server endpoint first (guaranteed admin access without RLS restrictions)
    try {
      const headers = await getAuthHeaders(false);
      const serverRes = await fetch(`/api/notifications/user/${encodeURIComponent(currentUserId)}`, {
        headers,
      });
      const json = serverRes.ok ? await parseApiJson(serverRes) : null;
      if (json?.success && Array.isArray(json.notifications)) {
        rawRows = json.notifications;
      }
    } catch {
      // Server fetch failed or unavailable on Vercel, fallback to client Supabase query below
    }

    // 2. Fallback to direct Supabase query with full profile, comment, and message hydration
    const fallbackCommentMetaMap = new Map<
      string,
      { id: string; post_id: string; parent_comment_id: string | null }
    >();
    const legacyPostActorCommentMap = new Map<
      string,
      { id: string; post_id: string; parent_comment_id: string | null }
    >();
    const messageConvMap = new Map<string, string>();
    const storyCommentConvMap = new Map<string, string>();
    const actorProfileMap = new Map<string, SupabaseProfileRow>();

    if (rawRows.length === 0) {
      try {
        const { data: supaRows, error: supaErr } = await supabase
          .from('notifications')
          .select('*')
          .eq('recipient_id', currentUserId)
          .order('created_at', { ascending: false })
          .limit(100);

        if (supaErr) {
          console.error('[Notifications] Supabase notifications fetch error:', {
            code: supaErr.code,
            message: supaErr.message,
            details: supaErr.details,
            hint: supaErr.hint,
          });
        }

        if (!supaErr && supaRows) {
          rawRows = supaRows;

          const actorIds = Array.from(
            new Set(rawRows.map((r: any) => r.actor_id).filter((id: any) => isValidUuid(id)))
          );

          const commentIdsToResolve = Array.from(
            new Set([
              ...rawRows
                .filter((r: any) => {
                  const mapped = mapDbEnumToAppType(r.type || '', r.entity_type);
                  return (
                    mapped !== 'story_comment' &&
                    mapped !== 'story_reaction' &&
                    mapped !== 'story_view' &&
                    mapped !== 'story_like' &&
                    isValidUuid(r.comment_id)
                  );
                })
                .map((r: any) => r.comment_id),
              ...rawRows
                .filter((r: any) => {
                  const et = String(r.entity_type || '').toLowerCase();
                  return (
                    (et === 'comment' || et === 'comment_reply' || et === 'comment_reaction') &&
                    isValidUuid(r.entity_id)
                  );
                })
                .map((r: any) => r.entity_id),
            ])
          );

          const legacyCommentPostIds = Array.from(
            new Set(
              rawRows
                .filter(
                  (r: any) =>
                    !isValidUuid(r.comment_id) &&
                    !String(r.type || '').toLowerCase().startsWith('story_') &&
                    String(r.type || '').toLowerCase().includes('comment') &&
                    String(r.entity_type || '').toLowerCase() === 'post' &&
                    isValidUuid(r.entity_id)
                )
                .map((r: any) => r.entity_id)
            )
          );

          const messageIdsToResolve = Array.from(
            new Set(
              rawRows
                .filter(
                  (r: any) =>
                    String(r.entity_type || '').toLowerCase() === 'message' &&
                    isValidUuid(r.entity_id)
                )
                .map((r: any) => r.entity_id)
            )
          );

          const storyCommentStoryIds = Array.from(
            new Set(
              rawRows
                .filter((r: any) => {
                  const mapped = mapDbEnumToAppType(r.type || '', r.entity_type);
                  return (
                    mapped === 'story_comment' &&
                    isValidUuid(r.story_id || r.entity_id)
                  );
                })
                .map((r: any) => (isValidUuid(r.story_id) ? r.story_id : r.entity_id))
            )
          );

          const [profilesRes, commentRowsRes, legacyCommentsRes, messageRowsRes, storyCommentsRes] = await Promise.all([
            actorIds.length > 0
              ? supabase.from('profiles').select('*').in('id', actorIds)
              : Promise.resolve({ data: null }),
            commentIdsToResolve.length > 0
              ? supabase
                  .from('comments')
                  .select('id, post_id, parent_comment_id')
                  .in('id', commentIdsToResolve)
              : Promise.resolve({ data: null }),
            legacyCommentPostIds.length > 0
              ? supabase
                  .from('comments')
                  .select('id, post_id, author_id, parent_comment_id, created_at')
                  .in('post_id', legacyCommentPostIds)
                  .order('created_at', { ascending: false })
              : Promise.resolve({ data: null }),
            messageIdsToResolve.length > 0
              ? supabase
                  .from('messages')
                  .select('id, conversation_id')
                  .in('id', messageIdsToResolve)
              : Promise.resolve({ data: null }),
            storyCommentStoryIds.length > 0
              ? supabase
                  .from('story_comments')
                  .select('story_id, commenter_id, story_owner_id, conversation_id, created_at')
                  .in('story_id', storyCommentStoryIds)
                  .order('created_at', { ascending: false })
                  .then((r) => r, () => ({ data: null }))
              : Promise.resolve({ data: null }),
          ]);

          if ((commentRowsRes as any)?.error) {
            console.error('[Notifications] comment lookup error:', (commentRowsRes as any).error);
          }
          if ((legacyCommentsRes as any)?.error) {
            console.error('[Notifications] legacy comment lookup error:', (legacyCommentsRes as any).error);
          }
          if ((messageRowsRes as any)?.error) {
            console.error('[Notifications] message lookup error:', (messageRowsRes as any).error);
          }

          for (const p of (profilesRes.data || []) as SupabaseProfileRow[]) {
            actorProfileMap.set(p.id, p);
          }

          for (const c of (commentRowsRes.data || []) as Array<{
            id: string;
            post_id: string;
            parent_comment_id: string | null;
          }>) {
            fallbackCommentMetaMap.set(c.id, c);
          }

          for (const lc of (legacyCommentsRes.data || []) as Array<{
            id: string;
            post_id: string;
            author_id: string;
            parent_comment_id: string | null;
          }>) {
            const key = `${lc.post_id}_${lc.author_id}`;
            if (!legacyPostActorCommentMap.has(key)) {
              legacyPostActorCommentMap.set(key, {
                id: lc.id,
                post_id: lc.post_id,
                parent_comment_id: lc.parent_comment_id,
              });
            }
          }

          for (const msg of (messageRowsRes.data || []) as Array<{
            id: string;
            conversation_id: string;
          }>) {
            if (msg.id && msg.conversation_id) {
              messageConvMap.set(msg.id, msg.conversation_id);
            }
          }

          for (const sc of ((storyCommentsRes as any)?.data || []) as Array<{
            story_id?: string;
            commenter_id?: string;
            conversation_id?: string;
          }>) {
            if (sc.story_id && sc.conversation_id) {
              if (sc.commenter_id && !storyCommentConvMap.has(`${sc.story_id}_${sc.commenter_id}`)) {
                storyCommentConvMap.set(`${sc.story_id}_${sc.commenter_id}`, sc.conversation_id);
              }
              if (!storyCommentConvMap.has(sc.story_id)) {
                storyCommentConvMap.set(sc.story_id, sc.conversation_id);
              }
            }
          }
        }
      } catch (err) {
        console.warn('[Notifications] Supabase direct query note:', err);
      }
    }

    const now = Date.now();
    const rawList: NotificationItem[] = [];

    for (const row of rawRows) {
      const notifType: NotificationType = mapDbEnumToAppType(row.type || '', row.entity_type);
      const isStoryNotif =
        notifType === 'story_comment' ||
        notifType === 'story_reaction' ||
        notifType === 'story_view' ||
        notifType === 'story_like';
      const isDiscoverySystem =
        notifType === 'welcome_discovery' ||
        notifType === 'discovery_suggestion' ||
        notifType === 'discovery_reminder';

      const resolvedActorProfile =
        (row.actor as SupabaseProfileRow | undefined) ||
        (row.actor_id ? actorProfileMap.get(row.actor_id) : undefined);

      const actorUser =
        isDiscoverySystem
          ? {
              id: 'system',
              name: 'ABSU Connect Discovery',
              avatar: `https://api.dicebear.com/7.x/initials/svg?seed=AC&backgroundColor=7c3aed&textColor=ffffff`,
            }
          : resolvedActorProfile
          ? mapProfileRowToUser(resolvedActorProfile)
          : {
              id: row.actor_id || 'system',
              name: row.actor_id === currentUserId ? 'ABSU Connect' : 'ABSU Student',
              avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(row.actor_id || 'ABSU')}&backgroundColor=6d45d9&textColor=ffffff`,
              handle: '@student',
              department: 'Notice Board',
              faculty: 'Abia State University',
              level: 'Campus',
              campus: 'Uturu',
              bio: '',
              interests: [],
              relationshipState: 'none' as const,
            };

      const maxLen = isDiscoverySystem ? 280 : 120;
      const safeAction =
        row.body && row.body.length <= maxLen
          ? row.body
          : getPrivacySafeNotificationText(notifType, row.entity_type);
      const createdTime = row.created_at ? new Date(row.created_at).getTime() : now;
      const isArchived = (now - createdTime) >= SEVEN_DAYS_MS;

      // Filter handling
      if (filter === 'recent' && isArchived) continue;
      if (filter === 'archived' && !isArchived) continue;

      const cleanEntityType = String(row.entity_type || '').toLowerCase();
      let convId: string | undefined = isValidUuid(row.conversation_id)
        ? row.conversation_id
        : undefined;
      if (!convId && notifType === 'message') {
        if (cleanEntityType === 'conversation' && row.entity_id) {
          convId = row.entity_id;
        } else if (cleanEntityType === 'message' && row.entity_id && messageConvMap.has(row.entity_id)) {
          convId = messageConvMap.get(row.entity_id);
        }
      }

      let resolvedStoryId: string | undefined = undefined;
      let resolvedCommentId: string | undefined = undefined;
      let resolvedParentCommentId: string | undefined = undefined;
      let resolvedPostId: string | undefined = undefined;

      if (isStoryNotif) {
        resolvedStoryId = isValidUuid(row.story_id)
          ? row.story_id
          : isValidUuid(row.entity_id)
          ? row.entity_id
          : undefined;
        if (notifType === 'story_comment' && !convId && resolvedStoryId) {
          convId =
            (isValidUuid(row.actor_id) &&
              storyCommentConvMap.get(`${resolvedStoryId}_${row.actor_id}`)) ||
            storyCommentConvMap.get(resolvedStoryId);
        }
      } else {
        resolvedCommentId = isValidUuid(row.comment_id) ? row.comment_id : undefined;
        resolvedParentCommentId = isValidUuid(row.parent_comment_id)
          ? row.parent_comment_id
          : undefined;
        resolvedPostId = isValidUuid(row.post_id) ? row.post_id : undefined;

        if (
          !resolvedCommentId &&
          (cleanEntityType === 'comment' ||
            cleanEntityType === 'comment_reply' ||
            cleanEntityType === 'comment_reaction') &&
          isValidUuid(row.entity_id)
        ) {
          if (cleanEntityType !== 'comment' || fallbackCommentMetaMap.has(row.entity_id)) {
            resolvedCommentId = row.entity_id;
          }
        }

        if (resolvedCommentId && fallbackCommentMetaMap.has(resolvedCommentId)) {
          const meta = fallbackCommentMetaMap.get(resolvedCommentId)!;
          if (!resolvedPostId && isValidUuid(meta.post_id)) {
            resolvedPostId = meta.post_id;
          }
          if (!resolvedParentCommentId && meta.parent_comment_id && isValidUuid(meta.parent_comment_id)) {
            resolvedParentCommentId = meta.parent_comment_id;
          }
        }

        if (!resolvedPostId && cleanEntityType === 'post' && isValidUuid(row.entity_id)) {
          resolvedPostId = row.entity_id;
        }

        if (
          !resolvedCommentId &&
          notifType === 'comment' &&
          resolvedPostId &&
          isValidUuid(row.actor_id)
        ) {
          const legacyMatch = legacyPostActorCommentMap.get(`${resolvedPostId}_${row.actor_id}`);
          if (legacyMatch) {
            resolvedCommentId = legacyMatch.id;
            if (!resolvedParentCommentId && legacyMatch.parent_comment_id) {
              resolvedParentCommentId = legacyMatch.parent_comment_id;
            }
          }
        }
      }

      rawList.push({
        id: row.id,
        type: notifType,
        rawType: row.type || undefined,
        title: row.title || undefined,
        entityType: row.entity_type || undefined,
        entityId: row.entity_id || undefined,
        actor: {
          id: actorUser.id,
          name: actorUser.name,
          avatar: actorUser.avatar,
        },
        content: safeAction,
        timestamp: formatTimeAgo(row.created_at),
        createdAt: row.created_at,
        isRead: Boolean(row.read_at),
        isArchived,
        targetPostId: resolvedPostId,
        targetCommentId: resolvedCommentId,
        targetParentCommentId: resolvedParentCommentId,
        targetStoryId: resolvedStoryId,
        conversationId: convId,
      });
    }

    // Batch-resolve whether referenced target posts contain video so alerts route to Reels vs PostDetail
    const targetPostIds = Array.from(
      new Set(
        rawList
          .map((item) => item.targetPostId)
          .filter((id): id is string => Boolean(id && isValidUuid(id)))
      )
    );
    const videoPostIdSet = new Set<string>();
    if (targetPostIds.length > 0) {
      try {
        const { data: mediaRows } = await supabase
          .from('post_media')
          .select('post_id, kind, format, secure_url')
          .in('post_id', targetPostIds);
        for (const m of (mediaRows || []) as Array<{
          post_id?: string;
          kind?: string;
          format?: string;
          secure_url?: string;
        }>) {
          if (!m.post_id) continue;
          const fmt = (m.format || '').toLowerCase();
          const url = (m.secure_url || '').toLowerCase();
          const isVid =
            m.kind === 'video' ||
            fmt === 'mp4' ||
            fmt === 'webm' ||
            fmt === 'mov' ||
            fmt === 'm4v' ||
            url.includes('/video/') ||
            Boolean(url.match(/\.(mp4|webm|mov|ogg|m4v)(\?.*)?$/i));
          if (isVid) videoPostIdSet.add(m.post_id);
        }
      } catch {
        // Non-blocking fallback; AlertsView also verifies lazily if undefined
      }
    }

    // WhatsApp-Like Conversation-Level Deduplication for Active Message Alerts
    const activeUnreadMessageConvs = new Set<string>();
    const deduplicatedResult: NotificationItem[] = [];

    for (const rawItem of rawList) {
      const item: NotificationItem = rawItem.targetPostId
        ? { ...rawItem, targetIsVideo: videoPostIdSet.has(rawItem.targetPostId) }
        : rawItem;

      if (item.type === 'message' && !item.isRead && !item.isArchived) {
        const dedupeKey = item.conversationId || `sender_${item.actor.id}`;
        if (activeUnreadMessageConvs.has(dedupeKey)) {
          continue;
        }
        activeUnreadMessageConvs.add(dedupeKey);
        deduplicatedResult.push(item);
      } else {
        deduplicatedResult.push(item);
      }
    }

    return deduplicatedResult;
  } catch (err) {
    console.warn('Unexpected error in fetchUserNotifications:', err);
    return [];
  }
}

/**
 * Create a privacy-safe notification record.
 * Uses the server endpoint (service-role admin) to reliably bypass client RLS issues,
 * and automatically triggers Web Push notifications.
 */
export async function createRealNotification(params: {
  recipientId: string;
  actorId: string;
  type: NotificationType;
  entityType?:
    | 'post'
    | 'comment'
    | 'comment_reply'
    | 'comment_reaction'
    | 'story'
    | 'story_comment'
    | 'story_reaction'
    | 'story_view'
    | 'story_like'
    | 'conversation'
    | 'friend_request'
    | 'friend_accepted'
    | 'game'
    | 'user';
  entityId?: string;
  postId?: string;
  commentId?: string;
  parentCommentId?: string;
  body?: string;
  senderName?: string;
  url?: string;
}): Promise<boolean> {
  if (
    !params.recipientId ||
    !params.actorId ||
    params.recipientId === params.actorId ||
    !isValidUuid(params.recipientId) ||
    params.recipientId === MR_ANONYMOUS_PAGE_ID
  ) {
    return true; // Skip gracefully without foreign key errors
  }

  try {
    const safeBody =
      params.body || getPrivacySafeNotificationText(params.type, params.entityType);
    const validEntity = isValidUuid(params.entityId) ? params.entityId : null;
    const validPostId = isValidUuid(params.postId)
      ? params.postId
      : params.entityType === 'post' && validEntity
      ? validEntity
      : null;
    const validCommentId = isValidUuid(params.commentId)
      ? params.commentId
      : (params.entityType === 'comment' ||
          params.entityType === 'comment_reply' ||
          params.entityType === 'comment_reaction') &&
        validEntity
      ? validEntity
      : null;
    const validParentCommentId = isValidUuid(params.parentCommentId)
      ? params.parentCommentId
      : null;

    const dbType = mapAppTypeToDbEnum(params.type);
    let creationSuccess = false;

    // 1. Dispatch through server-authoritative endpoint (bypasses RLS & triggers Web Push)
    const headers = await getAuthHeaders(true);
    const serverRes = await fetch('/api/notifications/create', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        recipientId: params.recipientId,
        actorId: params.actorId,
        type: params.type,
        title: 'ABSU Connect Alert',
        body: safeBody,
        entityType: params.entityType,
        entityId: validEntity || validCommentId || validPostId,
        postId: validPostId,
        commentId: validCommentId,
        parentCommentId: validParentCommentId,
        senderName: params.senderName,
        url: params.url,
      }),
    });

    let serverJson: any = null;
    try {
      const ct = serverRes.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        serverJson = await serverRes.json().catch(() => null);
      }
    } catch {}

    if (serverRes.ok && serverJson?.success) {
      creationSuccess = true;
    } else {
      // 2. Client-side fallback when Express API isn't mounted (e.g., Vercel static SPA / Capacitor APK)
      const fallbackEntityId =
        params.entityType === 'comment' ||
        params.entityType === 'comment_reply' ||
        params.entityType === 'comment_reaction'
          ? validCommentId || validEntity || validPostId
          : validEntity || validPostId;

      const corePayload = {
        recipient_id: params.recipientId,
        actor_id: isValidUuid(params.actorId) ? params.actorId : null,
        type: dbType,
        title: 'ABSU Connect Alert',
        body: safeBody,
        entity_type: params.entityType,
        entity_id: fallbackEntityId,
        created_at: new Date().toISOString(),
        read_at: null,
      };

      const fullPayload = {
        ...corePayload,
        ...(validPostId ? { post_id: validPostId } : {}),
        ...(validCommentId ? { comment_id: validCommentId } : {}),
        ...(validParentCommentId ? { parent_comment_id: validParentCommentId } : {}),
      };

      let { error } = await supabase.from('notifications').insert(fullPayload);
      if (error && (error.message?.includes('column') || error.code === '42703')) {
        const retry = await supabase.from('notifications').insert(corePayload);
        error = retry.error;
      }
      creationSuccess = !error;
    }

    // 3. Trigger FCM push via Supabase Edge Function ("send-android-push")
    const dispatchEntityId = validEntity || validCommentId || validPostId;
    if (creationSuccess && dispatchEntityId) {
      dispatchAndroidPush({
        recipientId: params.recipientId,
        type: dbType,
        entityId: dispatchEntityId,
      }).catch((fcmErr) => {
        console.debug('[Push] FCM dispatch note:', fcmErr);
      });
    }

    return creationSuccess;
  } catch (err) {
    console.debug('createRealNotification note:', err);
    return false;
  }
}

/**
 * Conversation-level Message Notification: Ensures that an incoming message from a sender
 * maintains exactly ONE active unread conversation notification for that recipient.
 */
export async function createOrUpdateConversationNotification(params: {
  recipientId: string;
  senderId: string;
  conversationId: string;
  messageId?: string;
  senderName?: string;
}): Promise<boolean> {
  if (params.recipientId === params.senderId) return false;

  try {
    const safeConvId = isValidUuid(params.conversationId) ? params.conversationId : null;
    const safeMsgId = isValidUuid(params.messageId) ? params.messageId : null;
    const entityToDispatch = safeMsgId || safeConvId;
    let serverHandled = false;

    try {
      const res = await fetch('/api/notifications/create-or-update-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientId: params.recipientId,
          senderId: params.senderId,
          conversationId: safeConvId,
          messageId: safeMsgId,
          senderName: params.senderName,
        }),
      });
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('application/json')) {
        const json = await res.json().catch(() => null);
        serverHandled = Boolean(json?.success);
      }
    } catch {}

    // Client fallback when running on static hosting (Vercel) or native APK without Express server
    if (!serverHandled && entityToDispatch) {
      const senderDisplayName = params.senderName || 'ABSU Student';
      await supabase
        .from('notifications')
        .insert({
          recipient_id: params.recipientId,
          actor_id: isValidUuid(params.senderId) ? params.senderId : null,
          type: 'message',
          title: `${senderDisplayName} sent you a message.`,
          body: 'sent you a message.',
          entity_type: safeMsgId ? 'message' : 'conversation',
          entity_id: entityToDispatch,
          created_at: new Date().toISOString(),
          read_at: null,
        })
        .then(() => {});
    }

    // Trigger FCM push via Supabase Edge Function ("send-android-push")
    if (entityToDispatch) {
      dispatchAndroidPush({
        recipientId: params.recipientId,
        type: 'message',
        entityId: entityToDispatch,
      }).catch((fcmErr) => {
        console.debug('[Push] Message FCM dispatch note:', fcmErr);
      });
    }

    return true;
  } catch (err) {
    console.warn('createOrUpdateConversationNotification error:', err);
    return false;
  }
}

/**
 * Mark all message notifications for a specific conversation as read when recipient opens it.
 */
export async function markConversationNotificationsAsRead(
  currentUserId: string,
  conversationId: string,
  participantId?: string
): Promise<{ success: boolean; error?: string }> {
  if (!currentUserId || !conversationId) return { success: false };

  try {
    const nowIso = new Date().toISOString();

    let safeParticipantId = participantId;
    if (!safeParticipantId) {
      const { data: otherMember } = await supabase
        .from('conversation_members')
        .select('user_id')
        .eq('conversation_id', conversationId)
        .neq('user_id', currentUserId)
        .maybeSingle();
      if (otherMember?.user_id) safeParticipantId = otherMember.user_id;
    }

    // 1. Direct Supabase update
    let query = supabase
      .from('notifications')
      .update({ read_at: nowIso })
      .eq('recipient_id', currentUserId)
      .eq('type', 'message')
      .is('read_at', null);

    if (safeParticipantId) {
      query = query.or(`entity_id.eq.${conversationId},actor_id.eq.${safeParticipantId}`);
    } else {
      query = query.eq('entity_id', conversationId);
    }
    await query;

    // 2. Server-side resolution
    fetch('/api/notifications/resolve-conversation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUserId,
        conversationId,
        participantId: safeParticipantId,
      }),
    }).catch(() => {});

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error resolving conversation notifications';
    return { success: false, error: msg };
  }
}

/**
 * Trigger the idempotent Smart Welcome & Student Discovery notification after onboarding.
 */
export async function triggerWelcomeDiscoveryNotification(userId: string): Promise<void> {
  if (!userId || !isValidUuid(userId)) return;
  try {
    const headers = await getAuthHeaders(true);
    const res = await fetch('/api/notifications/welcome-discovery', {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId }),
    }).catch(() => null);
    const json = res?.ok ? await parseApiJson(res) : null;
    if (json?.success) return;

    await supabase.rpc('generate_welcome_discovery_notification', {
      p_user_id: userId,
    });
  } catch (err) {
    console.debug('[Notifications] Welcome discovery trigger note:', err);
  }
}

/**
 * Check if a user registered >24h ago with no social engagement yet and trigger at most ONE reminder.
 */
export async function checkDiscoveryInactivityReminder(userId: string): Promise<void> {
  if (!userId || !isValidUuid(userId)) return;
  try {
    const headers = await getAuthHeaders(true);
    const res = await fetch('/api/notifications/check-discovery-reminder', {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId }),
    }).catch(() => null);
    const json = res?.ok ? await parseApiJson(res) : null;
    if (json?.success) return;

    await supabase.rpc('check_discovery_inactivity_reminder', {
      p_user_id: userId,
    });
  } catch (err) {
    console.debug('[Notifications] Discovery inactivity reminder note:', err);
  }
}

/**
 * Mark an individual notification as read
 */
export async function markRealNotificationAsRead(
  notificationId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const headers = await getAuthHeaders(true);
    fetch('/api/notifications/mark-read', {
      method: 'POST',
      headers,
      body: JSON.stringify({ notificationId }),
    }).catch(() => {});

    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId);

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error updating notification';
    return { success: false, error: msg };
  }
}

/**
 * Mark all notifications as read for current user
 */
export async function markAllRealNotificationsAsRead(
  currentUserId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const headers = await getAuthHeaders(true);
    fetch('/api/notifications/mark-all-read', {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId: currentUserId }),
    }).catch(() => {});

    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('recipient_id', currentUserId)
      .is('read_at', null);

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error updating notifications';
    return { success: false, error: msg };
  }
}
