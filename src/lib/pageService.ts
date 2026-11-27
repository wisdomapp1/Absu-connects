import { supabase } from './supabase.ts';
import {
  formatPageCategoryLabel,
  getPageCategoryFilterValues,
  toCanonicalPageCategory,
  type CanonicalPageRole,
  type Page,
  type PageCategory,
  type PageApplication,
  type AnonymousSubmission,
  type ManagedPageEntry,
  type PageManager,
  type PageFollower,
  type PageAdminInvitation,
  type PageFollowInvite,
  type PageBlock,
  type PageReport,
  type PageInboxConversation,
  type AdminPagesStats,
  type PageStatus,
  type PageNotificationPreferences,
  type PageAuditLogEntry,
  type PageRestrictedUser,
  type PageVerificationRequest,
  type PageMediaInventory,
  type PageMediaInventoryItem,
} from '../types/pages.ts';
import type { NotificationItem, Post, PostMediaItem, User } from '../types/index.ts';
import {
  formatTimeAgo,
  mapSupabasePostToFrontend,
  resolvePostMediaUrlsOnRows,
  SupabasePostRow,
} from './postService.ts';
import { mapProfileRowToUser, SupabaseProfileRow } from './profileService.ts';
import { mapDbEnumToAppType, getPrivacySafeNotificationText, isValidUuid } from './notificationService.ts';
import {
  buildPermittedPageUpdatePayload,
  classifyAdminVerificationError,
  computeAdminPagesStats,
  dedupeManagedPageEntries,
  dedupePages,
  normalizePageRole,
  resolvePageAvatarUrl,
  resolvePageCoverUrl,
} from './pageUtils.ts';
import { ensureAuthenticatedSession } from './adminService.ts';

// Hardcoded canonical ID for Mr Anonymous from DB inspection
export const MR_ANONYMOUS_SLUG = 'mr-anonymous';
export const MR_ANONYMOUS_PAGE_ID = '0c3240e3-ae39-461d-bd7a-4963859b9bc7';
export const MR_ANONYMOUS_DUMMY_ID = 'b4f38505-fce6-44be-8727-8ebf04eb2ceb';

// Share in-flight read promises across simultaneous component mounts to eliminate duplicate request storms
const inFlightReadRequests = new Map<string, Promise<any>>();

function withInFlightDedup<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const existing = inFlightReadRequests.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const pending = loader().finally(() => {
    inFlightReadRequests.delete(key);
  });
  inFlightReadRequests.set(key, pending);
  return pending;
}

async function getAuthToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  } catch {
    return null;
  }
}

async function parseApiJson(res: Response | null): Promise<any | null> {
  if (!res) return null;
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (!ct.includes('application/json')) return null;
  return await res.json().catch(() => null);
}

