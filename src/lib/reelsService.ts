import { supabase } from './supabase.ts';
import type { Post, PostMediaItem } from '../types/index.ts';
import {
  fetchModeratedPostIds,
  fetchSavedPostIds,
  fetchSinglePostById,
  getDirectSafetyContext,
  hydratePostRowsFromSupabase,
  mapSupabasePostToFrontend,
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
  page:pages(*),
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
  if (item.kind === 'video') return true;
  const url = (item.secure_url || '').toLowerCase();
  const fmt = (item.format || '').toLowerCase();
  return (
    fmt === 'mp4' ||
    fmt === 'webm' ||
    fmt === 'mov' ||
    fmt === 'm4v' ||
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
  if (!row.page_id && blockedIds.has(row.author_id)) return false;
  if (
    row.visibility === 'friends' &&
    row.author_id !== currentUserId &&
    !friendIds.has(row.author_id)
  ) {
    return false;
  }
  return Array.isArray(row.post_media) && row.post_media.some((m) => isVideoMediaItem(m as PostMediaItem));
}

async function queryReelsRowsResilient(
  applyFilters: (query: any, useInner: boolean) => any
): Promise<{ rows: SupabasePostRow[]; error?: string }> {
  const richRes = await applyFilters(supabase.from('posts').select(REELS_RICH_SELECT), true);
  if (!richRes.error) {
    return { rows: (richRes.data || []) as unknown as SupabasePostRow[] };
  }

  const coreRes = await applyFilters(supabase.from('posts').select(REELS_CORE_SELECT), true);
  if (!coreRes.error) {
    const hydrated = await hydratePostRowsFromSupabase(
      (coreRes.data || []) as unknown as SupabasePostRow[]
    );
    return { rows: hydrated };
  }

  const minimalRes = await applyFilters(
    supabase.from('posts').select('*, post_media!inner(*)'),
    true
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
 * Strictly reads from public social `posts` + `post_media` (NEVER `messages` or `message_attachments`).
 */
export async function fetchReelsFeedPage(options: {
  currentUserId?: string;
  cursor?: string | null;
  limit?: number;
}): Promise<ReelsPageResult> {
  const limit = Math.min(Math.max(options.limit ?? 8, 2), 30);
  const cursor = options.cursor || null;

  try {
    const [postsRes, savedSet, moderatedSet, safetyCtx] = await Promise.all([
      queryReelsRowsResilient((q) => {
        let next = q
          .eq('post_media.kind', 'video')
          .neq('visibility', 'hidden')
          .order('created_at', { ascending: false });
        if (cursor) {
          next = next.lt('created_at', cursor);
        }
        return next.limit(limit);
      }),
      fetchSavedPostIds(options.currentUserId),
      fetchModeratedPostIds(),
      getDirectSafetyContext(options.currentUserId),
    ]);

    if (postsRes.error || postsRes.rows.length === 0) {
      return { reels: [], hasMore: false, nextCursor: null };
    }

    await resolvePostMediaUrlsOnRows(postsRes.rows);

    const seenIds = new Set<string>();
    const eligibleRows: SupabasePostRow[] = [];
    for (const row of postsRes.rows) {
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

    const reels = eligibleRows
      .map((row) =>
        normalizePostForReels(
          mapSupabasePostToFrontend(row, options.currentUserId, savedSet, safetyCtx.friendIds)
        )
      )
      .filter((p) => isVideoPost(p));

    const hasMore = postsRes.rows.length >= limit;
    const nextCursor = hasMore ? postsRes.rows[postsRes.rows.length - 1]?.created_at || null : null;

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
    const noHash = cleaned.replace(/^#+/, '').trim();
    const captionPattern = `%${cleaned}%`;
    const tagPattern = noHash ? `%#${noHash}%` : captionPattern;

    // 1. Find matching creator profile IDs (display_name, username, department)
    const { data: matchingProfiles } = await supabase
      .from('profiles')
      .select('id')
      .or(
        `display_name.ilike.%${noHash || cleaned}%,username.ilike.%${noHash || cleaned}%,department.ilike.%${noHash || cleaned}%`
      )
      .limit(30);

    const matchingAuthorIds = ((matchingProfiles || []) as Array<{ id: string }>)
      .map((p) => p.id)
      .filter(Boolean);

    const orClauses = [`body.ilike.${captionPattern}`];
    if (tagPattern !== captionPattern) {
      orClauses.push(`body.ilike.${tagPattern}`);
    }
    if (matchingAuthorIds.length > 0) {
      orClauses.push(`author_id.in.(${matchingAuthorIds.join(',')})`);
    }

    const [postsRes, savedSet, moderatedSet, safetyCtx] = await Promise.all([
      queryReelsRowsResilient((q) =>
        q
          .eq('post_media.kind', 'video')
          .neq('visibility', 'hidden')
          .or(orClauses.join(','))
          .order('created_at', { ascending: false })
          .limit(limit)
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
