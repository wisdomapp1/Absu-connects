import type { User } from './index.ts';

/**
 * ABSU Connect — Facebook-Style Pages & Legacy Applications Types
 */

export const PAGE_CATEGORY_OPTIONS = [
  { id: 'education', label: 'Education' },
  { id: 'school_department', label: 'School Department' },
  { id: 'student_union_sug', label: 'Student Union (SUG)' },
  { id: 'business_vendor', label: 'Business / Vendor' },
  { id: 'entertainment_meme_gist', label: 'Entertainment / Meme / Gist' },
  { id: 'religion_fellowship', label: 'Religion / Fellowship' },
  { id: 'sports', label: 'Sports' },
  { id: 'community', label: 'Community' },
  { id: 'other', label: 'Other' },
] as const;

export type CanonicalPageCategoryId = (typeof PAGE_CATEGORY_OPTIONS)[number]['id'];

export const NEW_PAGE_CATEGORIES = PAGE_CATEGORY_OPTIONS.map((c) => c.label);

export type NewPageCategory = (typeof PAGE_CATEGORY_OPTIONS)[number]['label'];

export type LegacyPageCategory =
  | 'business'
  | 'creator'
  | 'community'
  | 'organization'
  | 'other';

export type PageCategory = CanonicalPageCategoryId | NewPageCategory | LegacyPageCategory | string;

const CANONICAL_CATEGORY_BY_ALIAS: Record<string, CanonicalPageCategoryId> = {
  education: 'education',
  'school department': 'school_department',
  school_department: 'school_department',
  organization: 'school_department',
  department: 'school_department',
  'student union (sug)': 'student_union_sug',
  student_union_sug: 'student_union_sug',
  sug: 'student_union_sug',
  'business / vendor': 'business_vendor',
  business_vendor: 'business_vendor',
  business: 'business_vendor',
  vendor: 'business_vendor',
  'entertainment / meme / gist': 'entertainment_meme_gist',
  entertainment_meme_gist: 'entertainment_meme_gist',
  'media & news company': 'entertainment_meme_gist',
  media_news: 'entertainment_meme_gist',
  creator: 'entertainment_meme_gist',
  entertainment: 'entertainment_meme_gist',
  meme: 'entertainment_meme_gist',
  'religion / fellowship': 'religion_fellowship',
  religion_fellowship: 'religion_fellowship',
  religion: 'religion_fellowship',
  fellowship: 'religion_fellowship',
  sports: 'sports',
  sport: 'sports',
  community: 'community',
  other: 'other',
};

const LABEL_BY_CANONICAL_ID: Record<string, string> = Object.fromEntries(
  PAGE_CATEGORY_OPTIONS.map((opt) => [opt.id, opt.label])
);

/**
 * Convert any user-facing label, canonical snake_case ID, or legacy category into
 * the canonical database identifier allowed by `pages_category_allowed`.
 */
export function toCanonicalPageCategory(category?: string | null): CanonicalPageCategoryId {
  const raw = String(category || '').trim();
  if (!raw) return 'community';
  const normalized = raw.toLowerCase().replace(/\s+/g, ' ');
  if (CANONICAL_CATEGORY_BY_ALIAS[normalized]) {
    return CANONICAL_CATEGORY_BY_ALIAS[normalized];
  }
  const snake = normalized.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (CANONICAL_CATEGORY_BY_ALIAS[snake]) {
    return CANONICAL_CATEGORY_BY_ALIAS[snake];
  }
  return 'other';
}

/**
 * Format any stored DB category (canonical snake_case ID, legacy value, or human label)
 * into a clean display label.
 */