export function getPageDefaultAvatar(name: string): string {
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
    name || 'Page'
  )}&backgroundColor=6d45d9&textColor=ffffff`;
}

export function mapSupabasePageRowToPage(
  row: Record<string, any>,
  opts?: {
    isFollowing?: boolean;
    isBlocked?: boolean;
    managerRole?: CanonicalPageRole | 'manager' | null;
    followersCountOverride?: number;
    postsCountOverride?: number;
    includePrivateMeta?: boolean;
  }
): Page {
  const status: PageStatus =
    row.deleted_at || row.status === 'deleted'
      ? 'deleted'
      : row.status === 'disabled' || row.is_active === false
      ? 'disabled'
      : 'active';

  // Resolve strictly from Page avatar fields — never owner avatar, no forced synthetic image URL
  const avatarUrl = resolvePageAvatarUrl(row);
  const coverUrl = resolvePageCoverUrl(row);
  const followersCount =
    opts?.followersCountOverride ??
    (typeof row.followers_count === 'number'
      ? row.followers_count
      : typeof row.follower_count === 'number'
      ? row.follower_count
      : 0);
  const postsCount =
    opts?.postsCountOverride ??
    (typeof row.posts_count === 'number'
      ? row.posts_count
      : typeof row.post_count === 'number'
      ? row.post_count
      : 0);
  const deletedAt = row.deleted_at ?? null;
  const commentPerm =
    row.comment_permission === 'followers' || row.comment_permission === 'disabled'
      ? row.comment_permission
      : row.allow_comments === false
      ? 'disabled'
      : 'everyone';
  const messagingPerm =
    row.messaging_permission === 'followers' || row.messaging_permission === 'disabled'
      ? row.messaging_permission
      : row.allow_messages === false
      ? 'disabled'
      : 'everyone';

  return {
    id: row.id,
    slug: row.slug || row.id,
    name: row.name || 'ABSU Page',
    description: row.description ?? null,
    avatar_url: avatarUrl,
    cover_url: coverUrl,
    avatarUrl: avatarUrl || undefined,
    coverUrl: coverUrl || undefined,
    avatar_path: avatarUrl || undefined,
    cover_path: coverUrl || undefined,
    avatar_asset_id: row.avatar_asset_id ?? null,
    category: formatPageCategoryLabel(row.category),
    location: row.location ?? null,
    whatsapp: row.whatsapp ?? null,
    website: row.website ?? null,
    contact_email: row.contact_email ?? null,
    contact_phone: row.contact_phone ?? null,
    is_verified: Boolean(row.is_verified),
    isVerified: Boolean(row.is_verified),
    status,
    isActive: status === 'active',
    is_active: status === 'active',
    allow_messages: row.allow_messages !== false && messagingPerm !== 'disabled',
    allowMessages: row.allow_messages !== false && messagingPerm !== 'disabled',
    allow_comments: row.allow_comments !== false && commentPerm !== 'disabled',
    allowComments: row.allow_comments !== false && commentPerm !== 'disabled',
    is_discoverable: row.is_discoverable !== false,
    follower_interaction_mode:
      row.follower_interaction_mode === 'followers_only_comments'
        ? 'followers_only_comments'
        : 'open',
    default_post_visibility:
      row.default_post_visibility === 'followers' ? 'followers' : 'public',
    publishing_permission:
      row.publishing_permission === 'owner_only' || row.publishing_permission === 'admins_only'
        ? row.publishing_permission
        : 'admins_editors',
    comment_permission: commentPerm,
    messaging_permission: messagingPerm,
    message_requests_enabled: Boolean(row.message_requests_enabled),
    welcome_message: row.welcome_message ?? null,
    away_mode_enabled: Boolean(row.away_mode_enabled),
    away_message: row.away_message ?? null,
    inbox_access_roles: Array.isArray(row.inbox_access_roles)
      ? row.inbox_access_roles.map((r: string) => normalizePageRole(r))
      : ['owner', 'admin', 'editor', 'moderator'],
    hidden_words: Array.isArray(row.hidden_words) ? row.hidden_words : [],
    followers_count: followersCount,
    followersCount,
    posts_count: postsCount,
    postsCount,
    // Keep creator private unless explicitly requested inside authorized manager/admin context
    created_by: opts?.includePrivateMeta ? row.created_by ?? null : undefined,
    createdBy: opts?.includePrivateMeta ? row.created_by ?? undefined : undefined,
    created_at: row.created_at || new Date().toISOString(),
    createdAt: row.created_at || new Date().toISOString(),
    updated_at: row.updated_at ?? null,
    updatedAt: row.updated_at ?? undefined,
    name_changed_at: row.name_changed_at ?? null,
    deleted_at: deletedAt,
    deletion_requested_at: deletedAt ?? row.deletion_requested_at ?? null,
    disabled_reason: opts?.includePrivateMeta
      ? row.disabled_reason ?? null
      : status === 'disabled'
      ? row.disabled_reason ?? null
      : null,
    disabled_explanation: opts?.includePrivateMeta ? row.disabled_explanation ?? null : null,
    isFollowing: opts?.isFollowing ?? false,
    isBlocked: opts?.isBlocked ?? false,
    managerRole: opts?.managerRole ? normalizePageRole(opts.managerRole) : null,
  };
}

function isPagesPermissionError(error: any): boolean {
  if (!error) return false;
  const code = String(error.code || '').trim();
  const msg = String(error.message || '').toLowerCase();
  return (
    code === '42501' ||
    msg.includes('permission denied') ||
    msg.includes('row-level security') ||
    msg.includes('insufficient_privilege')
  );
}

/**
 * Fetch real Mr Anonymous database record with live follower count, published post count,
 * and follow state. Never fabricates a synthetic duplicate Page if no row is accessible.
 */
export async function fetchMrAnonymousPage(currentUserId?: string): Promise<Page | null> {
  return withInFlightDedup(`mr-anon:${currentUserId || 'anon'}`, async () => {
    try {
      const token = currentUserId ? await getAuthToken() : null;
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

      // 1. Direct Supabase query for authoritative real row
      let { data: pageRow, error: pageErr } = await supabase
        .from('pages')
        .select('*')
        .eq('slug', MR_ANONYMOUS_SLUG)
        .is('deleted_at', null)
        .maybeSingle();

      if (!pageRow && !pageErr) {
        const byIdRes = await supabase
          .from('pages')
          .select('*')
          .eq('id', MR_ANONYMOUS_PAGE_ID)
          .is('deleted_at', null)
          .maybeSingle();
        pageRow = byIdRes.data;
        pageErr = byIdRes.error;
      }

      if (pageErr || !pageRow) {
        // Fallback to Express backend only if mounted (returns null cleanly on static deployment)
        const apiRes = await fetch(`/api/pages/${MR_ANONYMOUS_SLUG}`, { headers }).catch(() => null);
        const apiJson = apiRes?.ok ? await parseApiJson(apiRes) : null;
        if (apiJson?.success && apiJson.page) {
          const mappedApi = mapSupabasePageRowToPage(apiJson.page, {
            followersCountOverride: apiJson.followersCount,
            postsCountOverride: apiJson.postsCount,
            isFollowing: Boolean(apiJson.isFollowing),
            isBlocked: Boolean(apiJson.isBlocked),
            managerRole: apiJson.managerRole ?? null,
            includePrivateMeta: Boolean(apiJson.managerRole),
          });
          if (mappedApi.status !== 'active' || mappedApi.isBlocked) return null;
          return mappedApi;
        }
        return null;
      }

      if (pageRow.status !== 'active' || pageRow.is_active === false || pageRow.deleted_at) {
        return null;
      }

      const [{ count: followersCount }, { count: postsCount }, followRes, blockRes] = await Promise.all([
        supabase
          .from('page_followers')
          .select('*', { count: 'exact', head: true })
          .eq('page_id', pageRow.id),
        supabase
          .from('posts')
          .select('*', { count: 'exact', head: true })
          .or(`page_id.eq.${pageRow.id},author_page_id.eq.${pageRow.id},author_id.eq.${MR_ANONYMOUS_DUMMY_ID}`),
        currentUserId
          ? supabase
              .from('page_followers')
              .select('page_id')
              .eq('page_id', pageRow.id)
              .eq('user_id', currentUserId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        currentUserId
          ? supabase
              .from('page_blocks')
              .select('user_id')
              .eq('page_id', pageRow.id)
              .eq('user_id', currentUserId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      if ((blockRes as any)?.data) return null;

      return mapSupabasePageRowToPage(pageRow, {
        followersCountOverride: followersCount ?? pageRow.followers_count ?? 0,
        postsCountOverride: postsCount ?? pageRow.posts_count ?? 0,
        isFollowing: Boolean((followRes as any)?.data),
      });
    } catch {
      return null;
    }
  });
}

/**
 * Verify in real time against live Supabase `page_managers` (or Page creator / legacy manager)
 * whether the given user manages `pageId`. Fails closed on error.
 */
export async function verifyUserManagesPage(
  pageId: string,
  userId: string
): Promise<{ manages: boolean; role: CanonicalPageRole | null; page: Page | null }> {
  if (!pageId || !userId) return { manages: false, role: null, page: null };
  try {
    const [{ data: mgrRow }, { data: pageRow, error: pageErr }] = await Promise.all([
      supabase
        .from('page_managers')
        .select('role')
        .eq('page_id', pageId)
        .eq('user_id', userId)
        .maybeSingle(),
      supabase.from('pages').select('*').eq('id', pageId).maybeSingle(),
    ]);

    if (pageErr || !pageRow) {
      if (pageId === MR_ANONYMOUS_PAGE_ID) {
        const isAnonMgr = await checkIsPageManager(pageId, userId);
        if (isAnonMgr) {
          const anonPage = await fetchMrAnonymousPage(userId);
          if (anonPage) {
            return { manages: true, role: 'admin', page: anonPage };
          }
        }
      }
      return { manages: false, role: null, page: null };
    }

    let role: CanonicalPageRole | null = mgrRow?.role ? normalizePageRole(mgrRow.role) : null;

    if (!role && pageRow.created_by === userId) {
      role = 'owner';
    }
    if (!role && pageId === MR_ANONYMOUS_PAGE_ID) {
      const isAnonMgr = await checkIsPageManager(pageId, userId);
      if (isAnonMgr) role = 'admin';
    }
    if (!role) return { manages: false, role: null, page: null };

    const mapped = mapSupabasePageRowToPage(pageRow, {
      managerRole: role,
      includePrivateMeta: true,
    });
    if (mapped.status !== 'active') {
      return { manages: false, role: null, page: mapped };
    }

    return { manages: true, role, page: mapped };
  } catch {
    return { manages: false, role: null, page: null };
  }
}

/**
 * Fetch all active/managed Pages for the current user along with unread notification & inbox counts.
 * Includes explicit `page_managers` entries and Pages owned via `created_by`, deduplicated by UUID/slug.
 */
export async function fetchManagedPages(userId: string): Promise<ManagedPageEntry[]> {
  if (!userId) return [];
  return withInFlightDedup(`managed-pages:${userId}`, async () => {
    try {
      const [mgrRes, ownedRes] = await Promise.all([
        supabase.from('page_managers').select('page_id, role, created_at').eq('user_id', userId),
        supabase
          .from('pages')
          .select('*')
          .eq('created_by', userId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
      ]);

      const roleByPage = new Map<string, CanonicalPageRole>();
      const pageMap = new Map<string, any>();

      for (const r of (ownedRes.data || []) as any[]) {
        if (!r?.id || r.deleted_at || r.status === 'deleted') continue;
        pageMap.set(r.id, r);
        roleByPage.set(r.id, 'owner');
      }

      for (const r of (mgrRes.data || []) as Array<{ page_id: string; role: string }>) {
        if (!r?.page_id) continue;
        const normalized = normalizePageRole(r.role);
        if (!roleByPage.has(r.page_id) || normalized === 'owner') {
          roleByPage.set(r.page_id, normalized);
        }
      }

      const missingIds = Array.from(roleByPage.keys()).filter((id) => !pageMap.has(id));
      if (missingIds.length > 0) {
        const { data: extraPages } = await supabase
          .from('pages')
          .select('*')
          .in('id', missingIds)
          .is('deleted_at', null)
          .order('created_at', { ascending: false });

        for (const p of (extraPages || []) as any[]) {
          if (p?.id && !p.deleted_at && p.status !== 'deleted') pageMap.set(p.id, p);
        }
      }

      const allPageIds = Array.from(pageMap.keys());
      if (allPageIds.length === 0) return [];

      // Authoritative unread Page notifications & Page Inbox counts scoped by recipient_page_id / page_id
      const notifUnreadMap = new Map<string, number>();
      const inboxUnreadMap = new Map<string, number>();

      await Promise.all([
        (async () => {
          try {
            let { data: unreadNotifs, error: nErr } = await supabase
              .from('notifications')
              .select('id, recipient_page_id, target_page_id')
              .eq('recipient_id', userId)
              .in('recipient_page_id', allPageIds)
              .is('read_at', null);

            if (nErr && (nErr.message || '').toLowerCase().includes('recipient_page_id')) {
              const fallbackNotifs = await supabase
                .from('notifications')
                .select('id, target_page_id')
                .eq('recipient_id', userId)
                .in('target_page_id', allPageIds)
                .is('read_at', null);
              unreadNotifs = fallbackNotifs.data as any;
            }

            for (const n of (unreadNotifs || []) as Array<{
              recipient_page_id?: string | null;
              target_page_id?: string | null;
            }>) {
              const pid = n.recipient_page_id || n.target_page_id;
              if (pid) {
                notifUnreadMap.set(pid, (notifUnreadMap.get(pid) || 0) + 1);
              }
            }
          } catch {
            // Non-blocking fallback
          }
        })(),
        (async () => {
          try {
            const [{ data: pageConvs }, { data: readRows }] = await Promise.all([
              supabase
                .from('conversations')
                .select('id, page_id')
                .eq('is_page_chat', true)
                .in('page_id', allPageIds),
              supabase
                .from('page_conversation_reads')
                .select('conversation_id, page_id, last_read_at')
                .in('page_id', allPageIds),
            ]);

            const convList = (pageConvs || []) as Array<{ id: string; page_id: string }>;
            if (convList.length === 0) return;

            const pageByConv = new Map<string, string>();
            for (const c of convList) {
              if (c.id && c.page_id) pageByConv.set(c.id, c.page_id);
            }
            const convIds = Array.from(pageByConv.keys());
            const readByConv = new Map<string, string | null>();
            for (const r of (readRows || []) as Array<{
              conversation_id: string;
              last_read_at?: string | null;
            }>) {
              readByConv.set(r.conversation_id, r.last_read_at || null);
            }

            const { data: incomingMsgs } = await supabase
              .from('messages')
              .select('conversation_id, created_at')
              .in('conversation_id', convIds)
              .eq('sender_as_page', false)
              .is('deleted_at', null)
              .order('created_at', { ascending: false })
              .limit(600);

            for (const m of (incomingMsgs || []) as Array<{
              conversation_id: string;
              created_at: string;
            }>) {
              const pid = pageByConv.get(m.conversation_id);
              if (!pid) continue;
              const lastRead = readByConv.get(m.conversation_id);
              if (!lastRead || new Date(m.created_at).getTime() > new Date(lastRead).getTime()) {
                inboxUnreadMap.set(pid, (inboxUnreadMap.get(pid) || 0) + 1);
              }
            }
          } catch {
            // Non-blocking fallback
          }
        })(),
      ]);

      const mappedEntries = Array.from(pageMap.values())
        .filter((r: any) => !r.deleted_at && r.status !== 'deleted')
        .map((r: any) => {
          const role = roleByPage.get(r.id) || 'admin';
          return {
            page: mapSupabasePageRowToPage(r, {
              managerRole: role,
              includePrivateMeta: true,
            }),
            role,
            unreadNotificationsCount: notifUnreadMap.get(r.id) || 0,
            unreadInboxCount: inboxUnreadMap.get(r.id) || 0,
          };
        });

      return dedupeManagedPageEntries(mappedEntries);
    } catch (err) {
      if (!isPagesPermissionError(err)) {
        console.warn('[PageService] fetchManagedPages error:', err);
      }
      return [];
    }
  });
}

/**
 * Legacy helper alias used in existing code
 */
export async function fetchUserManagedPages(userId: string): Promise<Page[]> {
  const entries = await fetchManagedPages(userId);
  return entries.map((e) => e.page);
}

/**
 * Fetch full details for any Page by ID or slug cleanly (public view omits `created_by`).
 * Works identically for both already-existing Pages (e.g. Mr Anonymous) and newly created Pages.
 */
export async function fetchPageById(
  pageIdOrSlug: string,
  currentUserId?: string
): Promise<{
  page: Page | null;
  unavailable?: boolean;
  reason?: string;
}> {
  if (!pageIdOrSlug) return { page: null, unavailable: true };
  return withInFlightDedup(`page-by-id:${pageIdOrSlug}:${currentUserId || 'anon'}`, async () => {
    try {
      const isUuid = isValidUuid(pageIdOrSlug);
      const { data: pageRow, error } = await supabase
        .from('pages')
        .select('*')
        .eq(isUuid ? 'id' : 'slug', pageIdOrSlug)
        .maybeSingle();

      if (error || !pageRow) {
        // Fallback to Express server only when mounted
        const token = currentUserId ? await getAuthToken() : null;
        const apiRes = await fetch(`/api/pages/${encodeURIComponent(pageIdOrSlug)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }).catch(() => null);
        const apiJson = apiRes?.ok ? await parseApiJson(apiRes) : null;
        if (apiJson?.success && apiJson.page) {
          const mappedApi = mapSupabasePageRowToPage(apiJson.page, {
            followersCountOverride: apiJson.followersCount,
            postsCountOverride: apiJson.postsCount,
            isFollowing: Boolean(apiJson.isFollowing),
            isBlocked: Boolean(apiJson.isBlocked),
            managerRole: apiJson.managerRole ?? null,
            includePrivateMeta: Boolean(apiJson.managerRole),
          });
          return {
            page: mappedApi,
            unavailable: mappedApi.status !== 'active',
            reason: mappedApi.status !== 'active' ? mappedApi.status : undefined,
          };
        }

        return { page: null, unavailable: true, reason: 'not_found' };
      }

      const pid = pageRow.id;
      let isFollowing = false;
      let isBlocked = false;
      let managerRole: CanonicalPageRole | null = null;

      const postFilter =
        pid === MR_ANONYMOUS_PAGE_ID
          ? `page_id.eq.${pid},author_page_id.eq.${pid},author_id.eq.${MR_ANONYMOUS_DUMMY_ID}`
          : `page_id.eq.${pid},author_page_id.eq.${pid}`;

      const [followersRes, postsRes, followRes, mgrRes, blockRes] = await Promise.all([
        supabase.from('page_followers').select('*', { count: 'exact', head: true }).eq('page_id', pid),
        supabase.from('posts').select('*', { count: 'exact', head: true }).or(postFilter),
        currentUserId
          ? supabase
              .from('page_followers')
              .select('page_id')
              .eq('page_id', pid)
              .eq('user_id', currentUserId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        currentUserId
          ? supabase
              .from('page_managers')
              .select('role')
              .eq('page_id', pid)
              .eq('user_id', currentUserId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        currentUserId
          ? supabase
              .from('page_blocks')
              .select('user_id')
              .eq('page_id', pid)
              .eq('user_id', currentUserId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      isFollowing = Boolean((followRes as any)?.data);
      isBlocked = Boolean((blockRes as any)?.data);
      const rawRole = String((mgrRes as any)?.data?.role || '').toLowerCase();
      if (rawRole) managerRole = normalizePageRole(rawRole);
      else if (currentUserId && pageRow.created_by === currentUserId) managerRole = 'owner';
      else if (currentUserId && pid === MR_ANONYMOUS_PAGE_ID) {
        const isAnonMgr = await checkIsPageManager(pid, currentUserId);
        if (isAnonMgr) managerRole = 'admin';
      }

      const mapped = mapSupabasePageRowToPage(pageRow, {
        isFollowing,
        isBlocked,
        managerRole,
        followersCountOverride: followersRes.count ?? pageRow.followers_count ?? 0,
        postsCountOverride: postsRes.count ?? pageRow.posts_count ?? 0,
        includePrivateMeta: Boolean(managerRole),
      });

      if (mapped.status !== 'active' || mapped.deleted_at) {
        return { page: mapped, unavailable: true, reason: mapped.status };
      }

      return { page: mapped, unavailable: false };
    } catch (err) {
      if (!isPagesPermissionError(err)) {
        console.warn('[PageService] fetchPageById error:', err);
      }
      return { page: null, unavailable: true };
    }
  });
}

/**
 * Fetch IDs of all Pages followed by the current user
 */
export async function fetchFollowedPageIds(userId?: string): Promise<Set<string>> {
  if (!userId) return new Set();
  return withInFlightDedup(`followed-page-ids:${userId}`, async () => {
    try {
      const { data, error } = await supabase
        .from('page_followers')
        .select('page_id')
        .eq('user_id', userId);
      if (error || !data) return new Set();
      return new Set(data.map((r: any) => r.page_id).filter(Boolean));
    } catch {
      return new Set();
    }
  });
}

/**
 * Fetch IDs of Pages that have blocked the current user
 */
export async function fetchBlockedPageIds(userId?: string): Promise<Set<string>> {
  if (!userId) return new Set();
  return withInFlightDedup(`blocked-page-ids:${userId}`, async () => {
    try {
      const { data, error } = await supabase
        .from('page_blocks')
        .select('page_id')
        .eq('user_id', userId);
      if (error || !data) return new Set();
      return new Set(data.map((r: any) => r.page_id).filter(Boolean));
    } catch {
      return new Set();
    }
  });
}

/**
 * Discover active Pages across ABSU Connect.
 * - Queries all active, non-deleted Pages (`status='active' AND is_active=true AND deleted_at IS NULL`)
 * - Never filters by `created_by`
 * - Respects `page_blocks`
 * - Deduplicates strictly by `id` (UUID) then `slug`
 * - Never injects synthetic fallback Pages
 */
export async function discoverPages(params?: {
  currentUserId?: string;
  category?: string;
  search?: string;
  limit?: number;
  excludeMrAnonymous?: boolean;
}): Promise<Page[]> {
  const key = `discover-pages:${params?.currentUserId || 'anon'}:${params?.category || 'All'}:${
    params?.search || ''
  }:${params?.limit ?? 40}:${Boolean(params?.excludeMrAnonymous)}`;

  return withInFlightDedup(key, async () => {
    try {
      let query = supabase
        .from('pages')
        .select('*')
        .eq('status', 'active')
        .eq('is_active', true)
        .is('deleted_at', null);

      if (params?.excludeMrAnonymous) {
        query = query.neq('id', MR_ANONYMOUS_PAGE_ID);
      }
      if (params?.category && params.category !== 'All') {
        const catFilterValues = getPageCategoryFilterValues(params.category);
        if (catFilterValues.length > 0) {
          query = query.in('category', catFilterValues);
        }
      }
      if (params?.search && params.search.trim()) {
        const q = params.search.trim().replace(/[,%()]/g, ' ').trim();
        if (q) {
          query = query.or(
            `name.ilike.%${q}%,slug.ilike.%${q}%,category.ilike.%${q}%,description.ilike.%${q}%`
          );
        }
      }

      const [pagesRes, followedSet, blockedSet] = await Promise.all([
        query
          .order('is_verified', { ascending: false })
          .order('followers_count', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(params?.limit ?? 40),
        params?.currentUserId ? fetchFollowedPageIds(params.currentUserId) : Promise.resolve(new Set<string>()),
        params?.currentUserId ? fetchBlockedPageIds(params.currentUserId) : Promise.resolve(new Set<string>()),
      ]);

      if (pagesRes.error) {
        // Fallback strictly to Express API when mounted
        const qs = new URLSearchParams();
        if (params?.category) qs.set('category', params.category);
        if (params?.search) qs.set('search', params.search);
        if (params?.limit) qs.set('limit', String(params.limit));
        const apiRes = await fetch(`/api/pages?${qs.toString()}`).catch(() => null);
        const apiJson = apiRes?.ok ? await parseApiJson(apiRes) : null;
        if (apiJson?.success && Array.isArray(apiJson.pages)) {
          const mappedFromApi = apiJson.pages
            .filter((r: any) => !params?.excludeMrAnonymous || r.id !== MR_ANONYMOUS_PAGE_ID)
            .filter((r: any) => !blockedSet.has(r.id) && !r.deleted_at && r.status === 'active' && r.is_active !== false)
            .map((row: any) =>
              mapSupabasePageRowToPage(row, {
                isFollowing: followedSet.has(row.id),
                isBlocked: blockedSet.has(row.id),
              })
            );
          return dedupePages(mappedFromApi);
        }
        return [];
      }

      if (!pagesRes.data) return [];

      const mapped = pagesRes.data
        .filter((r: any) => !blockedSet.has(r.id) && r.is_discoverable !== false)
        .map((row: any) =>
          mapSupabasePageRowToPage(row, {
            isFollowing: followedSet.has(row.id),
            isBlocked: blockedSet.has(row.id),
          })
        );

      return dedupePages(mapped);
    } catch (err) {
      if (!isPagesPermissionError(err)) {
        console.warn('[PageService] discoverPages error:', err);
      }
      return [];
    }
  });
}

export async function searchPages(
  queryText: string,
  currentUserId?: string,
  limit = 20
): Promise<Page[]> {
  return discoverPages({ currentUserId, search: queryText, limit });
}

/**
 * Create a new Facebook-style ABSU Connect Page directly via RPC `create_page`.
 * NOTE: `create_page` only accepts metadata (name, category, description, slug, location, whatsapp, website).
 * Avatar & cover uploads happen IMMEDIATELY AFTER using `uploadPageMediaToCloudinary(file, purpose, pageId)`
 * followed by `updatePageDetails(pageId, { avatar_url, cover_url })`.
 */
export async function createNewPage(params: {
  name: string;
  category: PageCategory;
  description?: string;
  slug?: string;
  location?: string;
  whatsapp?: string;
  website?: string;
}): Promise<{ success: boolean; pageId?: string; slug?: string; error?: string }> {
  const cleanName = params.name.trim();
  if (cleanName.length < 3 || cleanName.length > 50) {
    return { success: false, error: 'Page name must be between 3 and 50 characters.' };
  }
  const cleanDesc = (params.description || '').trim();
  if (cleanDesc.length > 300) {
    return { success: false, error: 'Bio / description cannot exceed 300 characters.' };
  }

  let cleanSlug: string | null = null;
  if (params.slug && params.slug.trim()) {
    cleanSlug = params.slug
      .trim()
      .toLowerCase()
      .replace(/^@+/, '')
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    if (cleanSlug.length < 3) {
      return { success: false, error: 'Username must be at least 3 characters (letters, numbers, -, _).' };
    }
  }

  try {
    const rpcPayload: Record<string, any> = {
      p_name: cleanName,
      p_category: toCanonicalPageCategory(params.category),
      p_description: cleanDesc || null,
      p_slug: cleanSlug,
      p_location: (params.location || 'Uturu, Abia State').trim() || 'Uturu, Abia State',
      p_whatsapp: params.whatsapp?.trim() || null,
      p_website: params.website?.trim() || null,
    };

    const { data, error } = await supabase.rpc('create_page', rpcPayload);
    if (error) {
      const msg = error.message || 'Could not create Page.';
      if (/duplicate|already exists|unique/i.test(msg)) {
        return { success: false, error: 'That Page username is already taken. Try another one.' };
      }
      return { success: false, error: msg };
    }

    const pageId =
      typeof data === 'string'
        ? data
        : typeof data?.id === 'string'
        ? data.id
        : typeof data?.page_id === 'string'
        ? data.page_id
        : '';

    if (!pageId) {
      return { success: false, error: 'Page was created but no ID was returned.' };
    }

    return {
      success: true,
      pageId,
      slug: cleanSlug || pageId,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unexpected error creating Page.',
    };
  }
}

/**
 * Update Page profile, contact info, Cloudinary image URLs, or messaging/comment settings.
 * Sends ONLY permitted mutable columns (`name`, `name_changed_at`, `category` canonical DB ID,
 * `description`, `location`, `whatsapp`, `website`, `allow_messages`, `allow_comments`, plus
 * changed `avatar_url`/`cover_url`). Never writes read-only or protected system columns.
 */
export async function updatePageDetails(
  pageId: string,
  updates: {
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
  }
): Promise<{ success: boolean; page?: Page; error?: string }> {
  try {
    const built = buildPermittedPageUpdatePayload(updates);
    if (built.error || !built.payload) {
      return { success: false, error: built.error || 'Invalid Page update payload.' };
    }

    const { data, error } = await supabase
      .from('pages')
      .update(built.payload)
      .eq('id', pageId)
      .select('*')
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message };
    }
    if (!data) {
      return { success: false, error: 'You do not have permission to edit this Page.' };
    }

    void logPageAuditEvent(pageId, 'page_details_updated', 'Updated Page profile & settings');

    return {
      success: true,
      page: mapSupabasePageRowToPage(data, { includePrivateMeta: true }),
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update Page.',
    };
  }
}

