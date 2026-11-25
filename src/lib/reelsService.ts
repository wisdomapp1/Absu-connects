import { supabase } from './supabase.ts';
import type { Post, PostMediaItem } from '../types/index.ts';
import {
  fetchModeratedPostIds,
  fetchSavedPostIds,
  fetchSinglePostById,
  getDirectSafetyContext,
  getOptionalAuthHeaders,
  hydratePostRowsFromSupabase,
  mapSupabasePostToFrontend,
  parseApiJson,
  querySupabasePostsResilient,
  resolvePostMediaUrlsOnRows,
  type SupabasePostRow,
} from './postService.ts';

export interface ReelsPageResult {
  reels: Post[];
  hasMore: boolean;
  nextCursor: string | null;
}

const REELS_RICH_SELECT = `
  *,
  author:profiles!posts_author_id_fkey(*),
  page:pages!posts_page_id_fkey(*),
  community:communities(*),
  post_media!inner(*),
  post_reactions(*),
  comments(id)
`;

const REELS_CORE_SELECT = `
  *,
  author:profiles!posts_author_id_fkey(*),
  post_media!inner(*),
  post_reactions(*),
  comments(id)
`;

export function isVideoMediaItem(item?: PostMediaItem | null): boolean {
  if (!item) return false;
  if (String(item.kind || '').toLowerCase() === 'video') return true;
  const url = (item.secure_url || '').toLowerCase();
  const fmt = (item.format || '').toLowerCase();
  return (
    fmt === 'mp4' ||
    fmt === 'webm' ||
    fmt === 'mov' ||
    fmt === 'm4v' ||
    fmt === 'ogg' ||
    url.includes('/video/') ||
    Boolean(url.match(/\.(mp4|webm|mov|ogg|m4v)(\?.*)?$/i))
  );
}

export function getPrimaryVideoMediaItem(post?: Post | null): PostMediaItem | null {
  if (!post) return null;
  if (Array.isArray(post.mediaItems) && post.mediaItems.length > 0) {
    const found = post.mediaItems.find((item) => isVideoMediaItem(item));
    if (found) return found;
  }
  if (post.mediaType === 'video' && post.mediaUrl) {
    return {
      secure_url: post.mediaUrl,
      kind: 'video',
      provider: post.mediaUrl.includes('res.cloudinary.com') ? 'cloudinary' : 'supabase',
    };
  }
  return null;
}

export function isVideoPost(post?: Post | null): boolean {
  return Boolean(getPrimaryVideoMediaItem(post));
}

export function normalizePostForReels(post: Post): Post {
  const videoItem = getPrimaryVideoMediaItem(post);
  if (!videoItem) return post;
  return {
    ...post,
    mediaUrl: videoItem.secure_url || post.mediaUrl,
    mediaType: 'video',
  };
}

export function mergeAndDedupeReels(primary: Post[], secondary: Post[]): Post[] {
  const seen = new Set<string>();
  const out: Post[] = [];
  for (const list of [primary, secondary]) {
    for (const item of list) {
      if (!item?.id || seen.has(item.id) || !isVideoPost(item)) continue;
      seen.add(item.id);
      out.push(normalizePostForReels(item));
    }
  }
  return out;
}

function isRowEligibleForReels(
  row: SupabasePostRow,
  currentUserId: string | undefined,
  moderatedSet: Set<string>,
  blockedIds: Set<string>,
  friendIds: Set<string>
): boolean {
  if (!row || !row.id) return false;
  if (row.visibility === 'hidden') return false;
  if (moderatedSet.has(row.id)) return false;
  if (row.page && row.page.status && row.page.status !== 'active') return false;
  if (!row.page_id && !row.author_page_id && row.author_id && blockedIds.has(row.author_id)) return false;
  if (
    row.visibility === 'friends' &&
    row.author_id !== currentUserId &&
    (!row.author_id || !friendIds.has(row.author_id))
  ) {
    return false;
  }
  return Array.isArray(row.post_media) && row.post_media.some((m) => isVideoMediaItem(m as PostMediaItem));
}

