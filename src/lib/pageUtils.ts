import {
  formatPageCategoryLabel,
  toCanonicalPageCategory,
  type ActiveIdentity,
  type AdminPagesStats,
  type ManagedPageEntry,
  type Page,
  type PageCategory,
} from '../types/pages.ts';
import type { ActiveView, NotificationItem } from '../types/index.ts';

const CLOUDINARY_CLOUD_NAME = 'hwxyrhlm';

/**
 * Resolve a raw Cloudinary asset_id / public_id or full URL into a deliverable image URL.
 * Returns null if the input is blank.
 */
export function resolveCloudinaryAssetUrl(value?: string | null): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) {
    return raw;
  }
  // Relative local paths (e.g. legacy synthetic '/pwa-192x192.png') are NOT valid uploaded Page avatars
  if (raw.startsWith('/')) {
    return null;
  }
  const cleanId = raw.replace(/^\/+/, '');
  if (!cleanId) return null;
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/f_auto,q_auto/${cleanId}`;
}

/**
 * Resolve Page avatar strictly from Page columns (`avatar_url`, `avatar_path`, `avatar_asset_id`).
 * Never uses a Page owner's personal avatar URL.
 * Returns null when no real uploaded image exists (so UI displays clean initials instead).
 */
export function resolvePageAvatarUrl(row: {
  avatar_url?: string | null;
  avatar_path?: string | null;
  avatar_asset_id?: string | null;
  avatarUrl?: string | null;
}): string | null {
  const candidates = [row.avatar_url, row.avatarUrl, row.avatar_path, row.avatar_asset_id];
  for (const candidate of candidates) {
    const resolved = resolveCloudinaryAssetUrl(candidate);
    if (resolved) return resolved;
  }
  return null;
}

/**
 * Resolve Page cover strictly from Page columns (`cover_url`, `cover_path`).
 */
export function resolvePageCoverUrl(row: {
  cover_url?: string | null;
  cover_path?: string | null;
  coverUrl?: string | null;
}): string | null {
  const candidates = [row.cover_url, row.coverUrl, row.cover_path];
  for (const candidate of candidates) {
    const resolved = resolveCloudinaryAssetUrl(candidate);
    if (resolved) return resolved;
  }
  return null;
}

/**
 * Deduplicate Pages strictly by primary UUID (`id`) and secondary slug (`slug?.toLowerCase()`).
 * When duplicates exist, prefers records that have a real avatar URL, verification, or higher counts.
 */
export function dedupePages(pages: Page[]): Page[] {
  const result: Page[] = [];
  const indexById = new Map<string, number>();
  const indexBySlug = new Map<string, number>();

  const scorePage = (p: Page): number =>
    (p.avatar_url ? 8 : 0) +
    (p.cover_url ? 2 : 0) +
    (p.isVerified ? 4 : 0) +
    (p.followersCount > 0 ? 2 : 0) +
    ((p.postsCount ?? 0) > 0 ? 1 : 0);

  for (const page of pages) {
    if (!page || !page.id) continue;
    const slugKey = String(page.slug || '')
      .trim()
      .toLowerCase();

    const existingIdx =
      indexById.get(page.id) ?? (slugKey ? indexBySlug.get(slugKey) : undefined);

    if (existingIdx === undefined) {
      const idx = result.length;
      result.push(page);
      indexById.set(page.id, idx);
      if (slugKey) indexBySlug.set(slugKey, idx);
    } else {
      const existing = result[existingIdx];
      if (scorePage(page) > scorePage(existing)) {
        result[existingIdx] = page;
        indexById.set(page.id, existingIdx);
        if (slugKey) indexBySlug.set(slugKey, existingIdx);
      }
    }
  }

  return result;
}

/**
 * Deduplicate managed page entries by page UUID and slug, keeping active non-deleted pages.
 */
export function dedupeManagedPageEntries(entries: ManagedPageEntry[]): ManagedPageEntry[] {
  const seenIds = new Set<string>();
  const seenSlugs = new Set<string>();
  const out: ManagedPageEntry[] = [];

  for (const entry of entries) {
    const p = entry?.page;
    if (!p?.id) continue;
    if (p.deleted_at || p.status !== 'active' || p.isActive === false) continue;
    const slugKey = String(p.slug || '')
      .trim()
      .toLowerCase();
    if (seenIds.has(p.id) || (slugKey && seenSlugs.has(slugKey))) continue;
    seenIds.add(p.id);
    if (slugKey) seenSlugs.add(slugKey);
    out.push(entry);
  }

  return out;
}

/**
 * Exclude any Pages the user already manages (from `My Pages`) and any Pages blocking the user
 * from the `Discover Pages` list, while deduplicating by UUID and slug.
 */
export function filterDiscoverPagesExcludingManaged(
  discovered: Page[],
  managedEntries: ManagedPageEntry[],
  blockedPageIds?: Set<string>
): Page[] {
  const managedIds = new Set(managedEntries.map((e) => e.page.id).filter(Boolean));
  const managedSlugs = new Set(
    managedEntries
      .map((e) => String(e.page.slug || '').trim().toLowerCase())
      .filter(Boolean)
  );

  const eligible = discovered.filter((p) => {
    if (!p?.id) return false;
    if (p.deleted_at || p.status !== 'active' || p.isActive === false) return false;
    if (blockedPageIds?.has(p.id) || p.isBlocked) return false;
    if (managedIds.has(p.id)) return false;
    const slugKey = String(p.slug || '')
      .trim()
      .toLowerCase();
    if (slugKey && managedSlugs.has(slugKey)) return false;
    return true;
  });

  return dedupePages(eligible);
}

/**
 * Filter active, non-deleted, non-blocked Pages for the public Campus Pages Directory,
 * deduplicated by UUID and slug (retains all active Pages including those managed by viewer).
 */
export function filterPublicDirectoryPages(
  pages: Page[],
  blockedPageIds?: Set<string>
): Page[] {
  const eligible = pages.filter((p) => {
    if (!p?.id) return false;
    if (p.deleted_at || p.status !== 'active' || p.isActive === false) return false;
    if (blockedPageIds?.has(p.id) || p.isBlocked) return false;
    return true;
  });

  return dedupePages(eligible);
}

const PAGE_ONLY_VIEWS = new Set<ActiveView>([
  'page-followers',
  'page-inbox',
  'page-notifications',
  'page-settings',
  'page-workspace',
]);

const PERSONAL_ONLY_VIEWS = new Set<ActiveView>([
  'friends',
  'messages',
  'conversation',
  'contact-info',
  'alerts',
  'settings',
  'profile',
  'more',
  'events',
  'event-detail',
  'organizer-centre',
  'communities',
  'community-detail',
  'games',
  'create-page',
]);

/**
 * Normalize incompatible views deterministically when switching between Personal and Page shells.
 */
export function resolveIdentitySwitchRoute(
  currentView: ActiveView,
  nextIdentity: ActiveIdentity,
  requestedView?: ActiveView | null
): ActiveView {
  if (requestedView) {
    if (nextIdentity.type === 'personal' && PAGE_ONLY_VIEWS.has(requestedView)) {
      return 'home';
    }
    if (nextIdentity.type === 'page' && PERSONAL_ONLY_VIEWS.has(requestedView)) {
      return 'home';
    }
    return requestedView;
  }

  if (nextIdentity.type === 'personal') {
    return PAGE_ONLY_VIEWS.has(currentView) ? 'home' : currentView;
  }

  if (PERSONAL_ONLY_VIEWS.has(currentView)) {
    return 'home';
  }
  return currentView;
}

export function normalizePageRole(rawRole?: string | null): 'owner' | 'admin' | 'editor' | 'moderator' {
  const clean = String(rawRole || '').trim().toLowerCase();
  if (clean === 'owner') return 'owner';
  if (clean === 'editor') return 'editor';
  if (clean === 'moderator') return 'moderator';
  return 'admin';
}

export function formatPageRoleLabel(rawRole?: string | null): string {
  const role = normalizePageRole(rawRole);
  if (role === 'owner') return 'Owner';
  if (role === 'editor') return 'Editor';
  if (role === 'moderator') return 'Moderator';
  return 'Admin';
}

export function getPageRoleCapabilities(rawRole?: string | null) {
  const role = normalizePageRole(rawRole);
  const isOwner = role === 'owner';
  const isAdmin = role === 'admin';
  const isEditor = role === 'editor';
  const isModerator = role === 'moderator';

  return {
    role,
    canEditInfo: isOwner || isAdmin || isEditor,
    canEditHandle: isOwner,
    canManageRoles: isOwner || isAdmin,
    canTransferOwnership: isOwner,
    canEditPrivacy: isOwner || isAdmin,
    canEditMessagingSettings: isOwner || isAdmin,
    canEditNotificationPrefs: isOwner || isAdmin || isEditor || isModerator,
    canPublishPosts: isOwner || isAdmin || isEditor,
    canModeratePosts: isOwner || isAdmin || isEditor || isModerator,
    canModerateComments: isOwner || isAdmin || isEditor || isModerator,
    canManageFollowers: isOwner || isAdmin || isModerator,
    canUseInbox: isOwner || isAdmin || isEditor || isModerator,
    canRequestVerification: isOwner || isAdmin,
    canViewAuditLogs: isOwner || isAdmin,
    canExportData: isOwner || isAdmin,
    canDisableOrDelete: isOwner,
  };
}

export function getPageNameChangeRemainingDays(nameChangedAt?: string | null): number {
  if (!nameChangedAt) return 0;
  const elapsedDays = (Date.now() - new Date(nameChangedAt).getTime()) / (1000 * 60 * 60 * 24);
  if (Number.isNaN(elapsedDays) || elapsedDays >= 30) return 0;
  return Math.max(1, Math.ceil(30 - elapsedDays));
}

export function containsHiddenKeyword(text: string, hiddenWords?: string[] | null): string | null {
  const normalizedText = String(text || '').toLowerCase();
  if (!normalizedText || !Array.isArray(hiddenWords) || hiddenWords.length === 0) return null;
  for (const rawWord of hiddenWords) {
    const word = String(rawWord || '').trim().toLowerCase();
    if (word && normalizedText.includes(word)) {
      return rawWord.trim();
    }
  }
  return null;
}

/**
 * Resolve navigation destination for an in-app Page-scoped notification item.
 */
export function resolvePageNotificationRoute(
  item: Pick<NotificationItem, 'type' | 'entityType' | 'conversationId' | 'targetPostId' | 'targetPageId' | 'recipientPageId'>,
  activePageId: string
): { view: ActiveView; pageId: string; pageTab?: string; conversationId?: string | null; postId?: string | null } {
  const pageId = item.recipientPageId || item.targetPageId || activePageId;
  const rawType = String(item.type || '').toLowerCase();
  const rawEntity = String(item.entityType || '').toLowerCase();

  if (rawType === 'page_message' || rawType === 'message' || rawEntity === 'conversation' || rawEntity === 'message') {
    return { view: 'page-inbox', pageId, conversationId: item.conversationId || null };
  }
  if (rawType === 'page_follow' || rawEntity === 'page_follow') {
    return { view: 'page-followers', pageId };
  }
  if (rawType === 'page_verification_approved' || rawType === 'page_verification_rejected' || rawType === 'page_verified') {
    return { view: 'page-settings', pageId, pageTab: 'verification' };
  }
  if (
    rawType === 'page_admin_invite' ||
    rawType === 'page_admin_accepted' ||
    rawType === 'page_role_updated' ||
    rawType === 'page_ownership_transferred'
  ) {
    return { view: 'page-settings', pageId, pageTab: 'access' };
  }
  if (rawType === 'page_status') {
    return { view: 'page-settings', pageId, pageTab: 'danger' };
  }
  if (item.targetPostId) {
    return { view: 'post-detail', pageId, postId: item.targetPostId };
  }
  return { view: 'page-profile', pageId };
}

/**
 * Compute authoritative Admin Pages console counts strictly from `public.pages` rows.
 * Never counts legacy `page_applications`.
 */
export function computeAdminPagesStats(
  pageRows: Array<{
    id?: string;
    status?: string | null;
    is_active?: boolean | null;
    is_verified?: boolean | null;
    deleted_at?: string | null;
  }>,
  openReportsCount = 0
): AdminPagesStats {
  const seen = new Set<string>();
  const uniqueRows = pageRows.filter((r) => {
    if (!r?.id) return true;
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  const deletedRows = uniqueRows.filter(
    (p) => Boolean(p.deleted_at) || p.status === 'deleted'
  );
  const nonDeletedRows = uniqueRows.filter(
    (p) => !p.deleted_at && p.status !== 'deleted'
  );

  const activePages = nonDeletedRows.filter(
    (p) => (p.status || 'active') === 'active' && p.is_active !== false
  ).length;
  const disabledPages = nonDeletedRows.filter(
    (p) => p.status === 'disabled' || p.is_active === false
  ).length;
  const verifiedPages = nonDeletedRows.filter((p) => Boolean(p.is_verified)).length;

  return {
    totalPages: nonDeletedRows.length,
    activePages,
    verifiedPages,
    disabledPages,
    deletedPages: deletedRows.length,
    openReports: openReportsCount,
  };
}

/**
 * Build a safe, schema-compliant UPDATE payload for `public.pages` from Page Settings edits.
 * - Maps category cleanly to canonical DB identifier (`pages_category_allowed`)
 * - Sends ONLY permitted mutable columns
 * - Preserves untouched `avatar_url` / `cover_url` (never nulls out existing images)
 * - NEVER touches `created_by`, `is_verified`, `followers_count`, `posts_count`,
 *   `status`, `is_active`, `deleted_at`, or read-only `deletion_requested_at`.
 */
export function buildPermittedPageUpdatePayload(updates: {
  name?: string;
  description?: string | null;
  category?: PageCategory;
  location?: string | null;
  whatsapp?: string | null;
  website?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  avatar_url?: string | null;
  cover_url?: string | null;
  removeAvatar?: boolean;
  removeCover?: boolean;
  allow_messages?: boolean;
  allow_comments?: boolean;
  is_discoverable?: boolean;
  follower_interaction_mode?: string;
  default_post_visibility?: string;
  publishing_permission?: string;
  comment_permission?: string;
  messaging_permission?: string;
  message_requests_enabled?: boolean;
  welcome_message?: string | null;
  away_mode_enabled?: boolean;
  away_message?: string | null;
  inbox_access_roles?: string[];
  hidden_words?: string[];
  existingName?: string;
  nameChangedAt?: string | null;
}): { payload?: Record<string, any>; error?: string } {
  const payload: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.name !== undefined) {
    const nextName = updates.name.trim();
    if (nextName.length < 3 || nextName.length > 50) {
      return { error: 'Page name must be between 3 and 50 characters.' };
    }
    if (!updates.existingName || nextName !== updates.existingName.trim()) {
      const remaining = getPageNameChangeRemainingDays(updates.nameChangedAt);
      if (remaining > 0) {
        return {
          error: `Page name can only be changed once every 30 days. Try again in ${remaining} day(s).`,
        };
      }
      payload.name = nextName;
      payload.name_changed_at = new Date().toISOString();
    }
  }

  if (updates.description !== undefined) {
    const cleanDesc = (updates.description || '').trim();
    if (cleanDesc.length > 300) {
      return { error: 'Bio cannot exceed 300 characters.' };
    }
    payload.description = cleanDesc || null;
  }

  if (updates.category !== undefined) {
    payload.category = toCanonicalPageCategory(updates.category);
  }
  if (updates.location !== undefined) payload.location = updates.location?.trim() || null;
  if (updates.whatsapp !== undefined) payload.whatsapp = updates.whatsapp?.trim() || null;
  if (updates.website !== undefined) payload.website = updates.website?.trim() || null;
  if (updates.contact_email !== undefined) {
    payload.contact_email = updates.contact_email?.trim() || null;
  }
  if (updates.contact_phone !== undefined) {
    payload.contact_phone = updates.contact_phone?.trim() || null;
  }
  if (updates.removeAvatar) {
    payload.avatar_url = null;
  } else if (typeof updates.avatar_url === 'string' && updates.avatar_url.trim()) {
    payload.avatar_url = updates.avatar_url.trim();
  }
  if (updates.removeCover) {
    payload.cover_url = null;
  } else if (typeof updates.cover_url === 'string' && updates.cover_url.trim()) {
    payload.cover_url = updates.cover_url.trim();
  }

  if (updates.comment_permission !== undefined) {
    const perm = String(updates.comment_permission).toLowerCase();
    if (!['everyone', 'followers', 'disabled'].includes(perm)) {
      return { error: 'Invalid comment permission setting.' };
    }
    payload.comment_permission = perm;
    payload.allow_comments = perm !== 'disabled';
  } else if (updates.allow_comments !== undefined) {
    payload.allow_comments = Boolean(updates.allow_comments);
  }

  if (updates.messaging_permission !== undefined) {
    const perm = String(updates.messaging_permission).toLowerCase();
    if (!['everyone', 'followers', 'disabled'].includes(perm)) {
      return { error: 'Invalid messaging permission setting.' };
    }
    payload.messaging_permission = perm;
    payload.allow_messages = perm !== 'disabled';
  } else if (updates.allow_messages !== undefined) {
    payload.allow_messages = Boolean(updates.allow_messages);
  }

  if (updates.is_discoverable !== undefined) {
    payload.is_discoverable = Boolean(updates.is_discoverable);
  }
  if (updates.follower_interaction_mode !== undefined) {
    payload.follower_interaction_mode =
      updates.follower_interaction_mode === 'followers_only_comments'
        ? 'followers_only_comments'
        : 'open';
  }
  if (updates.default_post_visibility !== undefined) {
    payload.default_post_visibility =
      updates.default_post_visibility === 'followers' ? 'followers' : 'public';
  }
  if (updates.publishing_permission !== undefined) {
    const pub = String(updates.publishing_permission).toLowerCase();
    if (['owner_only', 'admins_only', 'admins_editors'].includes(pub)) {
      payload.publishing_permission = pub;
    }
  }
  if (updates.message_requests_enabled !== undefined) {
    payload.message_requests_enabled = Boolean(updates.message_requests_enabled);
  }
  if (updates.welcome_message !== undefined) {
    const msg = (updates.welcome_message || '').trim();
    if (msg.length > 500) return { error: 'Welcome message cannot exceed 500 characters.' };
    payload.welcome_message = msg || null;
  }
  if (updates.away_mode_enabled !== undefined) {
    payload.away_mode_enabled = Boolean(updates.away_mode_enabled);
  }
  if (updates.away_message !== undefined) {
    const msg = (updates.away_message || '').trim();
    if (msg.length > 500) return { error: 'Away message cannot exceed 500 characters.' };
    payload.away_message = msg || null;
  }
  if (Array.isArray(updates.inbox_access_roles)) {
    const allowed = updates.inbox_access_roles
      .map((r) => normalizePageRole(r))
      .filter((v, i, a) => a.indexOf(v) === i);
    if (!allowed.includes('owner')) allowed.unshift('owner');
    payload.inbox_access_roles = allowed;
  }
  if (Array.isArray(updates.hidden_words)) {
    payload.hidden_words = Array.from(
      new Set(
        updates.hidden_words
          .map((w) => String(w || '').trim().toLowerCase())
          .filter((w) => w.length > 0 && w.length <= 60)
      )
    );
  }

  return { payload };
}

export function classifyAdminVerificationError(errOrMessage: unknown): string {
  const raw =
    typeof errOrMessage === 'string'
      ? errOrMessage
      : errOrMessage && typeof errOrMessage === 'object' && 'message' in errOrMessage
      ? String((errOrMessage as any).message || '')
      : '';
  const code =
    errOrMessage && typeof errOrMessage === 'object' && 'code' in errOrMessage
      ? String((errOrMessage as any).code || '')
      : '';
  const combined = `${code} ${raw}`.toLowerCase();

  if (
    combined.includes('jwt') ||
    combined.includes('expired') ||
    combined.includes('not authenticated') ||
    combined.includes('invalid token') ||
    combined.includes('pgrst301') ||
    (combined.includes('session') && !combined.includes('permission'))
  ) {
    return 'Session expired. Please sign in again.';
  }

  if (
    combined.includes('super administrator') ||
    combined.includes('super admin') ||
    combined.includes('not authorized') ||
    combined.includes('insufficient_privilege') ||
    combined.includes('42501')
  ) {
    return 'User is not a super administrator.';
  }

  if (
    combined.includes('page not found') ||
    combined.includes('verification request not found') ||
    combined.includes('p0002') ||
    combined.includes('22p02')
  ) {
    return 'Page not found.';
  }

  if (combined.includes('permission denied')) {
    return 'Database operation failed: Administrative permission check could not be completed.';
  }

  const sanitized = raw
    .replace(/private\.[a-z0-9_]+/gi, 'restricted admin permissions')
    .replace(/schema\s+private/gi, 'restricted schema')
    .trim();
  return sanitized
    ? `Database operation failed: ${sanitized}`
    : 'Database operation failed. Please try again.';
}

export { formatPageCategoryLabel, toCanonicalPageCategory };