/**
 * Backward-compatible alias that maps legacy `cover_path` into live `cover_url`.
 */
export async function updatePageProfile(
  pageId: string,
  updates: Partial<Page>
): Promise<{ success: boolean; error?: string }> {
  const res = await updatePageDetails(pageId, {
    name: updates.name,
    description: updates.description,
    category: updates.category,
    location: updates.location,
    whatsapp: updates.whatsapp,
    website: updates.website,
    contact_email: updates.contact_email,
    contact_phone: updates.contact_phone,
    avatar_url: updates.avatar_url ?? updates.avatarUrl,
    cover_url: updates.cover_url ?? updates.coverUrl ?? updates.cover_path,
    allow_messages: updates.allow_messages ?? updates.allowMessages,
    allow_comments: updates.allow_comments ?? updates.allowComments,
  });
  return { success: res.success, error: res.error };
}

/**
 * Follow a Page via canonical RPC `follow_page`
 */
export async function followPage(pageId: string, userId?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.rpc('follow_page', { p_page_id: pageId });
    if (!error) return { success: true };

    if (userId) {
      const fallback = await supabase
        .from('page_followers')
        .upsert({ page_id: pageId, user_id: userId, created_at: new Date().toISOString() });
      if (!fallback.error) return { success: true };
      return { success: false, error: fallback.error.message };
    }
    return { success: false, error: error.message };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Could not follow Page.' };
  }
}

/**
 * Unfollow a Page via canonical RPC `unfollow_page`
 */
export async function unfollowPage(pageId: string, userId?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.rpc('unfollow_page', { p_page_id: pageId });
    if (!error) return { success: true };

    if (userId) {
      const fallback = await supabase
        .from('page_followers')
        .delete()
        .eq('page_id', pageId)
        .eq('user_id', userId);
      if (!fallback.error) return { success: true };
      return { success: false, error: fallback.error.message };
    }
    return { success: false, error: error.message };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Could not unfollow Page.' };
  }
}

/**
 * Follow or unfollow a page (preserved signature for existing callers like MrAnonymousPageView)
 */
export async function toggleFollowPage(
  pageId: string,
  userId: string,
  currentlyFollowing: boolean
): Promise<boolean> {
  const res = currentlyFollowing
    ? await unfollowPage(pageId, userId)
    : await followPage(pageId, userId);
  return res.success;
}

/**
 * Invite a friend to follow a Page via RPC `invite_friend_to_page`
 */
