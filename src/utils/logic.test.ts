import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterPosts,
  searchEntities,
  calculateUnreadCount,
  validatePostSubmission,
  toggleLikePost,
  validateImageFile,
  validateEmail,
  validatePassword,
  validatePasswordMatch,
} from './logic.ts';
import type { Post, User, NotificationItem } from '../types/index.ts';

const mockUserA: User = {
  id: 'u1',
  name: 'Chinedu Okeke',
  avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb',
  handle: '@chinedu_o',
  department: 'Computer Science',
  faculty: 'Physical Sciences',
  level: '300L',
  campus: 'Uturu (Main Campus)',
  bio: 'CS Student & Tech Enthusiast',
  interests: ['Coding', 'Football'],
  relationshipState: 'self',
};

const mockUserB: User = {
  id: 'u2',
  name: 'Amaka Eze',
  avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb',
  handle: '@amaka_e',
  department: 'Medicine & Surgery',
  faculty: 'College of Health Sciences',
  level: '400L',
  campus: 'Aba Campus',
  bio: 'Future surgeon & medical researcher',
  interests: ['Surgery', 'Biotech'],
  relationshipState: 'friends',
};

const mockUserC: User = {
  id: 'u3',
  name: 'Emeka Nwosu',
  avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb',
  handle: '@emeka_n',
  department: 'Law',
  faculty: 'Law',
  level: '200L',
  campus: 'Uturu (Main Campus)',
  bio: 'Aspiring advocate',
  interests: ['Moot Court', 'Debate'],
  relationshipState: 'none',
};

const mockPosts: Post[] = [
  {
    id: 'p1',
    author: mockUserA,
    content: 'Welcome back to second semester at ABSU Uturu campus!',
    category: 'General',
    audience: 'Public',
    createdAt: '2 hrs ago',
    likesCount: 10,
    isLiked: false,
    isSaved: false,
    comments: [],
  },
  {
    id: 'p2',
    author: mockUserB,
    content: 'Clinical rotations scheduled for Aba teaching hospital starting Monday.',
    category: 'Campus Update',
    audience: 'Campus Only',
    createdAt: '4 hrs ago',
    likesCount: 25,
    isLiked: true,
    isSaved: false,
    comments: [],
  },
  {
    id: 'p3',
    author: mockUserC,
    content: 'Law dinner tickets are officially out at the faculty secretariat.',
    category: 'Event',
    audience: 'Public',
    createdAt: '1 day ago',
    likesCount: 5,
    isLiked: false,
    isSaved: false,
    comments: [],
  },
];

test('filterPosts returns all posts for "for-you"', () => {
  const result = filterPosts(mockPosts, 'for-you');
  assert.equal(result.length, 3);
});

test('filterPosts filters for "friends" correctly', () => {
  const result = filterPosts(mockPosts, 'friends');
  // mockUserA (self) and mockUserB (friends) should be returned
  assert.equal(result.length, 2);
  assert.equal(result[0].id, 'p1');
  assert.equal(result[1].id, 'p2');
});

test('filterPosts filters for "campus" correctly', () => {
  const result = filterPosts(mockPosts, 'campus');
  // p2 is Campus Update / Campus Only
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'p2');
});

test('searchEntities finds users and posts by keyword', () => {
  const result = searchEntities('law', [mockUserA, mockUserB, mockUserC], mockPosts);
  assert.equal(result.users.length, 1);
  assert.equal(result.users[0].name, 'Emeka Nwosu');
  assert.equal(result.posts.length, 1);
  assert.equal(result.posts[0].id, 'p3');
});