async function queryReelsRowsResilient(
  applyFilters: (query: any) => any
): Promise<{ rows: SupabasePostRow[]; error?: string }> {
  const richRes = await applyFilters(supabase.from('posts').select(REELS_RICH_SELECT));
  if (!richRes.error) {
    return { rows: (richRes.data || []) as unknown as SupabasePostRow[] };
  }

  const coreRes = await applyFilters(supabase.from('posts').select(REELS_CORE_SELECT));
  if (!coreRes.error) {
    const hydrated = await hydratePostRowsFromSupabase(
      (coreRes.data || []) as unknown as SupabasePostRow[]
    );
    return { rows: hydrated };
  }

  const minimalRes = await applyFilters(
    supabase.from('posts').select('*, post_media!inner(*)')
  );
  if (!minimalRes.error) {
    const hydrated = await hydratePostRowsFromSupabase(
      (minimalRes.data || []) as unknown as SupabasePostRow[]
    );
    return { rows: hydrated };
  }

  return {
    rows: [],
    error: richRes.error.message || coreRes.error.message || minimalRes.error.message,
  };
}

/**
 * Fetch paginated video-only social posts for the dedicated Reels screen.
 * 1. Uses `/api/posts/reels` server route first so all published feed/community/legacy videos appear.
 * 2. Falls back to resilient direct Supabase queries (without dropping NULL visibility rows).
 * Strictly reads public social `posts` + `post_media` (NEVER `messages` or `message_attachments`).
 */
