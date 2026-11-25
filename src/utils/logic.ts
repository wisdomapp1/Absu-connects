import type { Post, User, FeedFilter, NotificationItem } from '../types/index.ts';

/**
 * Filter posts according to selected feed tab
 */
export function filterPosts(posts: Post[], filter: FeedFilter): Post[] {
  if (filter === 'for-you') {
    return posts;
  }
  if (filter === 'friends') {
    return posts.filter(
      (p) => p.author.relationshipState === 'friends' || p.author.relationshipState === 'self'
    );
  }
  if (filter === 'campus') {
    return posts.filter(
      (p) =>
        p.category === 'Campus Update' ||
        p.categoryHashtag === '#CampusUpdates' ||
        p.audience === 'Campus Only' ||
        p.content.includes('#CampusUpdates')
    );
  }
  if (filter === 'communities') {
    return posts.filter(
      (p) =>
        Boolean(p.communityId) ||
        p.content.includes('#community_') ||
        p.category === 'Hostel Life' ||
        p.category === 'Academic'
    );
  }
  if (filter === 'events') {
    return posts.filter(
      (p) =>
        p.category === 'Event' ||
        p.categoryHashtag === '#Event' ||
        p.content.toLowerCase().includes('#event') ||
        p.content.toLowerCase().includes('#campus_event') ||
        p.content.includes('[CAMPUS EVENT]')
    );
  }
  return posts;
}

/**
 * Search users and posts by query term
 */
export function searchEntities(
  query: string,
  users: User[],
  posts: Post[]
): { users: User[]; posts: Post[] } {
  const cleanQuery = query.trim().toLowerCase();
  if (!cleanQuery) {
    return { users: [], posts: [] };
  }

  const matchedUsers = users.filter((u) => {
    return (
      u.name.toLowerCase().includes(cleanQuery) ||
      u.department.toLowerCase().includes(cleanQuery) ||
      u.faculty.toLowerCase().includes(cleanQuery) ||
      u.interests.some((interest) => interest.toLowerCase().includes(cleanQuery))
    );
  });

  const matchedPosts = posts.filter((p) => {
    return (
      p.content.toLowerCase().includes(cleanQuery) ||
      p.author.name.toLowerCase().includes(cleanQuery) ||
      p.category.toLowerCase().includes(cleanQuery)
    );
  });

  return { users: matchedUsers, posts: matchedPosts };
}

/**
 * Calculate total unread active personal notifications count (excludes archived >= 7 days and Page-scoped notifications)
 */
export function calculateUnreadCount(notifications: NotificationItem[]): number {
  return notifications.filter((n) => !n.isRead && !n.isArchived && !n.recipientPageId).length;
}

/**
 * Validate Page post attachments: up to 5 images OR 1 video, never mixing images & videos.
 */
export function validatePagePostAttachments(
  items: Array<{ isVideo: boolean }>
): { valid: boolean; error?: string } {
  if (!items || items.length === 0) return { valid: true };
  const videoCount = items.filter((i) => i.isVideo).length;
  const imageCount = items.filter((i) => !i.isVideo).length;

  if (videoCount > 0 && imageCount > 0) {
    return {
      valid: false,
      error: 'Page posts can include up to 5 photos OR 1 video — you cannot mix photos and videos in the same post.',
    };
  }
  if (videoCount > 1) {
    return {
      valid: false,
      error: 'Page posts support only 1 video (up to 60 seconds) per post.',
    };
  }
  if (imageCount > 5) {
    return {
      valid: false,
      error: 'Page posts support up to 5 photos per post.',
    };
  }
  return { valid: true };
}

/**
 * Check remaining cooldown days (out of 30) before a Page name can be changed again.
 */
export function getPageNameChangeRemainingDays(
  nameChangedAt?: string | null,
  nowMs: number = Date.now()
): number {
  if (!nameChangedAt) return 0;
  const changedTs = new Date(nameChangedAt).getTime();
  if (!Number.isFinite(changedTs)) return 0;
  const elapsedDays = (nowMs - changedTs) / (1000 * 60 * 60 * 24);
  if (elapsedDays >= 30) return 0;
  return Math.max(1, Math.ceil(30 - elapsedDays));
}

/**
 * Validate post submission text
 */