test('calculateUnreadCount counts only unread active notifications and excludes archived', () => {
  const notifications: NotificationItem[] = [
    {
      id: 'n1',
      type: 'like',
      actor: { id: 'u2', name: 'Amaka', avatar: '' },
      content: 'liked your post',
      timestamp: '10m',
      isRead: false,
      isArchived: false,
    },
    {
      id: 'n2',
      type: 'comment',
      actor: { id: 'u3', name: 'Emeka', avatar: '' },
      content: 'commented on your post',
      timestamp: '1h',
      isRead: true,
      isArchived: false,
    },
    {
      id: 'n3',
      type: 'friend_request',
      actor: { id: 'u3', name: 'Emeka', avatar: '' },
      content: 'sent you a friend request',
      timestamp: '2h',
      isRead: false,
      isArchived: false,
    },
    {
      id: 'n4',
      type: 'message',
      actor: { id: 'u4', name: 'Chidi', avatar: '' },
      content: 'sent you a message.',
      timestamp: '8d ago',
      isRead: false,
      isArchived: true, // Archived (>= 7 days old)
    },
  ];
  // n1 (unread active) and n3 (unread active) = 2. n4 is archived so not counted!
  assert.equal(calculateUnreadCount(notifications), 2);
});

test('validatePostSubmission validates non-empty and length restrictions', () => {
  assert.equal(validatePostSubmission('').valid, false);
  assert.equal(validatePostSubmission('   ').valid, false);
  assert.equal(validatePostSubmission('Valid campus post!').valid, true);
  const tooLong = 'a'.repeat(2005);
  assert.equal(validatePostSubmission(tooLong).valid, false);
});

test('toggleLikePost correctly toggles like state and count', () => {
  const unlikedPost = mockPosts[0];
  const liked = toggleLikePost(unlikedPost);
  assert.equal(liked.isLiked, true);
  assert.equal(liked.likesCount, 11);

  const unlikedAgain = toggleLikePost(liked);
  assert.equal(unlikedAgain.isLiked, false);
  assert.equal(unlikedAgain.likesCount, 10);
});

test('validateImageFile accepts valid JPEG, PNG, WEBP, and GIF under 10MB', () => {
  const validJpg = { type: 'image/jpeg', size: 2 * 1024 * 1024 };
  assert.equal(validateImageFile(validJpg).valid, true);

  const validPng = { type: 'image/png', size: 500 * 1024 };
  assert.equal(validateImageFile(validPng).valid, true);

  const validWebp = { type: 'image/webp', size: 1024 * 1024 };
  assert.equal(validateImageFile(validWebp).valid, true);
});

test('validateImageFile rejects unsupported file types and oversized files', () => {
  const invalidPdf = { type: 'application/pdf', size: 1024 };
  assert.equal(validateImageFile(invalidPdf).valid, false);
  assert.match(validateImageFile(invalidPdf).error || '', /Unsupported image format/);

  const oversizedJpg = { type: 'image/jpeg', size: 15 * 1024 * 1024 };
  assert.equal(validateImageFile(oversizedJpg).valid, false);
  assert.match(validateImageFile(oversizedJpg).error || '', /exceeds maximum 10MB/);
});

test('validateEmail validates typical and campus email addresses', () => {
  assert.equal(validateEmail('student@absu.edu.ng'), true);
  assert.equal(validateEmail('user@gmail.com'), true);
  assert.equal(validateEmail('invalid-email'), false);
  assert.equal(validateEmail('student@'), false);
  assert.equal(validateEmail(''), false);
});

test('validatePassword validates minimum length requirements', () => {
  assert.equal(validatePassword('12345').valid, false);
  assert.equal(validatePassword('123456').valid, true);
  assert.equal(validatePassword('SecurePassword2026!').valid, true);
});

test('validatePasswordMatch checks confirmation match', () => {
  assert.equal(validatePasswordMatch('password123', 'password123').valid, true);
  assert.equal(validatePasswordMatch('password123', 'different').valid, false);
});