export function formatPageCategoryLabel(category?: string | null): string {
  const raw = String(category || '').trim();
  if (!raw) return 'Community';
  const lower = raw.toLowerCase();
  if (LABEL_BY_CANONICAL_ID[lower]) {
    return LABEL_BY_CANONICAL_ID[lower];
  }
  const canonical = toCanonicalPageCategory(raw);
  if (canonical !== 'other' && LABEL_BY_CANONICAL_ID[canonical]) {
    return LABEL_BY_CANONICAL_ID[canonical];
  }
  if (raw.includes('_')) {
    return raw
      .split('_')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
  return raw;
}

/**
 * Return both canonical DB identifier and display label so Discover filters match
 * rows regardless of whether older rows stored label or canonical identifier.
 */
export function getPageCategoryFilterValues(category?: string | null): string[] {
  const raw = String(category || '').trim();
  if (!raw || raw.toLowerCase() === 'all') return [];
  const canonical = toCanonicalPageCategory(raw);
  const label = formatPageCategoryLabel(canonical);
  const set = new Set<string>([canonical, label, raw]);
  if (canonical === 'entertainment_meme_gist') {
    set.add('Media & News Company');
    set.add('creator');
  } else if (canonical === 'business_vendor') {
    set.add('business');
  } else if (canonical === 'school_department') {
    set.add('organization');
  }
  return Array.from(set).filter(Boolean);
}

export type PageStatus = 'active' | 'disabled' | 'deleted';

export type CanonicalPageRole = 'owner' | 'admin' | 'editor' | 'moderator';

export type PageManagerRole = CanonicalPageRole | 'manager';

export type PageFollowerInteractionMode = 'open' | 'followers_only_comments';
export type PageDefaultPostVisibility = 'public' | 'followers';
export type PagePublishingPermission = 'owner_only' | 'admins_only' | 'admins_editors';
export type PageCommentPermission = 'everyone' | 'followers' | 'disabled';
export type PageMessagingPermission = 'everyone' | 'followers' | 'disabled';

export type PageSettingsSectionId =
  | 'info'
  | 'access'
  | 'privacy'
  | 'messaging'
  | 'notifications'
  | 'content'
  | 'followers'
  | 'verification'
  | 'activity'
  | 'data'
  | 'danger';

export interface PageRoleCapabilities {
  role: CanonicalPageRole;
  canEditInfo: boolean;
  canEditHandle: boolean;
  canManageRoles: boolean;
  canTransferOwnership: boolean;
  canEditPrivacy: boolean;
  canEditMessagingSettings: boolean;
  canEditNotificationPrefs: boolean;
  canPublishPosts: boolean;
  canModeratePosts: boolean;
  canModerateComments: boolean;
  canManageFollowers: boolean;
  canUseInbox: boolean;
  canRequestVerification: boolean;
  canViewAuditLogs: boolean;
  canExportData: boolean;
  canDisableOrDelete: boolean;
}

export interface Page {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  avatar_url?: string | null;
  cover_url?: string | null;
  avatarUrl?: string;
  coverUrl?: string;
  // Read-compat aliases for legacy components; NEVER write cover_path or deletion_requested_at to Supabase
  avatar_path?: string;
  cover_path?: string;
  avatar_asset_id?: string | null;
  category?: PageCategory;
  location?: string | null;
  whatsapp?: string | null;
  website?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  is_verified: boolean;
  isVerified?: boolean;
  status: PageStatus;
  isActive: boolean;
  is_active?: boolean;
  allow_messages: boolean;
  allowMessages?: boolean;
  allow_comments: boolean;
  allowComments?: boolean;
  is_discoverable?: boolean;
  follower_interaction_mode?: PageFollowerInteractionMode;
  default_post_visibility?: PageDefaultPostVisibility;
  publishing_permission?: PagePublishingPermission;
  comment_permission?: PageCommentPermission;
  messaging_permission?: PageMessagingPermission;
  message_requests_enabled?: boolean;
  welcome_message?: string | null;
  away_mode_enabled?: boolean;
  away_message?: string | null;
  inbox_access_roles?: CanonicalPageRole[];
  hidden_words?: string[];
  followers_count: number;
  followersCount: number;
  posts_count: number;
  postsCount?: number;
  created_by?: string | null;
  createdBy?: string | null;
  created_at: string;
  createdAt: string;
  updated_at?: string | null;
  updatedAt?: string;
  name_changed_at?: string | null;
  deleted_at?: string | null;
  // Read-only generated column in DB derived from deleted_at — NEVER include in INSERT/UPDATE payloads
  deletion_requested_at?: string | null;
  disabled_reason?: string | null;
  disabled_explanation?: string | null;
  isFollowing?: boolean;
  isBlocked?: boolean;
  managerRole?: PageManagerRole | null;
}

export interface ManagedPageEntry {
  page: Page;
  role: CanonicalPageRole;
  unreadNotificationsCount?: number;
  unreadInboxCount?: number;
}

export type ActiveIdentity =
  | { type: 'personal' }
  | {
      type: 'page';
      pageId: string;
      role: CanonicalPageRole;
      page: Page;
    };

export interface PageManager {
  page_id: string;
  user_id: string;
  role: PageManagerRole;
  created_at: string;
  user?: {
    id: string;
    display_name?: string;
    username?: string;
    avatar_url?: string;
    department?: string;
    level?: string;
    is_verified?: boolean;
  };
}

export interface PageFollower {
  page_id: string;
  user_id: string;
  created_at: string;
  user?: {
    id: string;
    display_name?: string;
    username?: string;
    avatar_url?: string;
    department?: string;
    level?: string;
  };
}

export interface PageAdminInvitation {
  id: string;
  page_id: string;
  invited_by: string;
  invited_user_id: string;
  role?: CanonicalPageRole;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  created_at: string;
  responded_at?: string | null;
  page?: Partial<Page>;
  inviter?: {
    id: string;
    display_name?: string;
    username?: string;
    avatar_url?: string;
  };
  invitee?: {
    id: string;
    display_name?: string;
    username?: string;
    avatar_url?: string;
  };
}

export interface PageFollowInvite {
  id: string;
  page_id: string;
  invited_by: string;
  invited_user_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  created_at: string;
  responded_at?: string | null;
  page?: Partial<Page>;
  inviter?: {
    id: string;
    display_name?: string;
    username?: string;
    avatar_url?: string;
  };
}

export interface PageBlock {
  page_id: string;
  user_id: string;
  blocked_by?: string | null;
  reason?: string | null;
  created_at: string;
  user?: {
    id: string;
    display_name?: string;
    username?: string;
    avatar_url?: string;
    department?: string;
  };
}

export interface PageReport {
  id: string;
  page_id: string;
  reporter_id: string;
  reason: string;
  description?: string | null;
  status: 'open' | 'pending' | 'resolved' | 'dismissed';
  admin_note?: string | null;
  resolved_by?: string | null;
  resolved_at?: string | null;
  created_at: string;
  page?: {
    id: string;
    name: string;
    slug?: string;
    avatar_url?: string;
    status?: PageStatus;
    is_verified?: boolean;
  };
  reporter?: {
    id: string;
    display_name?: string;
    username?: string;
    avatar_url?: string;
  };
}

export interface PageReelRow {
  post_id: string;
  page_id: string;
  page_name: string;
  page_avatar_url?: string | null;
  is_verified: boolean;
  created_at: string;
  secure_url: string;
  thumbnail_url?: string | null;
  duration_seconds?: number | null;
  caption?: string | null;
}

export interface PageInboxConversation {
  id: string;
  pageId: string;
  pageName: string;
  pageAvatar: string;
  pageIsVerified: boolean;
  customer: User;
  lastMessage: string;
  lastMessageTime: string;
  lastMessageAtRaw: string;
  unreadCount: number;
  allowMessages: boolean;
}

export interface AdminPagesStats {
  totalPages: number;
  activePages: number;
  verifiedPages: number;
  disabledPages: number;
  deletedPages: number;
  openReports: number;
}

export interface PageApplication {
  id: string;
  applicant_id: string;
  name: string;
  category: PageCategory;
  description: string;
  why_create: string;
  contact_email?: string;
  contact_phone?: string;
  location?: string;
  avatar_path?: string;
  cover_path?: string;
  status: 'pending' | 'approved' | 'rejected';
  review_note?: string | null;
  page_id?: string | null;
  submitted_at: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  created_at: string;
  updated_at?: string;
  applicant?: {
    id: string;
    name: string;
    avatar_url?: string;
    department?: string;
  };
}

export interface AnonymousSubmission {
  id: string;
  page_id: string;
  body: string;
  status: 'pending' | 'approved' | 'rejected';
  review_note?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  published_post_id?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface PageNotificationPreferences {
  page_id: string;
  user_id: string;
  notify_followers: boolean;
  notify_messages: boolean;
  notify_reactions: boolean;
  notify_comments: boolean;
  notify_replies: boolean;
  notify_admin_changes: boolean;
  notify_admin_invites: boolean;
  notify_verification: boolean;
  notify_security_events: boolean;
  updated_at?: string;
}

export interface PageRestrictedUser {
  page_id: string;
  user_id: string;
  restricted_by?: string | null;
  reason?: string | null;
  created_at: string;
  user?: {
    id: string;
    display_name?: string;
    username?: string;
    avatar_url?: string;
    department?: string;
  };
}

export interface PageVerificationRequest {
  id: string;
  page_id: string;
  requested_by: string;
  category: PageCategory;
  official_name: string;
  reason: string;
  evidence_url?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  review_note?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  updated_at?: string;
  page?: Partial<Page>;
  requester?: {
    id: string;
    display_name?: string;
    username?: string;
    avatar_url?: string;
  };
}

export interface PageMediaInventoryItem {
  id: string;
  kind: 'avatar' | 'cover' | 'post_image' | 'post_video';
  url: string;
  thumbnailUrl?: string | null;
  format?: string | null;
  byteSize: number;
  createdAt?: string | null;
  postId?: string | null;
}

export interface PageMediaInventory {
  totalFiles: number;
  imageCount: number;
  videoCount: number;
  totalBytes: number;
  items: PageMediaInventoryItem[];
}

export interface PageAuditLogEntry {
  id: string;
  page_id: string;
  actor_id?: string | null;
  action: string;
  details?: string | null;
  metadata?: Record<string, any> | null;
  created_at: string;
  actor?: {
    id: string;
    display_name?: string;
    username?: string;
    avatar_url?: string;
  };
}


