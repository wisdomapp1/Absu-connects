import { supabase } from './supabase.ts';
import {
  fetchSinglePostById,
  isPermissionOrRlsError,
  type SinglePostFetchResult,
} from './postService.ts';
import { fetchStoryById, type StoryByIdResult } from './storyService.ts';
import { fetchConversationById } from './messageService.ts';
import { checkPostHasVideo, isVideoPost } from './reelsService.ts';
import type {
  ActiveView,
  Conversation,
  FriendTab,
  NotificationItem,
  Post,
  User,
} from '../types/index.ts';
import type { Story } from '../types/stories.ts';

export type NotificationRouteKind =
  | 'discovery'
  | 'message'
  | 'friend_request'
  | 'friend_accept'
  | 'story_comment'
  | 'story_reaction'
  | 'story_view'
  | 'story_like'
  | 'post'
  | 'comment_reply'
  | 'comment_reaction'
  | 'comment'
  | 'fallback_post'
  | 'home';

export interface CommentLookupResult {
  status: 'ok' | 'not_found' | 'restricted' | 'error';
  comment?: {
    id: string;
    post_id: string;
    parent_comment_id: string | null;
  };
  error?: string;
}

export interface NotificationRouterActions {
  currentUserId?: string;
  posts: Post[];
  conversations: Conversation[];
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
  setFriendTab: (tab: FriendTab) => void;
  startConversationWithUser: (user: User) => void;
  openStoryById: (
    storyId: string,
    options?: {
      fallbackStory?: Story | null;
      initialInsightsOpen?: boolean;
      initialInsightsTab?: 'viewers' | 'reactions';
    }
  ) => Promise<boolean>;
  addToast: (message: string, type?: 'success' | 'info' | 'warning') => void;
}

export interface NotificationRouterResolvers {
  lookupCommentById?: (commentId: string) => Promise<CommentLookupResult>;
  lookupPostById?: (postId: string, currentUserId?: string) => Promise<SinglePostFetchResult>;
  lookupStoryById?: (storyId: string, currentUserId?: string) => Promise<StoryByIdResult>;
  lookupConversationById?: (convId: string, currentUserId: string) => Promise<Conversation | null>;
  lookupStoryCommentConvId?: (storyId: string, actorId?: string) => Promise<string | null>;
  checkVideoPost?: (postId: string) => Promise<boolean>;
}