test('validateVideoFile validates MP4 and WebM under 50MB and rejects oversized files', async () => {
  const { validateVideoFile } = await import('./logic.ts');
  const validMp4 = { type: 'video/mp4', size: 10 * 1024 * 1024 };
  assert.equal(validateVideoFile(validMp4).valid, true);

  const oversizedVideo = { type: 'video/mp4', size: 60 * 1024 * 1024 };
  assert.equal(validateVideoFile(oversizedVideo).valid, false);
  assert.match(validateVideoFile(oversizedVideo).error || '', /50MB/);

  const unsupportedType = { type: 'audio/mp3', size: 5 * 1024 * 1024 };
  assert.equal(validateVideoFile(unsupportedType).valid, false);
});

test('extractStoryIdFromAttachment detects story_id, story://, and story: references safely', async () => {
  const { extractStoryIdFromAttachment, isStoryAttachment } = await import('../lib/storyUtils.ts');

  const uuid = 'a8b9c0d1-e2f3-4a5b-8c9d-0e1f2a3b4c5d';

  assert.equal(
    extractStoryIdFromAttachment({
      secure_url: `story://${uuid}`,
      asset_id: `story:${uuid}`,
      story_id: uuid,
    }),
    uuid
  );
  assert.equal(
    isStoryAttachment({
      secure_url: `story://${uuid}`,
    }),
    true
  );
  assert.equal(
    extractStoryIdFromAttachment({
      asset_id: `story:${uuid}`,
    }),
    uuid
  );
  assert.equal(
    extractStoryIdFromAttachment({
      secure_url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
    }),
    null
  );
  assert.equal(
    isStoryAttachment({
      secure_url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
    }),
    false
  );
});

test('shouldSkipStoryViewRecord prevents owner self-views and unauthenticated views', async () => {
  const { shouldSkipStoryViewRecord } = await import('../lib/storyUtils.ts');

  assert.equal(shouldSkipStoryViewRecord('user-1', 'user-1'), true);
  assert.equal(shouldSkipStoryViewRecord('user-1', ''), true);
  assert.equal(shouldSkipStoryViewRecord('user-1', null), true);
  assert.equal(shouldSkipStoryViewRecord('user-1', 'user-2'), false);
});

test('normalizeStoryInsightsRows filters owner self-views, deduplicates viewers/reactions, and sorts newest first', async () => {
  const { normalizeStoryInsightsRows, formatStoryReactionEmoji } = await import('../lib/storyUtils.ts');

  const profilesById = new Map<string, {
    id: string;
    display_name?: string | null;
    avatar_url?: string | null;
    department?: string | null;
    level?: string | null;
  }>([
    ['u2', { id: 'u2', display_name: 'Amaka Eze', avatar_url: '', department: 'Medicine', level: '400L' }],
    ['u3', { id: 'u3', display_name: 'Emeka Nwosu', avatar_url: '', department: 'Law', level: '200L' }],
  ]);

  const result = normalizeStoryInsightsRows({
    storyOwnerId: 'u1',
    viewsRows: [
      { story_id: 's1', viewer_id: 'u1', viewed_at: '2026-11-23T12:00:00Z' }, // self-view excluded
      { story_id: 's1', viewer_id: 'u2', viewed_at: '2026-11-23T10:00:00Z' },
      { story_id: 's1', viewer_id: 'u2', viewed_at: '2026-11-23T11:30:00Z' }, // duplicate keeps latest
      { story_id: 's1', viewer_id: 'u3', viewed_at: '2026-11-23T11:00:00Z' },
    ],
    reactionsRows: [
      { story_id: 's1', user_id: 'u2', reaction: 'like', created_at: '2026-11-23T10:05:00Z' },
      { story_id: 's1', user_id: 'u3', reaction: '🔥', created_at: '2026-11-23T11:05:00Z' },
      { story_id: 's1', user_id: 'u2', reaction: '😂', created_at: '2026-11-23T11:45:00Z' }, // updated reaction keeps latest
    ],
    profilesById,
  });

  assert.equal(result.viewsCount, 2);
  assert.equal(result.views[0].viewer_id, 'u2');
  assert.equal(result.views[0].viewed_at, '2026-11-23T11:30:00Z');
  assert.equal(result.views[0].viewer?.name, 'Amaka Eze');
  assert.equal(result.views[1].viewer_id, 'u3');

  assert.equal(result.reactionsCount, 2);
  assert.equal(result.reactions[0].user_id, 'u2');
  assert.equal(result.reactions[0].reaction, '😂');
  assert.equal(result.reactions[1].reaction, '🔥');
  assert.equal(formatStoryReactionEmoji('like'), '❤️');
  assert.equal(formatStoryReactionEmoji('fire'), '🔥');
});