export async function fetchReelsFeedPage(options: {
  currentUserId?: string;
  cursor?: string | null;
  limit?: number;
}): Promise<ReelsPageResult> {
  const limit = Math.min(Math.max(options.limit ?? 10, 2), 30);
  const cursor = options.cursor || null;

  try {
    // 1. Server API route first
    try {
      const headers = await getOptionalAuthHeaders();
      const params = new URLSearchParams({ limit: String(limit) });
      if (cursor) params.set('before', cursor);
      const apiRes = await fetch(`/api/posts/reels?${params.toString()}`, { headers }).catch(() => null);
      const json = apiRes?.ok ? await parseApiJson(apiRes) : null;
      if (json?.success && Array.isArray(json.posts)) {
        const rows = json.posts as SupabasePostRow[];
        const savedSet = new Set<string>(json.savedPostIds || []);
        const friendSet = new Set<string>(json.friendIds || []);
        const reels = rows
          .map((row) =>
            normalizePostForReels(
              mapSupabasePostToFrontend(row, options.currentUserId, savedSet, friendSet)
            )
          )
          .filter((p) => isVideoPost(p));

        return {
          reels,
          hasMore: Boolean(json.hasMore),
          nextCursor: typeof json.nextCursor === 'string' ? json.nextCursor : null,
        };
      }
    } catch {
      // Fall back to direct Supabase queries below
    }

    // 2. Direct Supabase fallback (do NOT use SQL .neq('visibility', 'hidden') which drops NULL visibility!)
    const [postsRes, savedSet, moderatedSet, safetyCtx] = await Promise.all([
      queryReelsRowsResilient((q) => {
        let next = q.eq('post_media.kind', 'video').order('created_at', { ascending: false });
        if (cursor) {
          next = next.lt('created_at', cursor);
        }
        return next.limit(limit * 2);
      }),
      fetchSavedPostIds(options.currentUserId),
      fetchModeratedPostIds(),
      getDirectSafetyContext(options.currentUserId),
    ]);

    let sourceRows = postsRes.rows;

    // 3. Secondary fallback: scan post_media directly if !inner join returned 0 rows (e.g. kind='image' with .mp4 URL or join RLS quirk)
    if (sourceRows.length === 0) {
      const { data: mediaRows } = await supabase
        .from('post_media')
        .select('post_id, kind, format, secure_url, created_at')
        .order('created_at', { ascending: false })
        .limit(120);

      const candidatePostIds = Array.from(
        new Set(
          (mediaRows || [])
            .filter((m: any) => isVideoMediaItem(m as PostMediaItem))
            .map((m: any) => m.post_id)
            .filter(Boolean)
        )
      ).slice(0, 40);

      if (candidatePostIds.length > 0) {
        const directRes = await querySupabasePostsResilient((q) => {
          let next = q.in('id', candidatePostIds).order('created_at', { ascending: false });
          if (cursor) {
            next = next.lt('created_at', cursor);
          }
          return next;
        });
        sourceRows = directRes.rows;
      }
    }

    // 3b. Merge active `page_reels` view rows when present so Page video posts always appear in Reels
    let pageReelPosts: Post[] = [];
    if (!cursor) {
      try {
        const { data: prRows } = await supabase
          .from('page_reels')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(20);
        if (Array.isArray(prRows) && prRows.length > 0) {
          pageReelPosts = prRows.map((pr: any) => ({
            id: pr.post_id,
            author: {
              id: pr.page_id,
              name: pr.page_name || 'ABSU Page',
              avatar:
                pr.page_avatar_url ||
                `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
                  pr.page_name || 'Page'
                )}&backgroundColor=6d45d9&textColor=ffffff`,
              handle: `@${pr.page_id}`,
              department: 'Page',
              faculty: 'Abia State University',
              level: pr.is_verified ? 'Verified Page' : 'Page',
              campus: 'Uturu Campus',
              bio: '',
              interests: [],
              isVerified: Boolean(pr.is_verified),
              relationshipState: 'none' as const,
            },
            content: pr.caption || '',
            mediaUrl: pr.secure_url,
            mediaType: 'video' as const,
            mediaItems: [
              {
                secure_url: pr.secure_url,
                thumbnail_url: pr.thumbnail_url || undefined,
                duration_seconds: pr.duration_seconds || undefined,
                kind: 'video' as const,
                provider: pr.secure_url?.includes('res.cloudinary.com') ? 'cloudinary' : 'supabase',
              },
            ],
            category: 'General',
            audience: 'Public',
            createdAt: new Date(pr.created_at).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
            }),
            likesCount: 0,
            isLiked: false,
            isSaved: savedSet.has(pr.post_id),
            comments: [],
            commentsCount: 0,
            pageId: pr.page_id,
            authorPageId: pr.page_id,
            authorAsPage: true,
            isPagePost: true,
            pageIsVerified: Boolean(pr.is_verified),
            pageStatus: 'active',
          }));
        }
      } catch {
        // Non-blocking fallback
      }
    }

    if (sourceRows.length === 0 && pageReelPosts.length === 0) {
      return { reels: [], hasMore: false, nextCursor: null };
    }

    await resolvePostMediaUrlsOnRows(sourceRows);

    const seenIds = new Set<string>();
    const eligibleRows: SupabasePostRow[] = [];
    for (const row of sourceRows) {
      if (seenIds.has(row.id)) continue;
      seenIds.add(row.id);
      if (
        isRowEligibleForReels(
          row,
          options.currentUserId,
          moderatedSet,
          safetyCtx.blockedIds,
          safetyCtx.friendIds
        )
      ) {
        eligibleRows.push(row);
      }
    }

    const mappedReels = eligibleRows
      .slice(0, limit)
      .map((row) =>
        normalizePostForReels(
          mapSupabasePostToFrontend(row, options.currentUserId, savedSet, safetyCtx.friendIds)
        )
      )
      .filter((p) => isVideoPost(p));

    const reels = mergeAndDedupeReels(mappedReels, pageReelPosts).slice(0, limit);
    const hasMore = eligibleRows.length > limit || sourceRows.length >= limit * 2;
    const nextCursor = hasMore ? sourceRows[sourceRows.length - 1]?.created_at || null : null;

    return { reels, hasMore, nextCursor };
  } catch (err) {
    console.warn('[Reels] Error fetching Reels page:', err);
    return { reels: [], hasMore: false, nextCursor: null };
  }
}

/**
 * Fetch a single video post by ID for deep-linking into ReelsView.
 */
export async function fetchSingleReelById(
  postId: string,
  currentUserId?: string
): Promise<Post | null> {
  if (!postId) return null;
  const res = await fetchSinglePostById(postId, currentUserId);
  if (res.status !== 'ok' || !res.post) return null;
  if (!isVideoPost(res.post)) return null;
  return normalizePostForReels(res.post);
}

/**
 * Check whether a post has at least one video attachment (used for routing activity alerts to Reels vs PostDetail).
 */
export async function checkPostHasVideo(postId?: string | null): Promise<boolean> {
  if (!postId) return false;
  try {
    const { data, error } = await supabase
      .from('post_media')
      .select('kind, format, secure_url')
      .eq('post_id', postId)
      .limit(10);

    if (error || !data) return false;
    return data.some((item: any) => isVideoMediaItem(item as PostMediaItem));
  } catch {
    return false;
  }
}

/**
 * Search eligible published video posts in Reels by caption, #hashtags, or creator username/display name.
 * Never returns non-video posts or private DMs.
 */