export async function inviteFriendToPage(
  pageId: string,
  friendId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.rpc('invite_friend_to_page', {
      p_page_id: pageId,
      p_friend_id: friendId,
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Could not invite friend.' };
  }
}

export async function fetchMyPageFollowInvites(userId: string): Promise<PageFollowInvite[]> {
  if (!userId) return [];
  try {
    const { data, error } = await supabase
      .from('page_follow_invites')
      .select('*, page:pages(*)')
      .eq('invited_user_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error || !data) return [];

    const inviterIds = Array.from(new Set(data.map((d: any) => d.invited_by).filter(Boolean)));
    const inviterMap = new Map<string, any>();
    if (inviterIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, username, avatar_url')
        .in('id', inviterIds);
      for (const p of profiles || []) inviterMap.set(p.id, p);
    }

    return data.map((row: any) => ({
      ...row,
      page: row.page ? mapSupabasePageRowToPage(row.page) : undefined,
      inviter: row.invited_by ? inviterMap.get(row.invited_by) : undefined,
    }));
  } catch {
    return [];
  }
}

export async function respondPageFollowInvite(
  invitationId: string,
  accept: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.rpc('respond_page_follow_invite', {
      p_invitation_id: invitationId,
      p_accept: accept,
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to respond to invite.' };
  }
}

/**
 * Invite a Page team member by username with explicit role (`admin` | `editor` | `moderator`)
 */
export async function invitePageAdmin(
  pageId: string,
  username: string,
  role: 'admin' | 'editor' | 'moderator' = 'admin'
): Promise<{ success: boolean; error?: string }> {
  const cleanUsername = username.trim().replace(/^@+/, '');
  if (!cleanUsername) {
    return { success: false, error: 'Please enter a valid username.' };
  }
  const cleanRole = normalizePageRole(role);
  const safeRole = cleanRole === 'owner' ? 'admin' : cleanRole;
  try {
    let { error } = await supabase.rpc('invite_page_admin', {
      p_page_id: pageId,
      p_username: cleanUsername,
      p_role: safeRole,
    });
    if (error && /could not find the function|p_role/i.test(error.message || '')) {
      const retry = await supabase.rpc('invite_page_admin', {
        p_page_id: pageId,
        p_username: cleanUsername,
      });
      error = retry.error;
    }
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to invite team member.' };
  }
}

export async function fetchMyPageAdminInvitations(userId: string): Promise<PageAdminInvitation[]> {
  if (!userId) return [];
  try {
    const { data, error } = await supabase
      .from('page_admin_invitations')
      .select('*, page:pages(*)')
      .eq('invited_user_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error || !data) return [];

    const inviterIds = Array.from(new Set(data.map((d: any) => d.invited_by).filter(Boolean)));
    const inviterMap = new Map<string, any>();
    if (inviterIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, username, avatar_url')
        .in('id', inviterIds);
      for (const p of profiles || []) inviterMap.set(p.id, p);
    }

    return data.map((row: any) => ({
      ...row,
      role: row.role ? normalizePageRole(row.role) : 'admin',
      page: row.page ? mapSupabasePageRowToPage(row.page) : undefined,
      inviter: row.invited_by ? inviterMap.get(row.invited_by) : undefined,
    }));
  } catch {
    return [];
  }
}

export async function fetchPendingPageAdminInvitesForPage(
  pageId: string
): Promise<PageAdminInvitation[]> {
  try {
    const { data, error } = await supabase
      .from('page_admin_invitations')
      .select('*')
      .eq('page_id', pageId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error || !data) return [];
    const uids = Array.from(new Set(data.map((d: any) => d.invited_user_id).filter(Boolean)));
    const pMap = new Map<string, any>();
    if (uids.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, display_name, username, avatar_url')
        .in('id', uids);
      for (const p of profs || []) pMap.set(p.id, p);
    }
    return data.map((r: any) => {
      const inviteeProfile = r.invited_user_id ? pMap.get(r.invited_user_id) : undefined;
      return {
        ...r,
        role: r.role ? normalizePageRole(r.role) : 'admin',
        inviter: inviteeProfile,
        invitee: inviteeProfile,
      };
    });
  } catch {
    return [];
  }
}

export async function respondPageAdminInvite(
  invitationId: string,
  accept: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.rpc('respond_page_admin_invite', {
      p_invitation_id: invitationId,
      p_accept: accept,
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to respond to admin invite.' };
  }
}

export async function removePageAdmin(
  pageId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.rpc('remove_page_admin', {
      p_page_id: pageId,
      p_user_id: userId,
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to remove admin.' };
  }
}

export async function fetchPageManagers(pageId: string): Promise<PageManager[]> {
  try {
    const { data, error } = await supabase
      .from('page_managers')
      .select('page_id, user_id, role, created_at')
      .eq('page_id', pageId)
      .order('created_at', { ascending: true });

    if (error || !data) return [];
    const userIds = Array.from(new Set(data.map((d: any) => d.user_id).filter(Boolean)));
    const pMap = new Map<string, any>();
    if (userIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, display_name, username, avatar_url, department, level, is_verified')
        .in('id', userIds);
      for (const p of profs || []) pMap.set(p.id, p);
    }

    return data.map((r: any) => ({
      page_id: r.page_id,
      user_id: r.user_id,
      role: normalizePageRole(r.role),
      created_at: r.created_at,
      user: r.user_id ? pMap.get(r.user_id) : undefined,
    }));
  } catch {
    return [];
  }
}

export async function fetchPageFollowers(pageId: string, limit = 80): Promise<PageFollower[]> {
  try {
    const { data, error } = await supabase
      .from('page_followers')
      .select('page_id, user_id, created_at')
      .eq('page_id', pageId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    const userIds = Array.from(new Set(data.map((d: any) => d.user_id).filter(Boolean)));
    const pMap = new Map<string, any>();
    if (userIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, display_name, username, avatar_url, department, level')
        .in('id', userIds);
      for (const p of profs || []) pMap.set(p.id, p);
    }

    return data.map((r: any) => ({
      page_id: r.page_id,
      user_id: r.user_id,
      created_at: r.created_at,
      user: r.user_id ? pMap.get(r.user_id) : undefined,
    }));
  } catch {
    return [];
  }
}

export async function removePageFollower(
  pageId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.rpc('remove_page_follower', {
      p_page_id: pageId,
      p_user_id: userId,
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to remove follower.' };
  }
}

export async function blockUserFromPage(
  pageId: string,
  userId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.rpc('block_user_from_page', {
      p_page_id: pageId,
      p_user_id: userId,
      ...(reason ? { p_reason: reason.trim() } : {}),
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to block user.' };
  }
}

export async function unblockUserFromPage(
  pageId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.rpc('unblock_user_from_page', {
      p_page_id: pageId,
      p_user_id: userId,
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to unblock user.' };
  }
}

export async function fetchPageBlocks(pageId: string): Promise<PageBlock[]> {
  try {
    const { data, error } = await supabase
      .from('page_blocks')
      .select('page_id, user_id, blocked_by, reason, created_at')
      .eq('page_id', pageId)
      .order('created_at', { ascending: false });
    if (error || !data) return [];
    const uids = Array.from(new Set(data.map((d: any) => d.user_id).filter(Boolean)));
    const pMap = new Map<string, any>();
    if (uids.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, display_name, username, avatar_url, department')
        .in('id', uids);
      for (const p of profs || []) pMap.set(p.id, p);
    }
    return data.map((r: any) => ({
      ...r,
      user: r.user_id ? pMap.get(r.user_id) : undefined,
    }));
  } catch {
    return [];
  }
}

/**
 * Search students by username/display_name for Page Admin invitations
 */
export async function searchUsersForPageInvite(queryText: string): Promise<
  Array<{
    id: string;
    display_name: string;
    username: string;
    avatar_url?: string;
    department?: string;
  }>
> {
  const q = queryText.trim().replace(/^@+/, '').replace(/[,%()]/g, ' ').trim();
  if (q.length < 2) return [];
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, username, avatar_url, department')
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
      .limit(12);
    if (error || !data) return [];
    return data as any[];
  } catch {
    return [];
  }
}

/**
 * Check if the user is an authorized manager for a page
 */
export async function checkIsPageManager(pageId: string, userId: string): Promise<boolean> {
  try {
    if (pageId === MR_ANONYMOUS_PAGE_ID) {
      const token = await getAuthToken();
      if (token) {
        const res = await fetch('/api/pages/mr-anonymous/is-manager', {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null);
        const data = res?.ok ? await parseApiJson(res) : null;
        if (data && typeof data.isManager === 'boolean') {
          return data.isManager;
        }
      }
    }

    const { data, error } = await supabase
      .from('page_managers')
      .select('role')
      .eq('page_id', pageId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) return false;
    const r = String(data.role || '').toLowerCase();
    return ['owner', 'admin', 'editor', 'moderator', 'manager'].includes(r);
  } catch {
    return false;
  }
}

/**
 * Pin a single post on a Page (RPC `pin_page_post`). Calling on an already pinned post or unpinning clears the previous pin cleanly.
 */
export async function pinPagePost(
  pageId: string,
  postId: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    if (postId) {
      const { error } = await supabase.rpc('pin_page_post', {
        p_page_id: pageId,
        p_post_id: postId,
      });
      if (!error) return { success: true };

      // Fallback unpin others then pin selected if RPC had an edge case
      await supabase
        .from('posts')
        .update({ is_pinned: false, pinned_at: null })
        .eq('page_id', pageId)
        .eq('is_pinned', true);

      const directPin = await supabase
        .from('posts')
        .update({ is_pinned: true, pinned_at: new Date().toISOString() })
        .eq('id', postId)
        .eq('page_id', pageId);

      if (!directPin.error) return { success: true };
      return { success: false, error: error.message || directPin.error.message };
    } else {
      const { error } = await supabase
        .from('posts')
        .update({ is_pinned: false, pinned_at: null })
        .eq('page_id', pageId)
        .eq('is_pinned', true);
      if (error) return { success: false, error: error.message };
      return { success: true };
    }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update pin.' };
  }
}

/**
 * Soft-delete Page (30-day recovery window) via RPC `request_page_deletion`
 */
export async function requestPageDeletion(
  pageId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.rpc('request_page_deletion', { p_page_id: pageId });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to request Page deletion.',
    };
  }
}

export async function cancelPageDeletion(
  pageId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Write strictly to `deleted_at` (never `deletion_requested_at`, which is a generated read-only column)
    const { data, error } = await supabase
      .from('pages')
      .update({
        deleted_at: null,
        is_active: true,
        status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', pageId)
      .select('id')
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: 'You do not have permission to restore this Page.' };
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to restore Page.',
    };
  }
}

/**
 * Report a Page directly into `page_reports` table
 */
export async function reportPage(params: {
  pageId: string;
  reporterId: string;
  reason: string;
  description?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('page_reports').insert({
      page_id: params.pageId,
      reporter_id: params.reporterId,
      reason: params.reason.trim(),
      description: params.description?.trim() || null,
      status: 'open',
      created_at: new Date().toISOString(),
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to submit report.',
    };
  }
}

/**
 * Fetch published posts for ANY Page (supports Mr Anonymous historical dummy posts + New Pages posts,
 * sorted with pinned post first, then chronological).
 */
export async function fetchPagePosts(pageId: string, currentUserId?: string): Promise<Post[]> {
  try {
    let postRows: SupabasePostRow[] = [];

    const apiEndpoint =
      pageId === MR_ANONYMOUS_PAGE_ID
        ? '/api/pages/mr-anonymous/posts'
        : `/api/pages/${encodeURIComponent(pageId)}/posts`;
    const res = await fetch(apiEndpoint).catch(() => null);
    const json = res?.ok ? await parseApiJson(res) : null;
    if (json?.success && Array.isArray(json.posts)) {
      postRows = json.posts as unknown as SupabasePostRow[];
    }

    if (postRows.length === 0) {
      const postFilter =
        pageId === MR_ANONYMOUS_PAGE_ID
          ? `page_id.eq.${pageId},author_page_id.eq.${pageId},author_id.eq.${MR_ANONYMOUS_DUMMY_ID}`
          : `page_id.eq.${pageId},author_page_id.eq.${pageId}`;

      const { data, error } = await supabase
        .from('posts')
        .select(`
          *,
          author:profiles!posts_author_id_fkey(*),
          page:pages!posts_page_id_fkey(*),
          post_media(*),
          post_reactions(*),
          comments(id)
        `)
        .or(postFilter)
        .order('is_pinned', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(60);

      if (error) {
        // Fallback when direct pages embed or ordering fails: fetch plain posts safely
        const fallbackRes = await supabase
          .from('posts')
          .select(`
            *,
            author:profiles!posts_author_id_fkey(*),
            post_media(*),
            post_reactions(*),
            comments(id)
          `)
          .or(postFilter)
          .order('created_at', { ascending: false })
          .limit(60);

        if (fallbackRes.error) {
          console.warn('[PageService] fetchPagePosts direct error:', fallbackRes.error.message);
        } else {
          postRows = (fallbackRes.data || []) as unknown as SupabasePostRow[];
        }
      } else {
        postRows = (data || []) as unknown as SupabasePostRow[];
      }
    }

    await resolvePostMediaUrlsOnRows(postRows);

    return postRows
      .filter((r) => String(r.visibility || 'public').toLowerCase() !== 'hidden')
      .map((row) => mapSupabasePostToFrontend(row, currentUserId))
      .sort((a, b) => Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned)));
  } catch (err) {
    console.warn('[PageService] Error fetching page posts:', err);
    return [];
  }
}

/**
 * Create or get the canonical conversation between current user and a Page (`create_page_conversation`).
 */
export async function createPageConversation(
  pageId: string
): Promise<{ success: boolean; conversationId?: string; error?: string }> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user?.id;

    // Enforce Page messaging permissions & restrictions cleanly before opening chat
    const { data: pageCfg } = await supabase
      .from('pages')
      .select('id, allow_messages, messaging_permission, created_by, welcome_message, away_mode_enabled, away_message')
      .eq('id', pageId)
      .maybeSingle();

    if (pageCfg) {
      const perm = pageCfg.messaging_permission || (pageCfg.allow_messages === false ? 'disabled' : 'everyone');
      if (perm === 'disabled' || pageCfg.allow_messages === false) {
        return { success: false, error: 'Direct messaging is turned off for this Page.' };
      }
      if (uid) {
        const [{ data: restrictedRow }, { data: followRow }] = await Promise.all([
          supabase.from('page_restricted_users').select('user_id').eq('page_id', pageId).eq('user_id', uid).maybeSingle(),
          supabase.from('page_followers').select('user_id').eq('page_id', pageId).eq('user_id', uid).maybeSingle(),
        ]);
        if (restrictedRow) {
          return { success: false, error: 'You are restricted from messaging this Page.' };
        }
        if (perm === 'followers' && !followRow) {
          return { success: false, error: 'Follow this Page first to send direct messages.' };
        }
      }
    }

    const { data, error } = await supabase.rpc('create_page_conversation', {
      p_page_id: pageId,
    });
    if (error) return { success: false, error: error.message };
    const convId = typeof data === 'string' ? data : data?.id || data?.conversation_id;
    if (!convId) return { success: false, error: 'Could not open conversation with Page.' };
    return { success: true, conversationId: convId };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to start Page chat.',
    };
  }
}

export async function markPageConversationRead(
  conversationId: string,
  pageId: string
): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('mark_page_conversation_read', {
      p_conversation_id: conversationId,
      p_page_id: pageId,
    });
    return !error;
  } catch {
    return false;
  }
}

/**
 * Fetch Page Inbox conversations for Page Workspace (Owner / Admin view).
 * Computes unread badge accurately from `page_conversation_reads`.
 */
export async function fetchPageInboxConversations(
  pageId: string
): Promise<PageInboxConversation[]> {
  if (!pageId) return [];
  try {
    const [{ data: pageRow }, { data: convRows, error: cErr }, { data: mgrRows }] = await Promise.all([
      supabase.from('pages').select('*').eq('id', pageId).maybeSingle(),
      supabase
        .from('conversations')
        .select('*')
        .eq('is_page_chat', true)
        .eq('page_id', pageId)
        .order('last_message_at', { ascending: false })
        .limit(50),
      supabase.from('page_managers').select('user_id').eq('page_id', pageId),
    ]);

    if (cErr || !convRows || convRows.length === 0) return [];

    const managerSet = new Set((mgrRows || []).map((m: any) => m.user_id).filter(Boolean));
    const convIds = convRows.map((c: any) => c.id);

    const [membersRes, readsRes, msgsRes] = await Promise.all([
      supabase.from('conversation_members').select('conversation_id, user_id').in('conversation_id', convIds),
      supabase
        .from('page_conversation_reads')
        .select('conversation_id, last_read_at')
        .eq('page_id', pageId)
        .in('conversation_id', convIds),
      supabase
        .from('messages')
        .select('id, conversation_id, sender_id, sender_as_page, body, created_at')
        .in('conversation_id', convIds)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(200),
    ]);

    const customerIdByConv = new Map<string, string>();
    for (const m of (membersRes.data || []) as Array<{ conversation_id: string; user_id: string }>) {
      if (!customerIdByConv.has(m.conversation_id) && m.user_id && !managerSet.has(m.user_id)) {
        customerIdByConv.set(m.conversation_id, m.user_id);
      }
    }
    for (const c of convRows as any[]) {
      if (!customerIdByConv.has(c.id) && c.created_by) {
        customerIdByConv.set(c.id, c.created_by);
      }
    }

    const customerIds = Array.from(new Set(customerIdByConv.values())).filter(Boolean);
    const profileMap = new Map<string, User>();
    if (customerIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('*').in('id', customerIds);
      for (const p of (profiles || []) as SupabaseProfileRow[]) {
        profileMap.set(p.id, mapProfileRowToUser(p, null, 'none'));
      }
    }

    const lastReadByConv = new Map<string, number>();
    for (const r of (readsRes.data || []) as Array<{ conversation_id: string; last_read_at?: string }>) {
      if (r.last_read_at) {
        const ts = new Date(r.last_read_at).getTime();
        const prev = lastReadByConv.get(r.conversation_id) || 0;
        if (ts > prev) lastReadByConv.set(r.conversation_id, ts);
      }
    }

    const latestByConv = new Map<string, any>();
    const unreadByConv = new Map<string, number>();

    for (const m of (msgsRes.data || []) as any[]) {
      if (!latestByConv.has(m.conversation_id)) {
        latestByConv.set(m.conversation_id, m);
      }
      if (!m.sender_as_page) {
        const readTs = lastReadByConv.get(m.conversation_id) || 0;
        const msgTs = m.created_at ? new Date(m.created_at).getTime() : 0;
        if (msgTs > readTs) {
          unreadByConv.set(m.conversation_id, (unreadByConv.get(m.conversation_id) || 0) + 1);
        }
      }
    }

    const mappedPage = pageRow ? mapSupabasePageRowToPage(pageRow) : null;

    return convRows.map((c: any) => {
      const custId = customerIdByConv.get(c.id) || 'student';
      const customer: User =
        profileMap.get(custId) || {
          id: custId,
          name: 'ABSU Student',
          avatar: getPageDefaultAvatar('Student'),
          handle: '@student',
          department: 'Student',
          faculty: 'Abia State University',
          level: 'Undergraduate',
          campus: 'Uturu (Main Campus)',
          bio: '',
          interests: [],
          relationshipState: 'none',
        };

      const latest = latestByConv.get(c.id);
      return {
        id: c.id,
        pageId,
        pageName: mappedPage?.name || 'Page',
        pageAvatar: mappedPage?.avatarUrl || getPageDefaultAvatar('Page'),
        pageIsVerified: Boolean(mappedPage?.isVerified),
        customer,
        lastMessage: latest?.body || 'New inquiry',
        lastMessageTime: formatTimeAgo(latest?.created_at || c.last_message_at || c.created_at),
        lastMessageAtRaw: latest?.created_at || c.last_message_at || c.created_at,
        unreadCount: unreadByConv.get(c.id) || 0,
        allowMessages: mappedPage?.allowMessages ?? true,
      };
    });
  } catch (err) {
    console.warn('[PageService] fetchPageInboxConversations error:', err);
    return [];
  }
}

/**
 * Fetch dedicated isolated Page notifications scoped strictly to `recipient_page_id = pageId`
 * for the authenticated Page manager.
 */
export async function fetchPageNotifications(
  pageId: string,
  userId?: string
): Promise<NotificationItem[]> {
  if (!pageId) return [];
  try {
    const effectiveUserId =
      userId || (await supabase.auth.getSession()).data.session?.user?.id || '';
    if (!effectiveUserId) return [];

    let { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', effectiveUserId)
      .eq('recipient_page_id', pageId)
      .order('created_at', { ascending: false })
      .limit(80);

    if (error && (error.message || '').toLowerCase().includes('recipient_page_id')) {
      const retry = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', effectiveUserId)
        .eq('target_page_id', pageId)
        .order('created_at', { ascending: false })
        .limit(80);
      data = retry.data;
      error = retry.error;
    }

    if (error || !data) return [];

    const actorIds = Array.from(
      new Set(data.map((r: any) => r.actor_id).filter((id: any) => isValidUuid(id)))
    );
    const actorMap = new Map<string, SupabaseProfileRow>();
    if (actorIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('*').in('id', actorIds);
      for (const p of (profiles || []) as SupabaseProfileRow[]) actorMap.set(p.id, p);
    }

    const messageIds = Array.from(
      new Set(
        data
          .filter((r: any) => String(r.entity_type || '').toLowerCase() === 'message' && isValidUuid(r.entity_id))
          .map((r: any) => r.entity_id)
      )
    );
    const msgConvMap = new Map<string, string>();
    if (messageIds.length > 0) {
      const { data: msgs } = await supabase
        .from('messages')
        .select('id, conversation_id')
        .in('id', messageIds);
      for (const m of (msgs || []) as Array<{ id: string; conversation_id: string }>) {
        if (m.id && m.conversation_id) msgConvMap.set(m.id, m.conversation_id);
      }
    }

    return data.map((row: any) => {
      const notifType = mapDbEnumToAppType(row.type || '', row.entity_type);
      const actorProf = row.actor_id ? actorMap.get(row.actor_id) : undefined;
      const actor = actorProf
        ? mapProfileRowToUser(actorProf)
        : {
            id: row.actor_id || 'system',
            name: 'ABSU Connect',
            avatar: getPageDefaultAvatar('ABSU'),
          };
      const cleanEntityType = String(row.entity_type || '').toLowerCase();
      let convId: string | undefined = isValidUuid(row.conversation_id)
        ? row.conversation_id
        : undefined;
      if (!convId && (notifType === 'page_message' || notifType === 'message')) {
        if (cleanEntityType === 'conversation' && isValidUuid(row.entity_id)) {
          convId = row.entity_id;
        } else if (cleanEntityType === 'message' && isValidUuid(row.entity_id)) {
          convId = msgConvMap.get(row.entity_id);
        }
      }
      return {
        id: row.id,
        type: notifType,
        rawType: row.type || undefined,
        title: row.title || undefined,
        entityType: row.entity_type || undefined,
        entityId: row.entity_id || undefined,
        actor: {
          id: actor.id,
          name: actor.name,
          avatar: actor.avatar,
        },
        content: row.body || getPrivacySafeNotificationText(notifType, row.entity_type),
        timestamp: formatTimeAgo(row.created_at),
        createdAt: row.created_at,
        isRead: Boolean(row.read_at),
        targetPostId: isValidUuid(row.post_id)
          ? row.post_id
          : cleanEntityType === 'post' && isValidUuid(row.entity_id)
          ? row.entity_id
          : undefined,
        targetCommentId: isValidUuid(row.comment_id) ? row.comment_id : undefined,
        targetParentCommentId: isValidUuid(row.parent_comment_id) ? row.parent_comment_id : undefined,
        targetPageId: isValidUuid(row.target_page_id) ? row.target_page_id : pageId,
        recipientPageId: isValidUuid(row.recipient_page_id) ? row.recipient_page_id : pageId,
        conversationId: convId,
      };
    });
  } catch (err) {
    console.warn('[PageService] fetchPageNotifications error:', err);
    return [];
  }
}

export async function markAllPageNotificationsRead(
  pageId: string,
  userId?: string
): Promise<boolean> {
  if (!pageId) return false;
  try {
    const effectiveUserId =
      userId || (await supabase.auth.getSession()).data.session?.user?.id || '';
    if (!effectiveUserId) return false;

    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('recipient_id', effectiveUserId)
      .eq('recipient_page_id', pageId)
      .is('read_at', null);

    if (error && (error.message || '').toLowerCase().includes('recipient_page_id')) {
      const retry = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('recipient_id', effectiveUserId)
        .eq('target_page_id', pageId)
        .is('read_at', null);
      return !retry.error;
    }

    return !error;
  } catch {
    return false;
  }
}

/**
 * Super Admin — Manage Pages Console RPCs & Express Admin API
 */
export { classifyAdminVerificationError };

export async function verifyCurrentUserIsSuperAdmin(): Promise<{ ok: boolean; error?: string }> {
  const sessionState = await ensureAuthenticatedSession();
  if (sessionState.sessionExpired || !sessionState.session) {
    return { ok: false, error: 'Session expired. Please sign in again.' };
  }

  let { data: isAdmin, error } = await supabase.rpc('current_user_is_admin');
  if (error) {
    const classified = classifyAdminVerificationError(error);
    if (classified.startsWith('Session expired')) {
      const { data: refreshed } = await supabase.auth
        .refreshSession()
        .catch(() => ({ data: { session: null } }));
      if (!refreshed?.session?.access_token) {
        return { ok: false, error: 'Session expired. Please sign in again.' };
      }
      const retry = await supabase.rpc('current_user_is_admin');
      isAdmin = retry.data;
      error = retry.error;
    }
  }

  if (error) {
    return { ok: false, error: classifyAdminVerificationError(error) };
  }
  if (isAdmin !== true) {
    return { ok: false, error: 'User is not a super administrator.' };
  }
  return { ok: true };
}

export async function fetchAdminPagesStats(): Promise<AdminPagesStats> {
  return withInFlightDedup('admin-pages-stats', async () => {
    const sessionState = await ensureAuthenticatedSession();
    if (!sessionState.sessionExpired && sessionState.session) {
      try {
        const { data, error } = await supabase.rpc('admin_pages_stats');
        if (!error && data && typeof data === 'object') {
          const d = Array.isArray(data) ? data[0] : data;
          if (d) {
            return {
              totalPages: Number(d.total_pages ?? d.totalPages ?? 0),
              activePages: Number(d.active_pages ?? d.activePages ?? 0),
              verifiedPages: Number(d.verified_pages ?? d.verifiedPages ?? 0),
              disabledPages: Number(d.disabled_pages ?? d.disabledPages ?? 0),
              deletedPages: Number(d.deleted_pages ?? d.deletedPages ?? 0),
              openReports: Number(d.open_reports ?? d.openReports ?? 0),
            };
          }
        }
      } catch {
        // Fall through cleanly
      }
    }

    try {
      const token = await getAuthToken();
      if (token) {
        const res = await fetch('/api/admin/pages/stats', {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null);
        const json = res?.ok ? await parseApiJson(res) : null;
        if (json?.success && json.stats) {
          return json.stats as AdminPagesStats;
        }
      }
    } catch {
      // Fall through cleanly
    }

    try {
      const [{ data: pages, error: pagesErr }, { count: openReports }] = await Promise.all([
        supabase.from('pages').select('id, status, is_active, is_verified, deleted_at'),
        supabase.from('page_reports').select('*', { count: 'exact', head: true }).eq('status', 'open'),
      ]);

      if (!pagesErr && Array.isArray(pages)) {
        return computeAdminPagesStats(pages, openReports || 0);
      }
    } catch {
      // Ignore
    }

    return {
      totalPages: 0,
      activePages: 0,
      verifiedPages: 0,
      disabledPages: 0,
      deletedPages: 0,
      openReports: 0,
    };
  });
}

export async function adminListPages(params?: {
  search?: string;
  status?: 'all' | PageStatus;
  verified?: 'all' | 'verified' | 'unverified';
}): Promise<Page[]> {
  const key = `admin-list-pages:${params?.search || ''}:${params?.status || 'all'}:${
    params?.verified || 'all'
  }`;

  return withInFlightDedup(key, async () => {
    const sessionState = await ensureAuthenticatedSession();
    if (!sessionState.sessionExpired && sessionState.session) {
      try {
        const { data, error } = await supabase.rpc('admin_list_pages', {
          p_search: params?.search?.trim() || null,
          p_status: params?.status && params.status !== 'all' ? params.status : null,
          p_verified:
            params?.verified === 'verified' ? true : params?.verified === 'unverified' ? false : null,
        });
        if (!error && Array.isArray(data)) {
          return dedupePages(
            data.map((row: any) => mapSupabasePageRowToPage(row, { includePrivateMeta: true }))
          );
        }
      } catch {
        // Fallback below
      }
    }

    try {
      const token = await getAuthToken();
      if (token) {
        const qs = new URLSearchParams();
        if (params?.search) qs.set('search', params.search);
        if (params?.status) qs.set('status', params.status);
        if (params?.verified) qs.set('verified', params.verified);
        const res = await fetch(`/api/admin/pages?${qs.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null);
        const json = res?.ok ? await parseApiJson(res) : null;
        if (json?.success && Array.isArray(json.pages)) {
          return dedupePages(
            json.pages.map((r: any) => mapSupabasePageRowToPage(r, { includePrivateMeta: true }))
          );
        }
      }
    } catch {
      // Fall through cleanly
    }

    try {
      let q = supabase.from('pages').select('*');
      if (params?.status && params.status !== 'all') {
        q = q.eq('status', params.status);
      } else {
        q = q.is('deleted_at', null);
      }
      if (params?.verified === 'verified') q = q.eq('is_verified', true);
      if (params?.verified === 'unverified') q = q.eq('is_verified', false);
      if (params?.search?.trim()) {
        const clean = params.search.trim().replace(/[,%()]/g, ' ').trim();
        if (clean) q = q.or(`name.ilike.%${clean}%,slug.ilike.%${clean}%,category.ilike.%${clean}%`);
      }
      const { data } = await q.order('created_at', { ascending: false }).limit(100);
      return dedupePages(
        (data || []).map((r: any) => mapSupabasePageRowToPage(r, { includePrivateMeta: true }))
      );
    } catch {
      return [];
    }
  });
}

export async function adminSetPageVerified(
  pageId: string,
  verified: boolean
): Promise<{ success: boolean; error?: string }> {
  const cleanPageId = String(pageId || '').trim();
  if (!isValidUuid(cleanPageId)) {
    return { success: false, error: 'Page not found.' };
  }

  try {
    const adminCheck = await verifyCurrentUserIsSuperAdmin();
    if (!adminCheck.ok) {
      return { success: false, error: adminCheck.error || 'User is not a super administrator.' };
    }

    const { data, error } = await supabase.rpc('admin_set_page_verified', {
      p_page_id: cleanPageId,
      p_verified: Boolean(verified),
    });

    if (error) {
      return { success: false, error: classifyAdminVerificationError(error) };
    }
    if (data === false) {
      return { success: false, error: 'Page not found.' };
    }
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: classifyAdminVerificationError(err) };
  }
}

export async function adminSetPageStatus(
  pageId: string,
  status: PageStatus,
  reason?: string,
  explanation?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const token = await getAuthToken();
    if (token) {
      const res = await fetch(`/api/admin/pages/${encodeURIComponent(pageId)}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status, reason, explanation }),
      }).catch(() => null);
      const json = await parseApiJson(res);
      if (res && json) {
        if (res.ok && json.success) return { success: true };
        if (res.status !== 404 && !json.fallbackToRpc && json.error) {
          return { success: false, error: json.error };
        }
      }
    }

    const { error } = await supabase.rpc('admin_set_page_status', {
      p_page_id: pageId,
      p_status: status,
      ...(reason ? { p_reason: reason.trim() } : {}),
    });
    if (error) return { success: false, error: error.message };

    if (explanation?.trim()) {
      await supabase
        .from('pages')
        .update({ disabled_explanation: explanation.trim(), updated_at: new Date().toISOString() })
        .eq('id', pageId);
    }
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update Page status.' };
  }
}

export async function adminListPageReports(): Promise<PageReport[]> {
  try {
    const { data, error } = await supabase
      .from('page_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error || !data) return [];

    const pageIds = Array.from(new Set(data.map((r: any) => r.page_id).filter(Boolean)));
    const reporterIds = Array.from(new Set(data.map((r: any) => r.reporter_id).filter(Boolean)));

    const [pagesRes, repsRes] = await Promise.all([
      pageIds.length > 0
        ? supabase.from('pages').select('id, name, slug, avatar_url, status, is_verified').in('id', pageIds)
        : Promise.resolve({ data: [] }),
      reporterIds.length > 0
        ? supabase.from('profiles').select('id, display_name, username, avatar_url').in('id', reporterIds)
        : Promise.resolve({ data: [] }),
    ]);

    const pMap = new Map<string, any>();
    for (const p of (pagesRes as any).data || []) pMap.set(p.id, p);
    const rMap = new Map<string, any>();
    for (const u of (repsRes as any).data || []) rMap.set(u.id, u);

    return data.map((row: any) => ({
      ...row,
      page: row.page_id ? pMap.get(row.page_id) : undefined,
      reporter: row.reporter_id ? rMap.get(row.reporter_id) : undefined,
    }));
  } catch {
    return [];
  }
}

export async function adminResolvePageReport(
  reportId: string,
  note?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.rpc('admin_resolve_page_report', {
      p_report_id: reportId,
      ...(note ? { p_note: note.trim() } : {}),
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to resolve report.' };
  }
}

/* ============================================================================
 * Preserved Mr Anonymous & Legacy Page Applications Functions
 * ============================================================================ */

export async function submitAnonymousPost(
  body: string
): Promise<{ success: boolean; submissionId?: string; postId?: string; autoApproved?: boolean; error?: string }> {
  const cleanBody = body.trim();
  if (!cleanBody || cleanBody.length < 10) {
    return { success: false, error: 'Submission must be at least 10 characters long.' };
  }
  if (cleanBody.length > 2500) {
    return { success: false, error: 'Submission cannot exceed 2500 characters.' };
  }

  try {
    const token = await getAuthToken();
    if (!token) {
      return { success: false, error: 'Please sign in before submitting an anonymous post.' };
    }

    const apiRes = await fetch('/api/pages/mr-anonymous/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ body: cleanBody }),
    }).catch(() => null);

    const apiJson = await parseApiJson(apiRes);
    if (apiRes && apiJson) {
      if (apiRes.ok && apiJson.success) {
        return {
          success: true,
          submissionId: apiJson.submissionId,
          postId: apiJson.postId,
          autoApproved: true,
        };
      }
      if (apiRes.status !== 404 && apiJson.error) {
        return { success: false, error: apiJson.error };
      }
    }

    const { data, error } = await supabase.rpc('submit_anonymous_post', {
      p_body: cleanBody,
    });

    if (error) {
      console.warn('[PageService] submit_anonymous_post RPC error:', error.message);
      if (error.message?.toLowerCase().includes('jwt') || error.code === '42501') {
        return {
          success: false,
          error: 'Authentication or database permission prevented submission. Please sign in again and retry.',
        };
      }
      return { success: false, error: error.message || 'Unable to submit anonymous post.' };
    }

    const submissionId = data as string;
    const { data: subRow } = await supabase
      .from('anonymous_submissions')
      .select('status, published_post_id')
      .eq('id', submissionId)
      .maybeSingle();

    if (subRow && subRow.status !== 'approved') {
      return {
        success: false,
        error: 'Your submission was queued for moderation review.',
      };
    }

    return {
      success: true,
      submissionId,
      postId: subRow?.published_post_id || undefined,
      autoApproved: true,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error submitting post';
    return { success: false, error: msg };
  }
}

export async function fetchPendingSubmissions(pageId: string): Promise<AnonymousSubmission[]> {
  try {
    const token = await getAuthToken();
    if (token) {
      const res = await fetch('/api/pages/mr-anonymous/pending-submissions', {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);
      const json = res?.ok ? await parseApiJson(res) : null;
      if (json?.success && Array.isArray(json.submissions)) {
        return json.submissions as AnonymousSubmission[];
      }
    }

    const { data, error } = await supabase
      .from('anonymous_submissions')
      .select('id, page_id, body, status, created_at, updated_at')
      .eq('page_id', pageId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) return [];
    return (data || []) as AnonymousSubmission[];
  } catch {
    return [];
  }
}

export async function reviewAnonymousSubmission(
  submissionId: string,
  decision: 'approved' | 'rejected'
): Promise<{ success: boolean; postId?: string; error?: string }> {
  try {
    const token = await getAuthToken();
    if (token) {
      const res = await fetch('/api/pages/mr-anonymous/review-submission', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ submissionId, decision }),
      }).catch(() => null);

      const json = await parseApiJson(res);
      if (res && json) {
        if (res.ok && json.success) {
          return { success: true, postId: json.postId };
        }
        if (res.status !== 404 && json.error) {
          return { success: false, error: json.error };
        }
      }
    }

    const { data, error } = await supabase.rpc('review_anonymous_submission', {
      p_submission_id: submissionId,
      p_decision: decision,
    });

    if (error) return { success: false, error: error.message };
    return { success: true, postId: data as string };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error reviewing submission';
    return { success: false, error: msg };
  }
}

export async function submitPageApplication(params: {
  applicantId: string;
  name: string;
  category: PageCategory;
  description: string;
  whyCreate: string;
  contactEmail?: string;
  contactPhone?: string;
  location?: string;
  avatarPath?: string;
  coverPath?: string;
}): Promise<{ success: boolean; application?: PageApplication; error?: string }> {
  try {
    const {
      applicantId,
      name,
      category,
      description,
      whyCreate,
      contactEmail,
      contactPhone,
      location,
      avatarPath,
      coverPath,
    } = params;

    if (!name || name.trim().length < 3) {
      return { success: false, error: 'Page name must be at least 3 characters.' };
    }
    if (!description || description.trim().length < 15) {
      return { success: false, error: 'Please provide a clear description (at least 15 characters).' };
    }
    if (!whyCreate || whyCreate.trim().length < 15) {
      return { success: false, error: 'Please explain why you want to create this page (at least 15 characters).' };
    }

    const { data, error } = await supabase
      .from('page_applications')
      .insert({
        applicant_id: applicantId,
        name: name.trim(),
        category,
        description: description.trim(),
        why_create: whyCreate.trim(),
        contact_email: contactEmail?.trim() || null,
        contact_phone: contactPhone?.trim() || null,
        location: location?.trim() || null,
        avatar_path: avatarPath || null,
        cover_path: coverPath || null,
      })
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, application: data as PageApplication };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to submit application' };
  }
}

export async function fetchAllPageApplications(): Promise<PageApplication[]> {
  try {
    const { data, error } = await supabase
      .from('page_applications')
      .select(`
        *,
        applicant:profiles!page_applications_applicant_id_fkey(
          id,
          display_name,
          username,
          avatar_url,
          department
        )
      `)
      .order('created_at', { ascending: false });

    if (error) return [];

    return (data || []).map((row: any) => ({
      ...row,
      applicant: row.applicant
        ? {
            id: row.applicant.id,
            name: row.applicant.display_name || row.applicant.username || 'ABSU Student',
            avatar_url: row.applicant.avatar_url,
            department: row.applicant.department,
          }
        : undefined,
    }));
  } catch {
    return [];
  }
}

export async function reviewPageApplication(
  applicationId: string,
  decision: 'approved' | 'rejected',
  notes?: string
): Promise<{ success: boolean; pageId?: string; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('review_page_application', {
      p_application_id: applicationId,
      p_decision: decision,
      ...(notes ? { p_notes: notes } : {}),
    });

    if (error) return { success: false, error: error.message };
    return { success: true, pageId: data as string };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Error reviewing page application' };
  }
}