test('isStoryNotificationType distinguishes story alerts from post/comment alerts', async () => {
  const { isStoryNotificationType } = await import('../lib/storyUtils.ts');

  assert.equal(isStoryNotificationType('story_comment'), true);
  assert.equal(isStoryNotificationType('story_reaction'), true);
  assert.equal(isStoryNotificationType('story_view'), true);
  assert.equal(isStoryNotificationType('story_like'), true);
  assert.equal(isStoryNotificationType('comment'), false);
  assert.equal(isStoryNotificationType('like'), false);
});

const UUID_1 = '11111111-1111-4111-8111-111111111111';
const UUID_2 = '22222222-2222-4222-8222-222222222222';
const UUID_3 = '33333333-3333-4333-8333-333333333333';
const UUID_4 = '44444444-4444-4444-8444-444444444444';
const UUID_5 = '55555555-5555-4555-8555-555555555555';

function makeHarness(overrides: Record<string, any> = {}) {
  const navigations: Array<{ view: string; options?: Record<string, any> }> = [];
  const friendTabs: string[] = [];
  const toasts: Array<{ message: string; type?: string }> = [];
  const openedStories: Array<{ storyId: string; options?: Record<string, any> }> = [];
  const startedChats: string[] = [];

  const samplePost: Post = {
    ...mockPosts[0],
    id: UUID_1,
  };
  const sampleVideoPost: Post = {
    ...mockPosts[0],
    id: UUID_5,
    mediaType: 'video',
    mediaUrl: 'https://res.cloudinary.com/demo/video/upload/sample.mp4',
  };

  const actions = {
    currentUserId: 'u1',
    posts: [samplePost, sampleVideoPost],
    conversations: [],
    navigateTo: (view: string, options?: Record<string, any>) => {
      navigations.push({ view, options });
    },
    setFriendTab: (tab: string) => {
      friendTabs.push(tab);
    },
    startConversationWithUser: (user: User) => {
      startedChats.push(user.id);
    },
    openStoryById: async (storyId: string, options?: Record<string, any>) => {
      openedStories.push({ storyId, options });
      return true;
    },
    addToast: (message: string, type?: string) => {
      toasts.push({ message, type });
    },
  };

  const resolvers = {
    lookupCommentById: async () => ({ status: 'not_found' as const }),
    lookupPostById: async (postId: string) => {
      if (postId === UUID_1) return { post: samplePost, status: 'ok' as const };
      if (postId === UUID_5) return { post: sampleVideoPost, status: 'ok' as const };
      return { post: null, status: 'not_found' as const, error: 'Deleted' };
    },
    lookupStoryById: async (storyId: string) => ({
      status: 'ok' as const,
      story: {
        id: storyId,
        user_id: 'u1',
        media_type: 'image' as const,
        storage_path: 'https://example.com/story.jpg',
        media_url: 'https://example.com/story.jpg',
        text_content: null,
        caption: 'Campus story',
        created_at: '2026-11-23T00:00:00Z',
        expires_at: '2026-11-24T00:00:00Z',
        views_count: 1,
        reactions_count: 1,
        has_viewed: false,
        has_reacted: false,
      },
    }),
    lookupConversationById: async () => null,
    lookupStoryCommentConvId: async () => null,
    checkVideoPost: async (postId: string) => postId === UUID_5,
    ...overrides,
  };

  return { actions, resolvers, navigations, friendTabs, toasts, openedStories, startedChats };
}