export async function searchReelsVideos(
  rawQuery: string,
  currentUserId?: string,
  limit = 24
): Promise<Post[]> {
  const cleaned = rawQuery.trim().replace(/[,%()]/g, ' ').trim();
  if (!cleaned) {
    const latest = await fetchReelsFeedPage({ currentUserId, limit });
    return latest.reels;
  }

  try {
    try {
      const headers = await getOptionalAuthHeaders();
      const params = new URLSearchParams({ q: cleaned, limit: String(limit) });
      const apiRes = await fetch(`/api/posts/reels/search?${params.toString()}`, { headers }).catch(() => null);
      const json = apiRes?.ok ? await parseApiJson(apiRes) : null;
      if (json?.success && Array.isArray(json.posts)) {
        const rows = json.posts as SupabasePostRow[];
        const savedSet = new Set<string>(json.savedPostIds || []);
        const friendSet = new Set<string>(json.friendIds || []);
        return rows
          .map((row) =>
            normalizePostForReels(
              mapSupabasePostToFrontend(row, currentUserId, savedSet, friendSet)
            )
          )
          .filter((p) => isVideoPost(p));
      }
    } catch {
      // Fall back to direct Supabase query below
    }

    const noHash = cleaned.replace(/^#+/, '').trim();
    const captionPattern = `%${cleaned}%`;
    const tagPattern = noHash ? `%#${noHash}%` : captionPattern;

    // 1. Find matching creator profile IDs AND active Page IDs
    const [{ data: matchingProfiles }, { data: matchingPages }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id')
        .or(
          `display_name.ilike.%${noHash || cleaned}%,username.ilike.%${noHash || cleaned}%,department.ilike.%${noHash || cleaned}%`
        )
        .limit(30),
      supabase
        .from('pages')
        .select('id')
        .eq('status', 'active')
        .or(`name.ilike.%${noHash || cleaned}%,slug.ilike.%${noHash || cleaned}%`)
        .limit(20),
    ]);

    const matchingAuthorIds = ((matchingProfiles || []) as Array<{ id: string }>)
      .map((p) => p.id)
      .filter(Boolean);
    const matchingPageIds = ((matchingPages || []) as Array<{ id: string }>)
      .map((p) => p.id)
      .filter(Boolean);

    const orClauses = [`body.ilike.${captionPattern}`];
    if (tagPattern !== captionPattern) {
      orClauses.push(`body.ilike.${tagPattern}`);
    }
    if (matchingAuthorIds.length > 0) {
      orClauses.push(`author_id.in.(${matchingAuthorIds.join(',')})`);
    }
    if (matchingPageIds.length > 0) {
      orClauses.push(`page_id.in.(${matchingPageIds.join(',')})`);
    }

    const [postsRes, savedSet, moderatedSet, safetyCtx] = await Promise.all([
      queryReelsRowsResilient((q) =>
        q
          .eq('post_media.kind', 'video')
          .or(orClauses.join(','))
          .order('created_at', { ascending: false })
          .limit(limit * 2)
      ),
      fetchSavedPostIds(currentUserId),
      fetchModeratedPostIds(),
      getDirectSafetyContext(currentUserId),
    ]);

    if (postsRes.error || postsRes.rows.length === 0) return [];
    await resolvePostMediaUrlsOnRows(postsRes.rows);

    const seen = new Set<string>();
    const results: Post[] = [];
    for (const row of postsRes.rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      if (
        isRowEligibleForReels(
          row,
          currentUserId,
          moderatedSet,
          safetyCtx.blockedIds,
          safetyCtx.friendIds
        )
      ) {
        const mapped = normalizePostForReels(
          mapSupabasePostToFrontend(row, currentUserId, savedSet, safetyCtx.friendIds)
        );
        if (isVideoPost(mapped)) {
          results.push(mapped);
          if (results.length >= limit) break;
        }
      }
    }

    return results;
  } catch (err) {
    console.warn('[Reels] Search error:', err);
    return [];
  }
}

export function extractReelsHashtags(reels: Post[], maxTags = 12): string[] {
  const counts = new Map<string, number>();
  for (const post of reels) {
    const matches = (post.content || '').match(/#[a-zA-Z0-9_]+/g) || [];
    for (const raw of matches) {
      const tag = raw.trim();
      if (tag.length < 2 || tag.toLowerCase().startsWith('#community_')) continue;
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTags)
    .map(([tag]) => tag);
}