/**
 * Page Settings: Notification Preferences (per Page + Manager user)
 */
export async function fetchPageNotificationPreferences(
  pageId: string,
  userId?: string
): Promise<PageNotificationPreferences> {
  const effectiveUserId =
    userId || (await supabase.auth.getSession()).data.session?.user?.id || '';
  const defaults: PageNotificationPreferences = {
    page_id: pageId,
    user_id: effectiveUserId,
    notify_followers: true,
    notify_messages: true,
    notify_reactions: true,
    notify_comments: true,
    notify_replies: true,
    notify_admin_changes: true,
    notify_admin_invites: true,
    notify_verification: true,
    notify_security_events: true,
  };
  if (!pageId || !effectiveUserId) return defaults;
  try {
    const { data, error } = await supabase
      .from('page_notification_preferences')
      .select('*')
      .eq('page_id', pageId)
      .eq('user_id', effectiveUserId)
      .maybeSingle();

    if (error || !data) return defaults;
    return {
      page_id: data.page_id,
      user_id: data.user_id,
      notify_followers: data.notify_followers !== false,
      notify_messages: data.notify_messages !== false,
      notify_reactions: data.notify_reactions !== false,
      notify_comments: data.notify_comments !== false,
      notify_replies: data.notify_replies !== false,
      notify_admin_changes: data.notify_admin_changes !== false,
      notify_admin_invites: data.notify_admin_invites !== false,
      notify_verification: data.notify_verification !== false,
      notify_security_events: data.notify_security_events !== false,
      updated_at: data.updated_at,
    };
  } catch {
    return defaults;
  }
}