function makeNotif(partial: Partial<NotificationItem>): NotificationItem {
  return {
    id: 'notif-1',
    type: 'like',
    actor: { id: 'u2', name: 'Amaka Eze', avatar: '' },
    content: 'interacted with your content',
    timestamp: 'Just now',
    isRead: false,
    ...partial,
  };
}

test('Notification Scenario 1: Like post routes to verified post-detail (and reels for video posts)', async () => {
  const { executeNotificationNavigation } = await import('../lib/notificationRouter.ts');
  const h1 = makeHarness();
  const res1 = await executeNotificationNavigation(
    makeNotif({ type: 'like', entityType: 'post', entityId: UUID_1, targetPostId: UUID_1 }),
    h1.actions as any,
    h1.resolvers
  );
  assert.equal(res1.status, 'navigated');
  assert.equal(h1.navigations[0].view, 'post-detail');
  assert.equal(h1.navigations[0].options?.postId, UUID_1);
  assert.equal(h1.navigations[0].options?.openComments, false);

  const h2 = makeHarness();
  const res2 = await executeNotificationNavigation(
    makeNotif({ type: 'like', entityType: 'post', entityId: UUID_5, targetPostId: UUID_5 }),
    h2.actions as any,
    h2.resolvers
  );
  assert.equal(res2.status, 'navigated');
  assert.equal(h2.navigations[0].view, 'reels');
  assert.equal(h2.navigations[0].options?.postId, UUID_5);
});

test('Notification Scenario 2: Comment on post opens post with comments drawer expanded', async () => {
  const { executeNotificationNavigation } = await import('../lib/notificationRouter.ts');
  const h = makeHarness();
  const res = await executeNotificationNavigation(
    makeNotif({
      type: 'comment',
      entityType: 'post',
      entityId: UUID_1,
      targetPostId: UUID_1,
      targetCommentId: UUID_2,
    }),
    h.actions as any,
    h.resolvers
  );
  assert.equal(res.status, 'navigated');
  assert.equal(h.navigations[0].view, 'post-detail');
  assert.equal(h.navigations[0].options?.postId, UUID_1);
  assert.equal(h.navigations[0].options?.commentId, UUID_2);
  assert.equal(h.navigations[0].options?.openComments, true);
});

test('Notification Scenario 3: Reply to comment (entity_type=comment_reply) resolves comment -> parent post & highlights reply', async () => {
  const { executeNotificationNavigation } = await import('../lib/notificationRouter.ts');
  const h = makeHarness({
    lookupCommentById: async (cid: string) =>
      cid === UUID_2
        ? { status: 'ok' as const, comment: { id: UUID_2, post_id: UUID_1, parent_comment_id: UUID_3 } }
        : { status: 'not_found' as const },
  });

  // Deliberately omit targetPostId to prove entity_id (comments.id) resolves parent post!
  const res = await executeNotificationNavigation(
    makeNotif({
      type: 'comment',
      rawType: 'comment_reply',
      entityType: 'comment_reply',
      entityId: UUID_2,
    }),
    h.actions as any,
    h.resolvers
  );

  assert.equal(res.status, 'navigated');
  assert.equal(h.navigations[0].view, 'post-detail');
  assert.equal(h.navigations[0].options?.postId, UUID_1);
  assert.equal(h.navigations[0].options?.commentId, UUID_2);
  assert.equal(h.navigations[0].options?.parentCommentId, UUID_3);
  assert.equal(h.navigations[0].options?.openComments, true);
});