export function validatePostSubmission(content: string): { valid: boolean; error?: string } {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Post content cannot be empty' };
  }
  if (trimmed.length > 2000) {
    return { valid: false, error: 'Post content cannot exceed 2000 characters' };
  }
  return { valid: true };
}

/**
 * Toggle like status on a post
 */
export function toggleLikePost(post: Post): Post {
  const isLiked = !post.isLiked;
  const likesCount = isLiked ? post.likesCount + 1 : Math.max(0, post.likesCount - 1);
  return {
    ...post,
    isLiked,
    likesCount,
  };
}

/**
 * Validate image file selection for post attachment
 */
export function validateImageFile(file: { type: string; size: number; name?: string }): {
  valid: boolean;
  error?: string;
} {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
  let normalizedType = (file.type || '').toLowerCase().trim();
  if (!normalizedType && file.name) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) normalizedType = 'image/jpeg';
    else if (lower.endsWith('.png')) normalizedType = 'image/png';
    else if (lower.endsWith('.webp')) normalizedType = 'image/webp';
    else if (lower.endsWith('.gif')) normalizedType = 'image/gif';
    else if (lower.endsWith('.avif')) normalizedType = 'image/avif';
  }
  if (!allowedTypes.includes(normalizedType)) {
    return {
      valid: false,
      error: 'Unsupported image format. Please select a JPEG, PNG, WebP, GIF, or AVIF photo.',
    };
  }
  const maxSizeBytes = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSizeBytes) {
    return {
      valid: false,
      error: 'File size exceeds maximum 10MB limit. Please choose a smaller photo.',
    };
  }
  return { valid: true };
}

/**
 * Validate video file selection for post attachment (supports MP4, WebM, QuickTime up to 50MB)
 */
export function validateVideoFile(file: { type: string; size: number; name?: string }): {
  valid: boolean;
  error?: string;
} {
  const allowedVideoTypes = [
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-m4v',
    'video/ogg',
    'video/mov',
  ];
  let normalizedType = (file.type || '').toLowerCase().trim();
  if (!normalizedType && file.name) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.mp4') || lower.endsWith('.m4v')) normalizedType = 'video/mp4';
    else if (lower.endsWith('.webm')) normalizedType = 'video/webm';
    else if (lower.endsWith('.mov')) normalizedType = 'video/quicktime';
    else if (lower.endsWith('.ogg')) normalizedType = 'video/ogg';
  }
  if (!allowedVideoTypes.includes(normalizedType) && !normalizedType.startsWith('video/')) {
    return {
      valid: false,
      error: 'Unsupported video format. Please select an MP4, WebM, or MOV video file.',
    };
  }
  const maxVideoSizeBytes = 50 * 1024 * 1024; // 50MB
  if (file.size > maxVideoSizeBytes) {
    return {
      valid: false,
      error: 'Video file size exceeds maximum 50MB limit.',
    };
  }
  return { valid: true };
}

/**
 * Validate either image or video file
 */
export function validateMediaFile(file: { type: string; size: number; name?: string }): {
  valid: boolean;
  mediaType: 'image' | 'video';
  error?: string;
} {
  const lowerName = (file.name || '').toLowerCase();
  const isVideo =
    (file.type || '').toLowerCase().startsWith('video/') ||
    /\.(mp4|webm|mov|m4v|ogg)$/.test(lowerName);
  if (isVideo) {
    const val = validateVideoFile(file);
    return { valid: val.valid, mediaType: 'video', error: val.error };
  } else {
    const val = validateImageFile(file);
    return { valid: val.valid, mediaType: 'image', error: val.error };
  }
}

/**
 * Validate standard email format (does not restrict to absu.edu.ng)
 */
export function validateEmail(email: string): boolean {
  const trimmed = email.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(trimmed);
}

/**
 * Validate password strength (minimum 6 characters required by Supabase Auth)
 */
export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (password.length < 6) {
    return { valid: false, error: 'Password must be at least 6 characters long.' };
  }
  return { valid: true };
}

/**
 * Validate matching passwords
 */
export function validatePasswordMatch(
  password: string,
  confirm: string
): { valid: boolean; error?: string } {
  if (password !== confirm) {
    return { valid: false, error: 'Passwords do not match.' };
  }
  return { valid: true };
}