export async function upsertPageNotificationPreferences(
  pageId: string,
  prefs: Partial<Omit<PageNotificationPreferences, 'page_id' | 'user_id'>>,
  userId?: string
): Promise<{ success: boolean; preferences?: PageNotificationPreferences; error?: string }> {
  try {
    const effectiveUserId =
      userId || (await supabase.auth.getSession()).data.session?.user?.id || '';
    if (!effectiveUserId) return { success: false, error: 'Authentication required.' };

    const fullPayload = {
      page_id: pageId,
      user_id: effectiveUserId,
      notify_followers: prefs.notify_followers ?? true,
      notify_messages: prefs.notify_messages ?? true,
      notify_reactions: prefs.notify_reactions ?? true,
      notify_comments: prefs.notify_comments ?? true,
      notify_replies: prefs.notify_replies ?? true,
      notify_admin_changes: prefs.notify_admin_changes ?? true,
      notify_admin_invites: prefs.notify_admin_invites ?? true,
      notify_verification: prefs.notify_verification ?? true,
      notify_security_events: prefs.notify_security_events ?? true,
      updated_at: new Date().toISOString(),
    };

    let { data, error } = await supabase
      .from('page_notification_preferences')
      .upsert(fullPayload, { onConflict: 'page_id,user_id' })
      .select('*')
      .maybeSingle();

    if (error && /column|schema cache|42703|PGRST204/i.test(error.message || '')) {
      const legacyPayload = {
        page_id: pageId,
        user_id: effectiveUserId,
        notify_followers: fullPayload.notify_followers,
        notify_messages: fullPayload.notify_messages,
        notify_reactions: fullPayload.notify_reactions,
        notify_comments: fullPayload.notify_comments,
        notify_admin_changes: fullPayload.notify_admin_changes,
        updated_at: fullPayload.updated_at,
      };
      const retry = await supabase
        .from('page_notification_preferences')
        .upsert(legacyPayload, { onConflict: 'page_id,user_id' })
        .select('*')
        .maybeSingle();
      data = retry.data;
      error = retry.error;
    }

    if (error) return { success: false, error: error.message };
    void logPageAuditEvent(pageId, 'notification_prefs_updated', 'Updated Page notification preferences');
    return {
      success: true,
      preferences: { ...fullPayload, ...(data || {}) } as PageNotificationPreferences,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to save notification preferences.',
    };
  }
}