export interface NotificationNavigationOutcome {
  kind: NotificationRouteKind;
  status: 'navigated' | 'not_found' | 'restricted' | 'error';
  targetView?: ActiveView;
  resolvedPostId?: string;
  resolvedCommentId?: string | null;
  resolvedParentCommentId?: string | null;
  resolvedStoryId?: string;
  resolvedConvId?: string;
  message?: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(val?: string | null): val is string {
  return typeof val === 'string' && UUID_REGEX.test(val.trim());
}

/**
 * Explicit entity-type classifier for ABSU Connect notifications.
 * Uses `entity_type` as primary discriminator (with `rawType` / `type` fallback)
 * so we never assume an arbitrary notification's `entity_id` is always a post ID.
 */
export function classifyNotificationEntity(item: NotificationItem): NotificationRouteKind {
  if (
    item.type === 'welcome_discovery' ||
    item.type === 'discovery_suggestion' ||
    item.type === 'discovery_reminder'
  ) {
    return 'discovery';
  }

  const et = String(item.entityType || '').toLowerCase().trim();
  const raw = String(item.rawType || '').toLowerCase().trim();

  if (item.type === 'friend_request' || et === 'friend_request' || raw === 'friend_request') {
    return 'friend_request';
  }
  if (
    item.type === 'friend_accept' ||
    et === 'friend_accepted' ||
    raw === 'friend_accepted' ||
    raw === 'friend_accept'
  ) {
    return 'friend_accept';
  }
  if (item.type === 'message' || et === 'message' || et === 'conversation' || raw === 'message') {
    return 'message';
  }

  // Story entity types -> stories.id
  if (et === 'story_comment' || item.type === 'story_comment' || raw === 'story_comment') {
    return 'story_comment';
  }
  if (et === 'story_reaction' || item.type === 'story_reaction' || raw === 'story_reaction') {
    return 'story_reaction';
  }
  if (et === 'story_view' || item.type === 'story_view' || raw === 'story_view') {
    return 'story_view';
  }
  if (et === 'story_like' || item.type === 'story_like' || raw === 'story_like') {
    return 'story_like';
  }
  if (et === 'story') {
    return 'story_reaction';
  }

  // Comment-scoped entity types -> comments.id (must resolve post_id before opening post)
  if (et === 'comment_reply' || raw === 'comment_reply' || raw === 'reply') {
    return 'comment_reply';
  }
  if (et === 'comment_reaction' || raw === 'comment_reaction') {
    return 'comment_reaction';
  }
  if (et === 'comment') {
    return 'comment';
  }

  // Post-scoped entity types -> posts.id
  if (et === 'post') {
    return 'post';
  }

  if (
    item.type === 'comment' ||
    item.type === 'like' ||
    item.type === 'mention' ||
    item.type === 'community_post'
  ) {
    if (item.targetCommentId && !item.targetPostId) {
      return 'comment';
    }
    return item.targetPostId ? 'post' : 'fallback_post';
  }

  if (item.targetStoryId && !item.targetPostId) {
    return 'story_reaction';
  }
  if (item.targetPostId) {
    return 'fallback_post';
  }

  return 'home';
}

export function resolveNotificationCandidateIds(
  item: NotificationItem,
  kind: NotificationRouteKind
): {
  postId?: string;
  commentId?: string;
  parentCommentId?: string;
  storyId?: string;
  conversationId?: string;
  legacyEntityId?: string;
} {
  const cleanEntityId = isUuid(item.entityId) ? item.entityId.trim() : undefined;
  const targetPostId = isUuid(item.targetPostId) ? item.targetPostId.trim() : undefined;
  const targetCommentId = isUuid(item.targetCommentId) ? item.targetCommentId.trim() : undefined;
  const targetParentCommentId = isUuid(item.targetParentCommentId)
    ? item.targetParentCommentId.trim()
    : undefined;
  const targetStoryId = isUuid(item.targetStoryId) ? item.targetStoryId.trim() : undefined;
  const conversationId = isUuid(item.conversationId) ? item.conversationId.trim() : undefined;

  if (
    kind === 'story_comment' ||
    kind === 'story_reaction' ||
    kind === 'story_view' ||
    kind === 'story_like'
  ) {
    return {
      storyId: targetStoryId || cleanEntityId,
      conversationId,
      legacyEntityId: cleanEntityId,
    };
  }

  if (kind === 'comment_reply' || kind === 'comment_reaction') {
    return {
      commentId: targetCommentId || cleanEntityId,
      parentCommentId: targetParentCommentId,
      postId: targetPostId,
      legacyEntityId: cleanEntityId,
    };
  }

  if (kind === 'comment') {
    return {
      commentId: targetCommentId || cleanEntityId,
      parentCommentId: targetParentCommentId,
      postId: targetPostId,
      legacyEntityId: cleanEntityId,
    };
  }

  if (kind === 'post' || kind === 'fallback_post') {
    return {
      postId: targetPostId || cleanEntityId,
      commentId: targetCommentId,
      parentCommentId: targetParentCommentId,
      legacyEntityId: cleanEntityId,
    };
  }

  return {
    postId: targetPostId,
    commentId: targetCommentId,
    parentCommentId: targetParentCommentId,
    storyId: targetStoryId,
    conversationId,
    legacyEntityId: cleanEntityId,
  };
}

async function defaultLookupCommentById(commentId: string): Promise<CommentLookupResult> {
  if (!isUuid(commentId)) {
    return { status: 'not_found', error: 'Invalid comment ID.' };
  }
  try {
    const { data, error } = await supabase
      .from('comments')
      .select('id, post_id, parent_comment_id')
      .eq('id', commentId)
      .maybeSingle();

    if (error) {
      console.error('[NotificationRouter] comments lookup Supabase error:', {
        commentId,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      const restricted = isPermissionOrRlsError(error);
      return {
        status: restricted ? 'restricted' : 'error',
        error: restricted
          ? 'You do not have permission to view this comment.'
          : error.message || 'Could not load this comment right now.',
      };
    }

    if (!data) {
      return { status: 'not_found', error: 'This comment is no longer available.' };
    }

    return {
      status: 'ok',
      comment: {
        id: data.id,
        post_id: data.post_id,
        parent_comment_id: data.parent_comment_id ?? null,
      },
    };
  } catch (err) {
    console.error('[NotificationRouter] comments lookup unexpected error:', { commentId, err });
    return {
      status: 'error',
      error: err instanceof Error ? err.message : 'Unable to load this comment right now.',
    };
  }
}

async function defaultLookupStoryCommentConvId(
  storyId: string,
  actorId?: string
): Promise<string | null> {
  if (!isUuid(storyId)) return null;
  try {
    let query = supabase
      .from('story_comments')
      .select('conversation_id, commenter_id, created_at')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (isUuid(actorId)) {
      query = query.eq('commenter_id', actorId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[NotificationRouter] story_comments lookup error:', {
        storyId,
        actorId,
        code: error.code,
        message: error.message,
      });
      return null;
    }

    const row = Array.isArray(data) ? data[0] : null;
    return isUuid(row?.conversation_id) ? row.conversation_id : null;
  } catch (err) {
    console.error('[NotificationRouter] story_comments lookup exception:', err);
    return null;
  }
}

function shouldOpenCommentsSection(
  item: NotificationItem,
  kind: NotificationRouteKind,
  resolvedCommentId?: string | null,
  resolvedParentCommentId?: string | null
): boolean {
  if (kind === 'comment_reply' || kind === 'comment_reaction' || kind === 'comment') {
    return true;
  }
  const et = String(item.entityType || '').toLowerCase();
  return (
    item.type === 'comment' ||
    item.type === 'mention' ||
    et === 'comment' ||
    et === 'comment_reply' ||
    et === 'comment_reaction' ||
    Boolean(resolvedCommentId || resolvedParentCommentId)
  );
}

async function openVerifiedPostDestination(
  postId: string,
  item: NotificationItem,
  kind: NotificationRouteKind,
  actions: NotificationRouterActions,
  resolvers: Required<NotificationRouterResolvers>,
  commentMeta?: {
    commentId?: string | null;
    parentCommentId?: string | null;
    openComments?: boolean;
  }
): Promise<NotificationNavigationOutcome> {
  const postRes = await resolvers.lookupPostById(postId, actions.currentUserId);

  if (postRes.status === 'restricted') {
    const msg = postRes.error || 'You do not have permission to view this post.';
    actions.addToast(msg, 'warning');
    return { kind, status: 'restricted', resolvedPostId: postId, message: msg };
  }

  if (postRes.status === 'error') {
    console.error('[NotificationRouter] Post lookup query error:', {
      postId,
      notificationId: item.id,
      error: postRes.error,
    });
    const msg = 'Could not load this post right now. Please try again.';
    actions.addToast(msg, 'warning');
    return { kind, status: 'error', resolvedPostId: postId, message: msg };
  }

  if (postRes.status === 'not_found' || !postRes.post) {
    const msg = 'This post is no longer available.';
    actions.addToast(msg, 'warning');
    return { kind, status: 'not_found', resolvedPostId: postId, message: msg };
  }

  const verifiedPost = postRes.post;
  let isVideo = isVideoPost(verifiedPost) || item.targetIsVideo === true;
  if (!isVideo && item.targetIsVideo === undefined) {
    const cached = actions.posts.find((p) => p.id === verifiedPost.id);
    if (cached && isVideoPost(cached)) {
      isVideo = true;
    } else {
      isVideo = await resolvers.checkVideoPost(verifiedPost.id).catch(() => false);
    }
  }

  const targetView: ActiveView = isVideo ? 'reels' : 'post-detail';
  const resolvedCommentId = commentMeta?.commentId ?? item.targetCommentId ?? null;
  const resolvedParentCommentId = commentMeta?.parentCommentId ?? item.targetParentCommentId ?? null;
  const openComments =
    commentMeta?.openComments ??
    shouldOpenCommentsSection(item, kind, resolvedCommentId, resolvedParentCommentId);

  actions.navigateTo(targetView, {
    postId: verifiedPost.id,
    commentId: resolvedCommentId,
    parentCommentId: resolvedParentCommentId,
    openComments,
    actorId: item.actor.id,
  });

  return {
    kind,
    status: 'navigated',
    targetView,
    resolvedPostId: verifiedPost.id,
    resolvedCommentId,
    resolvedParentCommentId,
  };
}

/**
 * Explicit notification router with deterministic entity resolution and clear error vs not-found discrimination.
 */
export async function executeNotificationNavigation(
  item: NotificationItem,
  actions: NotificationRouterActions,
  customResolvers: NotificationRouterResolvers = {}
): Promise<NotificationNavigationOutcome> {
  const resolvers: Required<NotificationRouterResolvers> = {
    lookupCommentById: customResolvers.lookupCommentById || defaultLookupCommentById,
    lookupPostById: customResolvers.lookupPostById || fetchSinglePostById,
    lookupStoryById: customResolvers.lookupStoryById || fetchStoryById,
    lookupConversationById: customResolvers.lookupConversationById || fetchConversationById,
    lookupStoryCommentConvId: customResolvers.lookupStoryCommentConvId || defaultLookupStoryCommentConvId,
    checkVideoPost: customResolvers.checkVideoPost || checkPostHasVideo,
  };

  const kind = classifyNotificationEntity(item);
  const ids = resolveNotificationCandidateIds(item, kind);

  // 1. Discovery notifications
  if (kind === 'discovery') {
    actions.setFriendTab('discover');
    actions.navigateTo('friends');
    return { kind, status: 'navigated', targetView: 'friends' };
  }

  // 2. Friendship notifications
  if (kind === 'friend_request') {
    actions.setFriendTab('requests');
    actions.navigateTo('friends');
    return { kind, status: 'navigated', targetView: 'friends' };
  }

  if (kind === 'friend_accept') {
    actions.navigateTo('user-profile', { userId: item.actor.id });
    return { kind, status: 'navigated', targetView: 'user-profile' };
  }

  // 3. Direct message notifications
  if (kind === 'message') {
    if (ids.conversationId) {
      actions.navigateTo('conversation', { convId: ids.conversationId });
      return {
        kind,
        status: 'navigated',
        targetView: 'conversation',
        resolvedConvId: ids.conversationId,
      };
    }
    const directConv = actions.conversations.find((c) => c.participant.id === item.actor.id);
    if (directConv) {
      actions.navigateTo('conversation', { convId: directConv.id });
      return {
        kind,
        status: 'navigated',
        targetView: 'conversation',
        resolvedConvId: directConv.id,
      };
    }
    if (item.actor.id && item.actor.id !== 'system') {
      actions.startConversationWithUser({
        id: item.actor.id,
        name: item.actor.name,
        avatar: item.actor.avatar,
        handle: '@student',
        department: 'Student',
        faculty: 'Abia State University',
        level: 'Undergraduate',
        campus: 'Uturu (Main Campus)',
        bio: '',
        interests: [],
        relationshipState: 'none',
      });
      return { kind, status: 'navigated', targetView: 'conversation' };
    }
    actions.navigateTo('messages');
    return { kind, status: 'navigated', targetView: 'messages' };
  }

  // 4. Story comment / reply notifications -> DM conversation if exists, else original story
  if (kind === 'story_comment') {
    let candidateConvId = ids.conversationId;
    if (!candidateConvId && ids.storyId) {
      candidateConvId =
        (await resolvers.lookupStoryCommentConvId(ids.storyId, item.actor.id)) || undefined;
    }

    if (candidateConvId) {
      const cachedConv = actions.conversations.some((c) => c.id === candidateConvId);
      if (cachedConv) {
        actions.navigateTo('conversation', { convId: candidateConvId });
        return {
          kind,
          status: 'navigated',
          targetView: 'conversation',
          resolvedConvId: candidateConvId,
          resolvedStoryId: ids.storyId,
        };
      }
      if (actions.currentUserId) {
        const fetchedConv = await resolvers
          .lookupConversationById(candidateConvId, actions.currentUserId)
          .catch(() => null);
        if (fetchedConv) {
          actions.navigateTo('conversation', { convId: candidateConvId });
          return {
            kind,
            status: 'navigated',
            targetView: 'conversation',
            resolvedConvId: candidateConvId,
            resolvedStoryId: ids.storyId,
          };
        }
      }
    }

    if (!ids.storyId) {
      const msg = 'This story reply is no longer available.';
      actions.addToast(msg, 'warning');
      return { kind, status: 'not_found', message: msg };
    }

    const storyRes = await resolvers.lookupStoryById(ids.storyId, actions.currentUserId);
    if (storyRes.status === 'ok') {
      await actions.openStoryById(ids.storyId, { fallbackStory: storyRes.story });
      return { kind, status: 'navigated', resolvedStoryId: ids.storyId };
    }

    if (storyRes.reason === 'restricted') {
      const msg = storyRes.error || 'You do not have permission to view this story.';
      actions.addToast(msg, 'warning');
      return { kind, status: 'restricted', resolvedStoryId: ids.storyId, message: msg };
    }
    if (storyRes.reason === 'error') {
      console.error('[NotificationRouter] Story lookup query error:', {
        storyId: ids.storyId,
        notificationId: item.id,
        error: storyRes.error,
      });
      const msg = 'Could not load this story right now. Please try again.';
      actions.addToast(msg, 'warning');
      return { kind, status: 'error', resolvedStoryId: ids.storyId, message: msg };
    }
    const msg = 'This story reply is no longer available.';
    actions.addToast(msg, 'warning');
    return { kind, status: 'not_found', resolvedStoryId: ids.storyId, message: msg };
  }

  // 5. Story reactions, story views, and legacy story_like -> stories.id + Activity drawer
  if (kind === 'story_reaction' || kind === 'story_view' || kind === 'story_like') {
    if (!ids.storyId) {
      const msg = 'This story is no longer available.';
      actions.addToast(msg, 'warning');
      return { kind, status: 'not_found', message: msg };
    }

    const storyRes = await resolvers.lookupStoryById(ids.storyId, actions.currentUserId);
    if (storyRes.status === 'ok') {
      const tab: 'viewers' | 'reactions' = kind === 'story_view' ? 'viewers' : 'reactions';
      await actions.openStoryById(ids.storyId, {
        fallbackStory: storyRes.story,
        initialInsightsOpen: true,
        initialInsightsTab: tab,
      });
      return { kind, status: 'navigated', resolvedStoryId: ids.storyId };
    }

    if (storyRes.reason === 'restricted') {
      const msg = storyRes.error || 'You do not have permission to view this story.';
      actions.addToast(msg, 'warning');
      return { kind, status: 'restricted', resolvedStoryId: ids.storyId, message: msg };
    }
    if (storyRes.reason === 'error') {
      console.error('[NotificationRouter] Story lookup query error:', {
        storyId: ids.storyId,
        notificationId: item.id,
        error: storyRes.error,
      });
      const msg = 'Could not load this story right now. Please try again.';
      actions.addToast(msg, 'warning');
      return { kind, status: 'error', resolvedStoryId: ids.storyId, message: msg };
    }

    const msg = 'This story is no longer available.';
    actions.addToast(msg, 'warning');
    return { kind, status: 'not_found', resolvedStoryId: ids.storyId, message: msg };
  }

  // 6. Comment reply & comment reaction -> entity_id is comments.id, resolve parent post_id first
  if (kind === 'comment_reply' || kind === 'comment_reaction') {
    let resolvedPostId = ids.postId;
    let resolvedCommentId = ids.commentId;
    let resolvedParentCommentId = ids.parentCommentId;

    if (ids.commentId && (!resolvedPostId || (kind === 'comment_reply' && !resolvedParentCommentId))) {
      const commentRes = await resolvers.lookupCommentById(ids.commentId);
      if (commentRes.status === 'ok' && commentRes.comment) {
        resolvedCommentId = commentRes.comment.id;
        resolvedPostId = commentRes.comment.post_id || resolvedPostId;
        resolvedParentCommentId =
          commentRes.comment.parent_comment_id ?? resolvedParentCommentId;
      } else if (commentRes.status === 'restricted') {
        const msg = commentRes.error || 'You do not have permission to view this comment.';
        actions.addToast(msg, 'warning');
        return { kind, status: 'restricted', resolvedCommentId: ids.commentId, message: msg };
      } else if (commentRes.status === 'error') {
        const msg = 'Could not load this comment right now. Please try again.';
        actions.addToast(msg, 'warning');
        return { kind, status: 'error', resolvedCommentId: ids.commentId, message: msg };
      }
    }

    if (!resolvedPostId) {
      const msg =
        kind === 'comment_reply'
          ? 'The reply for this notification is no longer available.'
          : 'The comment for this notification is no longer available.';
      actions.addToast(msg, 'warning');
      return { kind, status: 'not_found', resolvedCommentId, message: msg };
    }

    return openVerifiedPostDestination(resolvedPostId, item, kind, actions, resolvers, {
      commentId: resolvedCommentId || null,
      parentCommentId: resolvedParentCommentId || null,
      openComments: true,
    });
  }

  // 7. Legacy `comment` notifications: entity_id could be comments.id OR posts.id!
  if (kind === 'comment') {
    let resolvedPostId = ids.postId;
    let resolvedCommentId = ids.commentId;
    let resolvedParentCommentId = ids.parentCommentId;

    if (ids.commentId) {
      const commentRes = await resolvers.lookupCommentById(ids.commentId);
      if (commentRes.status === 'ok' && commentRes.comment) {
        resolvedCommentId = commentRes.comment.id;
        const verifiedPostId = commentRes.comment.post_id || resolvedPostId;
        resolvedParentCommentId =
          commentRes.comment.parent_comment_id ?? resolvedParentCommentId;
        if (verifiedPostId) {
          return openVerifiedPostDestination(verifiedPostId, item, kind, actions, resolvers, {
            commentId: resolvedCommentId,
            parentCommentId: resolvedParentCommentId || null,
            openComments: true,
          });
        }
      }
      if (commentRes.status === 'restricted') {
        const msg = commentRes.error || 'You do not have permission to view this comment.';
        actions.addToast(msg, 'warning');
        return { kind, status: 'restricted', resolvedCommentId: ids.commentId, message: msg };
      }
      if (commentRes.status === 'error') {
        const msg = 'Could not load this comment right now. Please try again.';
        actions.addToast(msg, 'warning');
        return { kind, status: 'error', resolvedCommentId: ids.commentId, message: msg };
      }
    }

    // Legacy fallback: entity_id may actually be a posts.id when comment row didn't match entity_id
    const legacyPostCandidate = resolvedPostId || ids.legacyEntityId;
    if (legacyPostCandidate) {
      const postResult = await openVerifiedPostDestination(
        legacyPostCandidate,
        item,
        kind,
        actions,
        resolvers,
        {
          commentId:
            resolvedCommentId && resolvedCommentId !== legacyPostCandidate
              ? resolvedCommentId
              : null,
          parentCommentId: resolvedParentCommentId || null,
          openComments: true,
        }
      );
      return postResult;
    }

    const msg = 'This comment is no longer available.';
    actions.addToast(msg, 'warning');
    return { kind, status: 'not_found', message: msg };
  }

  // 8. Standard post notifications (`entity_type = 'post'`)
  if (kind === 'post' || kind === 'fallback_post') {
    if (!ids.postId) {
      const msg = 'This post is no longer available.';
      actions.addToast(msg, 'warning');
      return { kind, status: 'not_found', message: msg };
    }
    return openVerifiedPostDestination(ids.postId, item, kind, actions, resolvers, {
      commentId: ids.commentId || null,
      parentCommentId: ids.parentCommentId || null,
      openComments: shouldOpenCommentsSection(item, kind, ids.commentId, ids.parentCommentId),
    });
  }

  actions.navigateTo('home');
  return { kind: 'home', status: 'navigated', targetView: 'home' };
}
