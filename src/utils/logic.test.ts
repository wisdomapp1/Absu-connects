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
    {
      id: 'n5',
      type: 'page_follow',
      actor: { id: 'u4', name: 'Chidi', avatar: '' },
      content: 'started following your Page.',
      timestamp: '5m ago',
      isRead: false,
      isArchived: false,
      recipientPageId: 'page-123', // Isolated to Page notifications, excluded from personal count
    },
    {
      id: 'n6',
      type: 'page_message',
      actor: { id: 'p1', name: 'Campus News', avatar: '' },
      content: 'replied to your message.',
      timestamp: '2m ago',
      isRead: false,
      isArchived: false,
      targetPageId: 'page-123', // Reply from a Page to personal student without recipientPageId IS personal
    },
  ];
  // n1 (unread active), n3 (unread active), and n6 (personal notification from a Page) = 3.
  assert.equal(calculateUnreadCount(notifications), 3);
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

test('validatePagePostAttachments enforces up to 5 images OR 1 video without mixing', async () => {
  const { validatePagePostAttachments } = await import('./logic.ts');

  assert.equal(validatePagePostAttachments([]).valid, true);
  assert.equal(
    validatePagePostAttachments([
      { isVideo: false },
      { isVideo: false },
      { isVideo: false },
      { isVideo: false },
      { isVideo: false },
    ]).valid,
    true
  );
  assert.equal(validatePagePostAttachments([{ isVideo: true }]).valid, true);

  assert.equal(
    validatePagePostAttachments([
      { isVideo: false },
      { isVideo: false },
      { isVideo: false },
      { isVideo: false },
      { isVideo: false },
      { isVideo: false },
    ]).valid,
    false
  );
  assert.equal(validatePagePostAttachments([{ isVideo: true }, { isVideo: true }]).valid, false);
  assert.equal(validatePagePostAttachments([{ isVideo: false }, { isVideo: true }]).valid, false);
});