/**
 * Page Settings: Real Activity & Security Audit Logs
 */
export async function logPageAuditEvent(
  pageId: string,
  action: string,
  details?: string,
  metadata?: Record<string, any>
): Promise<void> {
  if (!pageId || !action) return;
  try {
    await supabase.rpc('log_page_audit_event', {
      p_page_id: pageId,
      p_action: action,
      p_details: details || null,
      p_metadata: metadata || {},
    });
  } catch {
    // Non-blocking audit trail
  }
}

export async function fetchPageAuditLogs(
  pageId: string,
  limit = 40
): Promise<PageAuditLogEntry[]> {
  if (!pageId) return [];
  try {
    const { data, error } = await supabase
      .from('page_audit_logs')
      .select('id, page_id, actor_id, action, details, metadata, created_at')
      .eq('page_id', pageId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !data) return [];

    const actorIds = Array.from(
      new Set(data.map((r: any) => r.actor_id).filter((id: any) => isValidUuid(id)))
    );
    const pMap = new Map<string, any>();
    if (actorIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, display_name, username, avatar_url')
        .in('id', actorIds);
      for (const p of profs || []) pMap.set(p.id, p);
    }

    return data.map((r: any) => ({
      ...r,
      actor: r.actor_id ? pMap.get(r.actor_id) : undefined,
    }));
  } catch {
    return [];
  }
}

/**
 * Page Settings: Owner Visibility Toggle (Disable / Reactivate without deleting)
 */
export async function updatePageStatusByOwner(
  pageId: string,
  nextStatus: 'active' | 'disabled',
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.rpc('update_page_status_owner', {
      p_page_id: pageId,
      p_status: nextStatus,
      ...(reason ? { p_reason: reason.trim() } : {}),
    });

    if (!error) return { success: true };

    // Direct owner fallback if RPC migration hasn't been applied yet
    const direct = await supabase
      .from('pages')
      .update({
        status: nextStatus,
        is_active: nextStatus === 'active',
        disabled_reason:
          nextStatus === 'disabled'
            ? reason?.trim() || 'Temporarily disabled by Page Owner'
            : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pageId)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle();

    if (direct.error) return { success: false, error: direct.error.message };
    if (!direct.data) return { success: false, error: error.message || 'Only the Page Owner can change visibility status.' };
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update Page visibility.',
    };
  }
}

/**
 * Page Settings: Cancel Pending Admin Invitation
 */
export async function cancelPageAdminInvite(
  invitationId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.rpc('cancel_page_admin_invite', {
      p_invitation_id: invitationId,
    });
    if (!error) return { success: true };

    const direct = await supabase
      .from('page_admin_invitations')
      .update({ status: 'cancelled', responded_at: new Date().toISOString() })
      .eq('id', invitationId)
      .eq('status', 'pending');

    if (direct.error) return { success: false, error: direct.error.message };
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to cancel invitation.',
    };
  }
}

/**
 * Page Settings: Check Slug Availability & Update Page Handle (Owner-only)
 */
export async function checkPageSlugAvailability(
  slug: string,
  excludePageId?: string
): Promise<boolean> {
  const clean = slug.trim().toLowerCase().replace(/^@+/, '');
  if (!/^[a-z0-9][a-z0-9_-]{2,40}$/.test(clean)) return false;
  try {
    const { data, error } = await supabase.rpc('check_page_slug_availability', {
      p_slug: clean,
      ...(excludePageId ? { p_exclude_page_id: excludePageId } : {}),
    });
    if (!error && typeof data === 'boolean') return data;

    let q = supabase.from('pages').select('id').ilike('slug', clean);
    if (excludePageId) q = q.neq('id', excludePageId);
    const res = await q.limit(1);
    return !res.error && (!res.data || res.data.length === 0);
  } catch {
    return false;
  }
}

export async function updatePageSlug(
  pageId: string,
  slug: string
): Promise<{ success: boolean; slug?: string; error?: string }> {
  const clean = slug.trim().toLowerCase().replace(/^@+/, '');
  if (!/^[a-z0-9][a-z0-9_-]{2,40}$/.test(clean)) {
    return {
      success: false,
      error: 'Handle must be 3-41 characters using lowercase letters, numbers, hyphens, or underscores.',
    };
  }
  try {
    const { data, error } = await supabase.rpc('update_page_slug', {
      p_page_id: pageId,
      p_slug: clean,
    });
    if (!error) return { success: true, slug: typeof data === 'string' ? data : clean };

    const msg = error.message || '';
    if (/23505|already taken|duplicate|unique/i.test(msg)) {
      return { success: false, error: 'That Page handle is already taken.' };
    }

    const direct = await supabase
      .from('pages')
      .update({ slug: clean, updated_at: new Date().toISOString() })
      .eq('id', pageId)
      .select('slug')
      .maybeSingle();

    if (direct.error) return { success: false, error: direct.error.message };
    if (!direct.data) return { success: false, error: error.message || 'Only the Page Owner can change the handle.' };
    return { success: true, slug: direct.data.slug };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update Page handle.',
    };
  }
}

/**
 * Page Settings: Role Management & Ownership Transfer (Owner-only)
 */
export async function updatePageManagerRole(
  pageId: string,
  userId: string,
  role: 'admin' | 'editor' | 'moderator'
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.rpc('update_page_manager_role', {
      p_page_id: pageId,
      p_user_id: userId,
      p_role: role,
    });
    if (!error) return { success: true };

    const direct = await supabase
      .from('page_managers')
      .update({ role })
      .eq('page_id', pageId)
      .eq('user_id', userId)
      .neq('role', 'owner');
    if (!direct.error) {
      void logPageAuditEvent(pageId, 'manager_role_updated', `Updated member role to ${role}`);
      return { success: true };
    }
    return { success: false, error: error.message || direct.error.message };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update team member role.',
    };
  }
}

export async function transferPageOwnership(
  pageId: string,
  newOwnerId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.rpc('transfer_page_ownership', {
      p_page_id: pageId,
      p_new_owner_id: newOwnerId,
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to transfer Page ownership.',
    };
  }
}

/**
 * Page Settings (Content Management): Fetch ALL posts for Page managers (including hidden) + Toggle Hide
 */