test('Notification Scenario 4: Like/react to comment (entity_type=comment_reaction) resolves comment -> parent post & highlights comment', async () => {
  const { executeNotificationNavigation } = await import('../lib/notificationRouter.ts');
  const h = makeHarness({
    lookupCommentById: async (cid: string) =>
      cid === UUID_2
        ? { status: 'ok' as const, comment: { id: UUID_2, post_id: UUID_5, parent_comment_id: null } }
        : { status: 'not_found' as const },
  });

  const res = await executeNotificationNavigation(
    makeNotif({
      type: 'like',
      rawType: 'comment_reaction',
      entityType: 'comment_reaction',
      entityId: UUID_2,
    }),
    h.actions as any,
    h.resolvers
  );

  assert.equal(res.status, 'navigated');
  assert.equal(h.navigations[0].view, 'reels');
  assert.equal(h.navigations[0].options?.postId, UUID_5);
  assert.equal(h.navigations[0].options?.commentId, UUID_2);
  assert.equal(h.navigations[0].options?.openComments, true);
});

test('Notification Legacy Comment: entity_type=comment inspects comments table first then legacy posts.id without false unavailable', async () => {
  const { executeNotificationNavigation } = await import('../lib/notificationRouter.ts');
  // Case A: entity_id is a comments.id
  const hComment = makeHarness({
    lookupCommentById: async (cid: string) =>
      cid === UUID_2
        ? { status: 'ok' as const, comment: { id: UUID_2, post_id: UUID_1, parent_comment_id: null } }
        : { status: 'not_found' as const },
  });
  const resA = await executeNotificationNavigation(
    makeNotif({ type: 'comment', entityType: 'comment', entityId: UUID_2 }),
    hComment.actions as any,
    hComment.resolvers
  );
  assert.equal(resA.status, 'navigated');
  assert.equal(hComment.navigations[0].options?.postId, UUID_1);
  assert.equal(hComment.navigations[0].options?.commentId, UUID_2);

  // Case B: entity_id is actually a legacy posts.id (not in comments)
  const hPost = makeHarness();
  const resB = await executeNotificationNavigation(
    makeNotif({ type: 'comment', entityType: 'comment', entityId: UUID_1 }),
    hPost.actions as any,
    hPost.resolvers
  );
  assert.equal(resB.status, 'navigated');
  assert.equal(hPost.navigations[0].options?.postId, UUID_1);
  assert.equal(hPost.navigations[0].options?.commentId, null);
  assert.equal(hPost.navigations[0].options?.openComments, true);
});

test('Notification Scenarios 5-8: Story comment, story reaction, story view, and legacy story_like route to conversation or story viewer', async () => {
  const { executeNotificationNavigation } = await import('../lib/notificationRouter.ts');

  // 5a: story_comment with existing DM conversation
  const hReplyDm = makeHarness({
    lookupStoryCommentConvId: async () => UUID_4,
    lookupConversationById: async (convId: string) => ({
      id: convId,
      participant: mockUserB,
      lastMessage: 'Nice story!',
      lastMessageTime: '1m',
      unreadCount: 1,
      messages: [],
    }),
  });
  const resReplyDm = await executeNotificationNavigation(
    makeNotif({ type: 'story_comment', entityType: 'story_comment', entityId: UUID_3, targetStoryId: UUID_3 }),
    hReplyDm.actions as any,
    hReplyDm.resolvers
  );
  assert.equal(resReplyDm.status, 'navigated');
  assert.equal(hReplyDm.navigations[0].view, 'conversation');
  assert.equal(hReplyDm.navigations[0].options?.convId, UUID_4);

  // 5b: story_comment without DM conversation falls back cleanly to original story viewer
  const hReplyStory = makeHarness();
  const resReplyStory = await executeNotificationNavigation(
    makeNotif({ type: 'story_comment', entityType: 'story_comment', entityId: UUID_3 }),
    hReplyStory.actions as any,
    hReplyStory.resolvers
  );
  assert.equal(resReplyStory.status, 'navigated');
  assert.equal(hReplyStory.openedStories[0].storyId, UUID_3);

  // 6: story_reaction -> Reactions Activity tab
  const hReaction = makeHarness();
  await executeNotificationNavigation(
    makeNotif({ type: 'story_reaction', entityType: 'story_reaction', entityId: UUID_3 }),
    hReaction.actions as any,
    hReaction.resolvers
  );
  assert.equal(hReaction.openedStories[0].storyId, UUID_3);
  assert.equal(hReaction.openedStories[0].options?.initialInsightsOpen, true);
  assert.equal(hReaction.openedStories[0].options?.initialInsightsTab, 'reactions');

  // 7: story_view -> Viewers list tab
  const hView = makeHarness();
  await executeNotificationNavigation(
    makeNotif({ type: 'story_view', entityType: 'story_view', entityId: UUID_3 }),
    hView.actions as any,
    hView.resolvers
  );
  assert.equal(hView.openedStories[0].storyId, UUID_3);
  assert.equal(hView.openedStories[0].options?.initialInsightsOpen, true);
  assert.equal(hView.openedStories[0].options?.initialInsightsTab, 'viewers');

  // 8: legacy story_like -> opens story viewer cleanly (NEVER post-detail!)
  const hLike = makeHarness();
  const resLike = await executeNotificationNavigation(
    makeNotif({ type: 'story_like', rawType: 'story_like', entityType: 'story_like', entityId: UUID_3 }),
    hLike.actions as any,
    hLike.resolvers
  );
  assert.equal(resLike.status, 'navigated');
  assert.equal(hLike.openedStories[0].storyId, UUID_3);
  assert.equal(hLike.openedStories[0].options?.initialInsightsTab, 'reactions');
  assert.equal(hLike.navigations.length, 0);
});