test('getPageNameChangeRemainingDays enforces 30-day Page name change cooldown', async () => {
  const { getPageNameChangeRemainingDays } = await import('./logic.ts');
  const now = Date.UTC(2026, 10, 24, 0, 0, 0);

  assert.equal(getPageNameChangeRemainingDays(null, now), 0);
  assert.equal(getPageNameChangeRemainingDays(undefined, now), 0);

  const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(getPageNameChangeRemainingDays(twoDaysAgo, now), 28);

  const thirtyOneDaysAgo = new Date(now - 31 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(getPageNameChangeRemainingDays(thirtyOneDaysAgo, now), 0);
});

test('Page category mapping round-trips canonical DB identifiers and display labels safely', async () => {
  const {
    PAGE_CATEGORY_OPTIONS,
    toCanonicalPageCategory,
    formatPageCategoryLabel,
    getPageCategoryFilterValues,
  } = await import('../types/pages.ts');

  assert.equal(toCanonicalPageCategory('Entertainment / Meme / Gist'), 'entertainment_meme_gist');
  assert.equal(formatPageCategoryLabel('entertainment_meme_gist'), 'Entertainment / Meme / Gist');

  for (const opt of PAGE_CATEGORY_OPTIONS) {
    assert.equal(toCanonicalPageCategory(opt.label), opt.id);
    assert.equal(toCanonicalPageCategory(opt.id), opt.id);
    assert.equal(formatPageCategoryLabel(opt.id), opt.label);
  }

  // Legacy category compatibility
  assert.equal(toCanonicalPageCategory('business'), 'business_vendor');
  assert.equal(toCanonicalPageCategory('organization'), 'school_department');
  assert.equal(toCanonicalPageCategory('creator'), 'entertainment_meme_gist');
  assert.equal(toCanonicalPageCategory('Unmapped Custom Category'), 'other');

  const filterVals = getPageCategoryFilterValues('Entertainment / Meme / Gist');
  assert.ok(filterVals.includes('entertainment_meme_gist'));
  assert.ok(filterVals.includes('Entertainment / Meme / Gist'));
});

test('resolvePageAvatarUrl resolves Cloudinary assets strictly from Page columns and rejects local/owner fallbacks', async () => {
  const { resolvePageAvatarUrl, resolveCloudinaryAssetUrl } = await import('../lib/pageUtils.ts');

  assert.equal(
    resolvePageAvatarUrl({ avatar_url: 'https://res.cloudinary.com/hwxyrhlm/image/upload/v1/mr_anon.jpg' }),
    'https://res.cloudinary.com/hwxyrhlm/image/upload/v1/mr_anon.jpg'
  );
  assert.equal(
    resolvePageAvatarUrl({ avatar_path: 'absu/pages/memes_lord_avatar' }),
    'https://res.cloudinary.com/hwxyrhlm/image/upload/f_auto,q_auto/absu/pages/memes_lord_avatar'
  );
  assert.equal(
    resolvePageAvatarUrl({ avatar_asset_id: 'absu/pages/logo_v2' }),
    'https://res.cloudinary.com/hwxyrhlm/image/upload/f_auto,q_auto/absu/pages/logo_v2'
  );
  // Rejects synthetic local icon path so initials fallback renders instead
  assert.equal(resolvePageAvatarUrl({ avatar_url: '/pwa-192x192.png' }), null);
  assert.equal(resolveCloudinaryAssetUrl(''), null);
  assert.equal(resolvePageAvatarUrl({ avatar_url: null, avatar_path: null, avatar_asset_id: null }), null);
});

test('dedupePages and filterDiscoverPagesExcludingManaged prevent duplicate Mr Anonymous and separate My Pages vs Discover', async () => {
  const { dedupePages, filterDiscoverPagesExcludingManaged } = await import('../lib/pageUtils.ts');
  const makePage = (overrides: Record<string, any>) => ({
    id: 'page-1',
    slug: 'memes-lord',
    name: 'Memes Lord',
    is_verified: false,
    isVerified: false,
    status: 'active' as const,
    isActive: true,
    allow_messages: true,
    allow_comments: true,
    followers_count: 10,
    followersCount: 10,
    posts_count: 2,
    postsCount: 2,
    created_at: '2026-11-20T00:00:00Z',
    createdAt: '2026-11-20T00:00:00Z',
    ...overrides,
  });

  const mrAnonNoAvatar = makePage({
    id: '0c3240e3-ae39-461d-bd7a-4963859b9bc7',
    slug: 'mr-anonymous',
    name: 'Mr Anonymous',
    avatar_url: null,
  });
  const mrAnonWithAvatar = makePage({
    id: '0c3240e3-ae39-461d-bd7a-4963859b9bc7',
    slug: 'mr-anonymous',
    name: 'Mr Anonymous',
    avatar_url: 'https://res.cloudinary.com/hwxyrhlm/image/upload/v1/mr_anon.jpg',
    is_verified: true,
    isVerified: true,
  });
  const memesLord = makePage({
    id: 'page-memes-lord',
    slug: 'memes-lord',
    name: 'Memes Lord',
  });
  const deletedPage = makePage({
    id: 'page-deleted',
    slug: 'old-page',
    name: 'Old Page',
    deleted_at: '2026-11-22T00:00:00Z',
  });
  const blockedPage = makePage({
    id: 'page-blocked',
    slug: 'blocked-page',
    name: 'Blocked Page',
  });

  const deduped = dedupePages([mrAnonNoAvatar, mrAnonWithAvatar, memesLord]);
  assert.equal(deduped.length, 2);
  assert.equal(deduped[0].avatar_url, 'https://res.cloudinary.com/hwxyrhlm/image/upload/v1/mr_anon.jpg');

  const discoverOnly = filterDiscoverPagesExcludingManaged(
    [mrAnonWithAvatar, memesLord, deletedPage, blockedPage],
    [{ page: memesLord, role: 'owner' }],
    new Set(['page-blocked'])
  );
  assert.equal(discoverOnly.length, 1);
  assert.equal(discoverOnly[0].slug, 'mr-anonymous');
});

test('computeAdminPagesStats counts active/verified/disabled accurately without double counting or counting legacy applications', async () => {
  const { computeAdminPagesStats } = await import('../lib/pageUtils.ts');

  const stats = computeAdminPagesStats(
    [
      { id: 'p1', status: 'active', is_active: true, is_verified: false, deleted_at: null },
      { id: 'p2', status: 'active', is_active: true, is_verified: false, deleted_at: null },
      // Duplicate row ID must not inflate count
      { id: 'p2', status: 'active', is_active: true, is_verified: false, deleted_at: null },
      // Soft-deleted row excluded from totalPages / activePages / disabledPages
      { id: 'p3', status: 'active', is_active: true, is_verified: true, deleted_at: '2026-11-21T00:00:00Z' },
    ],
    1
  );

  assert.equal(stats.totalPages, 2);
  assert.equal(stats.activePages, 2);
  assert.equal(stats.verifiedPages, 0);
  assert.equal(stats.disabledPages, 0);
  assert.equal(stats.deletedPages, 1);
  assert.equal(stats.openReports, 1);
});

test('buildPermittedPageUpdatePayload validates category, protects restricted fields, and preserves untouched images', async () => {
  const { buildPermittedPageUpdatePayload } = await import('../lib/pageUtils.ts');

  const res = buildPermittedPageUpdatePayload({
    name: 'Memes Lord',
    existingName: 'Memes Lord',
    category: 'Entertainment / Meme / Gist',
    description: 'Campus humor and trending gist',
    avatar_url: undefined,
    cover_url: null,
    allow_messages: true,
    allow_comments: true,
  });

  assert.ok(res.payload);
  assert.equal(res.payload?.category, 'entertainment_meme_gist');
  assert.equal('avatar_url' in (res.payload || {}), false);
  assert.equal('cover_url' in (res.payload || {}), false);
  assert.equal('deletion_requested_at' in (res.payload || {}), false);
  assert.equal('deleted_at' in (res.payload || {}), false);
  assert.equal('is_verified' in (res.payload || {}), false);
  assert.equal('created_by' in (res.payload || {}), false);
  assert.equal('name_changed_at' in (res.payload || {}), false);

  // Cooldown enforcement on name edit
  const cooldownBlocked = buildPermittedPageUpdatePayload({
    name: 'Memes Lord Renamed',
    existingName: 'Memes Lord',
    nameChangedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  });
  assert.match(cooldownBlocked.error || '', /30 days/);

  // Explicit photo removal flags clear avatar_url / cover_url cleanly
  const clearMediaRes = buildPermittedPageUpdatePayload({
    removeAvatar: true,
    removeCover: true,
  });
  assert.equal(clearMediaRes.payload?.avatar_url, null);
  assert.equal(clearMediaRes.payload?.cover_url, null);
});

test('filterPublicDirectoryPages keeps active non-deleted non-blocked managed & public Pages without duplicates', async () => {
  const { filterPublicDirectoryPages } = await import('../lib/pageUtils.ts');
  const mkPage = (overrides: Record<string, any>) => ({
    id: 'page-1',
    slug: 'campus-news',
    name: 'Campus News',
    is_verified: true,
    isVerified: true,
    status: 'active' as const,
    isActive: true,
    allow_messages: true,
    allow_comments: true,
    followers_count: 50,
    followersCount: 50,
    posts_count: 10,
    postsCount: 10,
    created_at: '2026-11-20T00:00:00Z',
    createdAt: '2026-11-20T00:00:00Z',
    ...overrides,
  });

  const activeManaged = mkPage({ id: 'p-1', slug: 'memes-lord', managerRole: 'owner' });
  const duplicateManaged = mkPage({ id: 'p-1', slug: 'memes-lord', managerRole: 'owner' });
  const disabledPage = mkPage({ id: 'p-2', slug: 'disabled-page', status: 'disabled', isActive: false });
  const deletedPage = mkPage({ id: 'p-3', slug: 'deleted-page', deleted_at: '2026-11-22T00:00:00Z' });
  const blockedPage = mkPage({ id: 'p-4', slug: 'blocked-page', isBlocked: true });
  const publicPage = mkPage({ id: 'p-5', slug: 'fellowship' });

  const list = filterPublicDirectoryPages([
    activeManaged,
    duplicateManaged,
    disabledPage,
    deletedPage,
    blockedPage,
    publicPage,
  ]);

  assert.equal(list.length, 2);
  assert.deepEqual(
    list.map((p) => p.id),
    ['p-1', 'p-5']
  );
});

test('resolveIdentitySwitchRoute normalizes incompatible Personal vs Page routes deterministically', async () => {
  const { resolveIdentitySwitchRoute } = await import('../lib/pageUtils.ts');
  const pageIdentity = {
    type: 'page' as const,
    pageId: 'page-1',
    role: 'owner' as const,
    page: { id: 'page-1', slug: 'memes', name: 'Memes' } as any,
  };
  const personalIdentity = { type: 'personal' as const };

  assert.equal(resolveIdentitySwitchRoute('friends', pageIdentity), 'home');
  assert.equal(resolveIdentitySwitchRoute('messages', pageIdentity), 'home');
  assert.equal(resolveIdentitySwitchRoute('home', pageIdentity), 'home');
  assert.equal(resolveIdentitySwitchRoute('reels', pageIdentity), 'reels');
  assert.equal(resolveIdentitySwitchRoute('page-inbox', personalIdentity), 'home');
  assert.equal(resolveIdentitySwitchRoute('page-settings', personalIdentity), 'home');
  assert.equal(resolveIdentitySwitchRoute('page-profile', personalIdentity), 'page-profile');
  assert.equal(resolveIdentitySwitchRoute('friends', pageIdentity, 'page-profile'), 'page-profile');
});

test('resolvePageNotificationRoute routes Page alerts to Page views inside Page Mode', async () => {
  const { resolvePageNotificationRoute } = await import('../lib/pageUtils.ts');

  const msgRoute = resolvePageNotificationRoute(
    { type: 'page_message', entityType: 'conversation', conversationId: 'conv-1', recipientPageId: 'p1' },
    'p1'
  );
  assert.equal(msgRoute.view, 'page-inbox');
  assert.equal(msgRoute.conversationId, 'conv-1');

  const folRoute = resolvePageNotificationRoute(
    { type: 'page_follow', entityType: 'page_follow', recipientPageId: 'p1' },
    'p1'
  );
  assert.equal(folRoute.view, 'page-followers');

  const statusRoute = resolvePageNotificationRoute(
    { type: 'page_verified', entityType: 'page', recipientPageId: 'p1' },
    'p1'
  );
  assert.equal(statusRoute.view, 'page-settings');
  assert.equal(statusRoute.pageTab, 'verification');

  const accessRoute = resolvePageNotificationRoute(
    { type: 'page_role_updated', entityType: 'page_manager', recipientPageId: 'p1' },
    'p1'
  );
  assert.equal(accessRoute.view, 'page-settings');
  assert.equal(accessRoute.pageTab, 'access');

  const dangerRoute = resolvePageNotificationRoute(
    { type: 'page_status', entityType: 'page', recipientPageId: 'p1' },
    'p1'
  );
  assert.equal(dangerRoute.view, 'page-settings');
  assert.equal(dangerRoute.pageTab, 'danger');
});

test('4-role Page RBAC normalizes legacy manager role and enforces role capabilities', async () => {
  const { normalizePageRole, formatPageRoleLabel, getPageRoleCapabilities } = await import(
    '../lib/pageUtils.ts'
  );

  assert.equal(normalizePageRole('owner'), 'owner');
  assert.equal(normalizePageRole('admin'), 'admin');
  assert.equal(normalizePageRole('editor'), 'editor');
  assert.equal(normalizePageRole('moderator'), 'moderator');
  assert.equal(normalizePageRole('manager'), 'admin');
  assert.equal(normalizePageRole(null), 'admin');

  assert.equal(formatPageRoleLabel('owner'), 'Owner');
  assert.equal(formatPageRoleLabel('editor'), 'Editor');
  assert.equal(formatPageRoleLabel('moderator'), 'Moderator');
  assert.equal(formatPageRoleLabel('manager'), 'Admin');

  const ownerCaps = getPageRoleCapabilities('owner');
  assert.equal(ownerCaps.canTransferOwnership, true);
  assert.equal(ownerCaps.canEditHandle, true);
  assert.equal(ownerCaps.canDisableOrDelete, true);
  assert.equal(ownerCaps.canPublishPosts, true);

  const adminCaps = getPageRoleCapabilities('admin');
  assert.equal(adminCaps.canTransferOwnership, false);
  assert.equal(adminCaps.canEditHandle, false);
  assert.equal(adminCaps.canDisableOrDelete, false);
  assert.equal(adminCaps.canManageRoles, true);
  assert.equal(adminCaps.canRequestVerification, true);
  assert.equal(adminCaps.canPublishPosts, true);

  const editorCaps = getPageRoleCapabilities('editor');
  assert.equal(editorCaps.canPublishPosts, true);
  assert.equal(editorCaps.canEditInfo, true);
  assert.equal(editorCaps.canModeratePosts, true);
  assert.equal(editorCaps.canManageFollowers, false);
  assert.equal(editorCaps.canManageRoles, false);
  assert.equal(editorCaps.canEditPrivacy, false);

  const modCaps = getPageRoleCapabilities('moderator');
  assert.equal(modCaps.canPublishPosts, false);
  assert.equal(modCaps.canEditInfo, false);
  assert.equal(modCaps.canModeratePosts, true);
  assert.equal(modCaps.canModerateComments, true);
  assert.equal(modCaps.canManageFollowers, true);
  assert.equal(modCaps.canUseInbox, true);
});

test('containsHiddenKeyword detects blocked keywords case-insensitively and ignores blanks', async () => {
  const { containsHiddenKeyword } = await import('../lib/pageUtils.ts');

  assert.equal(containsHiddenKeyword('Buy cheap CRYPTO now', ['  ', 'crypto', 'scam']), 'crypto');
  assert.equal(containsHiddenKeyword('Normal campus announcement', ['crypto', 'scam']), null);
  assert.equal(containsHiddenKeyword('', ['crypto']), null);
  assert.equal(containsHiddenKeyword('Hello world', null), null);
});

test('buildPermittedPageUpdatePayload validates extended settings fields and strips privileged columns', async () => {
  const { buildPermittedPageUpdatePayload } = await import('../lib/pageUtils.ts');

  const res = buildPermittedPageUpdatePayload({
    publishing_permission: 'admins_editors',
    comment_permission: 'followers',
    messaging_permission: 'disabled',
    hidden_words: [' Spam ', 'spam', 'SCAM', ''],
    inbox_access_roles: ['editor', 'moderator'],
    welcome_message: '  Welcome to ABSU Memes!  ',
    away_mode_enabled: true,
    away_message: 'We will reply by 9am.',
  });

  assert.ok(res.payload);
  assert.equal(res.payload?.publishing_permission, 'admins_editors');
  assert.equal(res.payload?.comment_permission, 'followers');
  assert.equal(res.payload?.allow_comments, true);
  assert.equal(res.payload?.messaging_permission, 'disabled');
  assert.equal(res.payload?.allow_messages, false);
  assert.deepEqual(res.payload?.hidden_words, ['spam', 'scam']);
  assert.deepEqual(res.payload?.inbox_access_roles, ['owner', 'editor', 'moderator']);
  assert.equal(res.payload?.welcome_message, 'Welcome to ABSU Memes!');
  assert.equal(res.payload?.away_mode_enabled, true);
  assert.equal(res.payload?.away_message, 'We will reply by 9am.');
  assert.equal('is_verified' in (res.payload || {}), false);
  assert.equal('deletion_requested_at' in (res.payload || {}), false);
  assert.equal('created_by' in (res.payload || {}), false);

  const invalidComment = buildPermittedPageUpdatePayload({ comment_permission: 'vip_only' });
  assert.ok(invalidComment.error);
});

test('classifyAdminVerificationError maps session, non-admin, missing page, and strips private schema names', async () => {
  const { classifyAdminVerificationError } = await import('../lib/pageUtils.ts');

  assert.equal(
    classifyAdminVerificationError({ code: 'PGRST301', message: 'JWT expired' }),
    'Session expired. Please sign in again.'
  );
  assert.equal(
    classifyAdminVerificationError('Not authenticated'),
    'Session expired. Please sign in again.'
  );
  assert.equal(
    classifyAdminVerificationError({ code: '42501', message: 'Super administrator permission required' }),
    'User is not a super administrator.'
  );
  assert.equal(
    classifyAdminVerificationError('User is not authorized for this operation'),
    'User is not a super administrator.'
  );
  assert.equal(
    classifyAdminVerificationError({ code: 'P0002', message: 'Page not found' }),
    'Page not found.'
  );
  assert.equal(
    classifyAdminVerificationError({ code: '22P02', message: 'invalid input syntax for type uuid' }),
    'Page not found.'
  );
  const permDenied = classifyAdminVerificationError('permission denied for schema private');
  assert.ok(permDenied.startsWith('Database operation failed:'));
  assert.equal(/private\./i.test(permDenied), false);

  const sanitizedLeak = classifyAdminVerificationError('relation private.app_admins does not exist');
  assert.equal(/private\./i.test(sanitizedLeak), false);
  assert.ok(sanitizedLeak.includes('Database operation failed:'));
});

test('adminSetPageVerified rejects non-UUID page IDs cleanly without throwing', async () => {
  const { adminSetPageVerified } = await import('../lib/pageService.ts');
  const res = await adminSetPageVerified('not-a-valid-uuid', true);
  assert.equal(res.success, false);
  assert.equal(res.error, 'Page not found.');
});

test('isSuperAdminEmail recognizes configured super admins and rejects ordinary student accounts', async () => {
  const { isSuperAdminEmail } = await import('../lib/adminService.ts');
  assert.equal(isSuperAdminEmail('wisdomchinonso82@gmail.com'), true);
  assert.equal(isSuperAdminEmail('  WisdomChinonso82@Gmail.com '), true);
  assert.equal(isSuperAdminEmail('natashaojiugo112@gmail.com'), true);
  assert.equal(isSuperAdminEmail('student@absu.edu.ng'), false);
  assert.equal(isSuperAdminEmail(''), false);
  assert.equal(isSuperAdminEmail(null), false);
});


