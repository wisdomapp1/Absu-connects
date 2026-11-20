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