export async function fetchPagePostsForManager(
  pageId: string,
  currentUserId?: string
): Promise<Post[]> {
  try {
    const postFilter =
      pageId === MR_ANONYMOUS_PAGE_ID
        ? `page_id.eq.${pageId},author_page_id.eq.${pageId},author_id.eq.${MR_ANONYMOUS_DUMMY_ID}`
        : `page_id.eq.${pageId},author_page_id.eq.${pageId}`;

    const { data, error } = await supabase
      .from('posts')
      .select(`
        *,
        author:profiles!posts_author_id_fkey(*),
        page:pages!posts_page_id_fkey(*),
        post_media(*),
        post_reactions(*),
        comments(id)
      `)
      .or(postFilter)
      .order('is_pinned', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(80);

    if (error || !data) return fetchPagePosts(pageId, currentUserId);
    const rows = data as unknown as SupabasePostRow[];
    await resolvePostMediaUrlsOnRows(rows);
    return rows
      .map((row) => mapSupabasePostToFrontend(row, currentUserId))
      .sort((a, b) => Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned)));
  } catch {
    return fetchPagePosts(pageId, currentUserId);
  }
}

export async function toggleHidePagePost(
  pageId: string,
  postId: string,
  hidden: boolean
): Promise<{ success: boolean; visibility?: string; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('toggle_hide_page_post', {
      p_post_id: postId,
      p_hidden: hidden,
    });
    if (!error) {
      return { success: true, visibility: typeof data === 'string' ? data : hidden ? 'hidden' : 'public' };
    }

    const nextVisibility = hidden ? 'hidden' : 'public';
    const direct = await supabase
      .from('posts')
      .update({ visibility: nextVisibility, updated_at: new Date().toISOString() })
      .eq('id', postId)
      .or(`page_id.eq.${pageId},author_page_id.eq.${pageId}`);
    if (direct.error) return { success: false, error: error.message || direct.error.message };
    void logPageAuditEvent(
      pageId,
      hidden ? 'post_hidden' : 'post_unhidden',
      hidden ? 'Hid a Page post from public feed' : 'Restored a hidden Page post'
    );
    return { success: true, visibility: nextVisibility };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update post visibility.',
    };
  }
}

/**
 * Page Settings: Restricted Accounts (limits interaction without full profile block)
 */
export async function fetchPageRestrictedUsers(pageId: string): Promise<PageRestrictedUser[]> {
  try {
    const { data, error } = await supabase
      .from('page_restricted_users')
      .select('page_id, user_id, restricted_by, reason, created_at')
      .eq('page_id', pageId)
      .order('created_at', { ascending: false });
    if (error || !data) return [];
    const uids = Array.from(new Set(data.map((r: any) => r.user_id).filter(Boolean)));
    const pMap = new Map<string, any>();
    if (uids.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, display_name, username, avatar_url, department')
        .in('id', uids);
      for (const p of profs || []) pMap.set(p.id, p);
    }
    return data.map((r: any) => ({
      ...r,
      user: r.user_id ? pMap.get(r.user_id) : undefined,
    }));
  } catch {
    return [];
  }
}

export async function restrictUserFromPage(
  pageId: string,
  userId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const actorId = sessionData.session?.user?.id || null;
    const { error } = await supabase.from('page_restricted_users').upsert({
      page_id: pageId,
      user_id: userId,
      restricted_by: actorId,
      reason: reason?.trim() || null,
      created_at: new Date().toISOString(),
    });
    if (error) return { success: false, error: error.message };
    void logPageAuditEvent(pageId, 'user_restricted', 'Restricted a user from commenting/messaging');
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to restrict user.' };
  }
}

export async function unrestrictUserFromPage(
  pageId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('page_restricted_users')
      .delete()
      .eq('page_id', pageId)
      .eq('user_id', userId);
    if (error) return { success: false, error: error.message };
    void logPageAuditEvent(pageId, 'user_unrestricted', 'Removed user restriction');
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to unrestrict user.' };
  }
}

/**
 * Page Verification Requests (Page Manager submission + Super Admin review queue)
 */
export async function fetchPageVerificationRequests(
  pageId: string
): Promise<PageVerificationRequest[]> {
  try {
    const { data, error } = await supabase
      .from('page_verification_requests')
      .select('*')
      .eq('page_id', pageId)
      .order('created_at', { ascending: false });
    if (error || !data) return [];
    return data as PageVerificationRequest[];
  } catch {
    return [];
  }
}

export async function submitPageVerificationRequest(params: {
  pageId: string;
  category: PageCategory;
  officialName: string;
  reason: string;
  evidenceUrl?: string;
}): Promise<{ success: boolean; requestId?: string; error?: string }> {
  const officialName = params.officialName.trim();
  const reason = params.reason.trim();
  const evidenceUrl = params.evidenceUrl?.trim() || '';

  if (officialName.length < 3) {
    return { success: false, error: 'Official Page / organization name must be at least 3 characters.' };
  }
  if (reason.length < 15) {
    return { success: false, error: 'Please explain why this Page qualifies (at least 15 characters).' };
  }
  if (evidenceUrl && !/^https?:\/\//i.test(evidenceUrl)) {
    return { success: false, error: 'Evidence link must start with https:// or http://' };
  }

  try {
    const { data, error } = await supabase.rpc('submit_page_verification_request', {
      p_page_id: params.pageId,
      p_category: toCanonicalPageCategory(params.category),
      p_official_name: officialName,
      p_reason: reason,
      p_evidence_url: evidenceUrl || null,
    });
    if (!error) {
      return { success: true, requestId: typeof data === 'string' ? data : undefined };
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user?.id;
    if (!uid) return { success: false, error: 'Authentication required.' };

    const direct = await supabase
      .from('page_verification_requests')
      .insert({
        page_id: params.pageId,
        requested_by: uid,
        category: toCanonicalPageCategory(params.category),
        official_name: officialName,
        reason,
        evidence_url: evidenceUrl || null,
        status: 'pending',
      })
      .select('id')
      .single();

    if (direct.error) return { success: false, error: error.message || direct.error.message };
    void logPageAuditEvent(params.pageId, 'verification_requested', `Requested verification as ${officialName}`);
    return { success: true, requestId: direct.data?.id };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to submit verification request.',
    };
  }
}

export async function adminListVerificationRequests(): Promise<PageVerificationRequest[]> {
  try {
    const token = await getAuthToken();
    if (token) {
      const res = await fetch('/api/admin/pages/verification-requests', {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);
      const json = res?.ok ? await parseApiJson(res) : null;
      if (json?.success && Array.isArray(json.requests)) {
        return json.requests as PageVerificationRequest[];
      }
    }

    const { data, error } = await supabase
      .from('page_verification_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(120);
    if (error || !data) return [];

    const pageIds = Array.from(new Set(data.map((r: any) => r.page_id).filter(Boolean)));
    const userIds = Array.from(new Set(data.map((r: any) => r.requested_by).filter(Boolean)));
    const [pagesRes, profsRes] = await Promise.all([
      pageIds.length > 0
        ? supabase.from('pages').select('id, name, slug, avatar_url, category, is_verified, status').in('id', pageIds)
        : Promise.resolve({ data: [] as any[] }),
      userIds.length > 0
        ? supabase.from('profiles').select('id, display_name, username, avatar_url').in('id', userIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const pMap = new Map<string, any>();
    for (const p of pagesRes.data || []) pMap.set(p.id, p);
    const uMap = new Map<string, any>();
    for (const u of profsRes.data || []) uMap.set(u.id, u);

    return data.map((r: any) => ({
      ...r,
      page: pMap.get(r.page_id),
      requester: uMap.get(r.requested_by),
    }));
  } catch {
    return [];
  }
}

export async function adminReviewVerificationRequest(
  requestId: string,
  decision: 'approved' | 'rejected',
  reviewNote?: string
): Promise<{ success: boolean; error?: string }> {
  const cleanReqId = String(requestId || '').trim();
  if (!isValidUuid(cleanReqId)) {
    return { success: false, error: 'Page not found.' };
  }

  try {
    const adminCheck = await verifyCurrentUserIsSuperAdmin();
    if (!adminCheck.ok) {
      return { success: false, error: adminCheck.error || 'User is not a super administrator.' };
    }

    const { data, error } = await supabase.rpc('admin_review_verification_request', {
      p_request_id: cleanReqId,
      p_decision: decision,
      ...(reviewNote ? { p_review_note: reviewNote.trim() } : {}),
    });
    if (error) {
      return { success: false, error: classifyAdminVerificationError(error) };
    }
    if (data === false) {
      return { success: false, error: 'Page not found.' };
    }
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: classifyAdminVerificationError(err),
    };
  }
}

/**
 * Page Settings: Cloudinary Media Inventory & Working JSON Data Export
 */
export async function fetchPageMediaInventory(page: Page): Promise<PageMediaInventory> {
  const items: PageMediaInventoryItem[] = [];
  if (page.avatarUrl || page.avatar_url) {
    items.push({
      id: `avatar-${page.id}`,
      kind: 'avatar',
      url: (page.avatarUrl || page.avatar_url)!,
      format: 'image',
      byteSize: 0,
      createdAt: page.updated_at || page.created_at,
    });
  }
  if (page.coverUrl || page.cover_url) {
    items.push({
      id: `cover-${page.id}`,
      kind: 'cover',
      url: (page.coverUrl || page.cover_url)!,
      format: 'image',
      byteSize: 0,
      createdAt: page.updated_at || page.created_at,
    });
  }

  try {
    const posts = await fetchPagePostsForManager(page.id);
    for (const post of posts) {
      const mediaItems: PostMediaItem[] = Array.isArray(post.mediaItems) ? post.mediaItems : [];
      for (const m of mediaItems) {
        if (!m?.secure_url) continue;
        items.push({
          id: m.id || `${post.id}-${m.asset_id}`,
          kind: m.kind === 'video' ? 'post_video' : 'post_image',
          url: m.secure_url,
          thumbnailUrl: m.thumbnail_url || null,
          format: m.format || m.kind || 'media',
          byteSize: typeof m.bytes === 'number' && Number.isFinite(m.bytes) ? m.bytes : 0,
          createdAt: post.createdAt,
          postId: post.id,
        });
      }
    }
  } catch {
    // Non-blocking fallback returns avatar/cover entries
  }

  const imageCount = items.filter((i) => i.kind !== 'post_video').length;
  const videoCount = items.filter((i) => i.kind === 'post_video').length;
  const totalBytes = items.reduce((acc, i) => acc + (i.byteSize || 0), 0);

  return {
    totalFiles: items.length,
    imageCount,
    videoCount,
    totalBytes,
    items,
  };
}

export async function buildPageDataExportBundle(page: Page, userId?: string): Promise<Record<string, any>> {
  const [posts, managers, followers, auditLogs, mediaInventory] = await Promise.all([
    fetchPagePostsForManager(page.id, userId),
    fetchPageManagers(page.id),
    fetchPageFollowers(page.id, 500),
    fetchPageAuditLogs(page.id, 200),
    fetchPageMediaInventory(page),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    platform: 'ABSU Connect',
    page: {
      id: page.id,
      name: page.name,
      slug: page.slug,
      category: page.category,
      description: page.description,
      location: page.location,
      website: page.website,
      contact_email: page.contact_email,
      contact_phone: page.contact_phone,
      whatsapp: page.whatsapp,
      is_verified: Boolean(page.isVerified),
      status: page.status,
      followers_count: page.followersCount,
      posts_count: posts.length,
      created_at: page.createdAt,
    },
    team: managers.map((m) => ({
      user_id: m.user_id,
      role: m.role,
      name: m.user?.display_name || null,
      username: m.user?.username || null,
      added_at: m.created_at,
    })),
    followersCount: followers.length,
    posts: posts.map((p) => ({
      id: p.id,
      content: p.content,
      visibility: p.visibility,
      isPinned: Boolean(p.isPinned),
      createdAt: p.createdAt,
      likesCount: p.likesCount,
      commentsCount: p.commentsCount ?? p.comments.length,
      mediaUrls: (p.mediaItems || []).map((m) => m.secure_url),
    })),
    mediaInventory,
    auditLogs: auditLogs.map((l) => ({
      id: l.id,
      action: l.action,
      details: l.details,
      created_at: l.created_at,
    })),
  };
}