test('Notification Scenario 9: Genuinely deleted content and RLS errors fail gracefully without unrelated redirects', async () => {
  const { executeNotificationNavigation } = await import('../lib/notificationRouter.ts');

  // 9a: Genuinely deleted post
  const hDeleted = makeHarness();
  const resDeleted = await executeNotificationNavigation(
    makeNotif({ type: 'like', entityType: 'post', entityId: UUID_4, targetPostId: UUID_4 }),
    hDeleted.actions as any,
    hDeleted.resolvers
  );
  assert.equal(resDeleted.status, 'not_found');
  assert.equal(hDeleted.navigations.length, 0);
  assert.match(hDeleted.toasts[0]?.message || '', /no longer available/);

  // 9b: RLS/permission error on story does NOT claim it was deleted
  const hRestricted = makeHarness({
    lookupStoryById: async () => ({
      status: 'unavailable' as const,
      reason: 'restricted' as const,
      error: 'You do not have permission to view this story.',
    }),
  });
  const resRestricted = await executeNotificationNavigation(
    makeNotif({ type: 'story_reaction', entityType: 'story_reaction', entityId: UUID_3 }),
    hRestricted.actions as any,
    hRestricted.resolvers
  );
  assert.equal(resRestricted.status, 'restricted');
  assert.equal(hRestricted.openedStories.length, 0);
  assert.match(hRestricted.toasts[0]?.message || '', /permission/i);
});

test('Notification Scenarios 10-11: Ordinary message and friend request notifications preserve exact navigation', async () => {
  const { executeNotificationNavigation } = await import('../lib/notificationRouter.ts');

  // 10: Ordinary message notification
  const hMsg = makeHarness();
  const resMsg = await executeNotificationNavigation(
    makeNotif({ type: 'message', entityType: 'message', conversationId: UUID_4 }),
    hMsg.actions as any,
    hMsg.resolvers
  );
  assert.equal(resMsg.status, 'navigated');
  assert.equal(hMsg.navigations[0].view, 'conversation');
  assert.equal(hMsg.navigations[0].options?.convId, UUID_4);

  // 11: Friend request notification
  const hFriend = makeHarness();
  const resFriend = await executeNotificationNavigation(
    makeNotif({ type: 'friend_request', entityType: 'friend_request', entityId: 'u2' }),
    hFriend.actions as any,
    hFriend.resolvers
  );
  assert.equal(resFriend.status, 'navigated');
  assert.equal(hFriend.friendTabs[0], 'requests');
  assert.equal(hFriend.navigations[0].view, 'friends');
});



