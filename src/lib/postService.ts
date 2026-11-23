import { supabase } from './supabase.ts';
import type { User, Post, Comment, PostCategory, PostAudience, PostMediaItem } from '../types/index.ts';
import { mapProfileRowToUser, SupabaseProfileRow } from './profileService.ts';
import {
  batchResolvePostMediaSignedUrls,
  deletePostMediaFilesFromStorage,
  extractPostMediaStoragePath,
} from './storageService.ts';

import {
  deleteCloudinaryAssets,
  extractCloudinaryPublicId,
  type DeleteCloudinaryAssetInput,
} from './cloudinaryService.ts';

export interface SupabasePostRow {
  id: string;
  author_id: string;
  page_id?: string | null;
  page?: {
    id: string;
    slug: string;
    name: string;
    description?: string;
    avatar_url?: string;
  } | null;
  body: string;
  visibility: string;
  created_at: string;
  updated_at: string;
  author?: SupabaseProfileRow;
  post_media?: Array<{
    id: string;
    secure_url?: string;
    asset_id?: string;
    format?: string;
    bytes?: number;
    width?: number;
    height?: number;
    kind?: 'image' | 'video';
    provider?: string;
    position?: number;
    cloudinary_public_id?: string;
    cloudinary_resource_type?: 'image' | 'video' | 'raw' | 'auto';
    duration_seconds?: number;
    thumbnail_url?: string;
    trim_start?: number;
    trim_end?: number;
    is_muted?: boolean;
    aspect_ratio?: '16:9' | '1:1' | '9:16' | 'original';
  }>;
  post_reactions?: Array<{
    post_id: string;
    user_id: string;
    reaction: string;
  }>;
  comments?: Array<{
    id: string;
  }>;
  is_pinned?: boolean;
  community_id?: string;
  community?: {
    id: string;
    name: string;
    slug: string;
    image_url?: string;
  };
}

export function formatTimeAgo(isoString: string): string {
  try {
    const diff = Math.max(0, Date.now() - new Date(isoString).getTime());
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(isoString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return 'Recently';
  }
}

/**
 * Maps Supabase post row + author profile + reactions to frontend Post model
 */
export function mapSupabasePostToFrontend(
  row: SupabasePostRow,
  currentUserId?: string,
  savedPostIds?: Set<string>,
  friendIds?: Set<string>
): Post {
  let author: User;
  const isPagePost = Boolean(row.page_id);

  if (row.page_id) {
    const pageName = row.page?.name || 'Mr Anonymous';
    const pageSlug = row.page?.slug || 'mr-anonymous';
    const pageAvatar =
      row.page?.avatar_url ||
      'https://aqzolewmhpmrcvkrvchn.supabase.co/storage/v1/object/public/profile-avatars/b4f38505-fce6-44be-8727-8ebf04eb2ceb/1793258674588_ysurzh_avatar.jpg';

    author = {
      id: row.page?.id || row.page_id,
      name: pageName,
      avatar: pageAvatar,
      handle: `@${pageSlug}`,
      department: 'Official Campus Page',
      faculty: 'Abia State University',
      level: 'Community',
      campus: 'ABSU Campus',
      bio: row.page?.description || 'Moderated ABSU anonymous confessions, experiences & campus gist.',
      interests: ['#Anonymous', '#Confessions', '#Gist'],
      relationshipState: 'none' as const,
    };
  } else if (row.author) {
    const relState: User['relationshipState'] =
      row.author.id === currentUserId
        ? 'self'
        : friendIds?.has(row.author.id)
        ? 'friends'
        : 'none';
    author = mapProfileRowToUser(row.author, null, relState);
  } else {
    const relState: User['relationshipState'] =
      row.author_id === currentUserId
        ? 'self'
        : friendIds?.has(row.author_id)
        ? 'friends'
        : 'none';
    author = {
      id: row.author_id,
      name: 'ABSU Student',
      avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${row.author_id}&backgroundColor=6d45d9&textColor=ffffff`,
      handle: '@student',
      department: 'Student',
      faculty: 'Abia State University',
      level: 'Undergraduate',
      campus: 'Uturu (Main Campus)',
      bio: '',
      interests: [],
      relationshipState: relState,
    };
  }

  // Map all attached media items
  const rawMedia = row.post_media || [];
  const mediaItems: PostMediaItem[] = rawMedia
    .map((m, idx) => ({
      id: m.id,
      secure_url: m.secure_url || '',
      asset_id: m.asset_id,
      format: m.format,
      bytes: m.bytes,
      width: m.width,
      height: m.height,
      kind: (m.kind === 'video' ||
        (m.format || '').toLowerCase() === 'mp4' ||
        (m.secure_url || '').includes('/video/') ||
        (m.secure_url || '').match(/\.(mp4|webm|mov|ogg|m4v)(\?.*)?$/i)
        ? 'video'
        : 'image') as 'image' | 'video',
      provider: m.provider || (m.secure_url?.includes('res.cloudinary.com') ? 'cloudinary' : 'supabase'),
      position: m.position ?? idx,
      cloudinary_public_id: m.cloudinary_public_id,
      cloudinary_resource_type: m.cloudinary_resource_type,
      duration_seconds: m.duration_seconds,
      thumbnail_url: m.thumbnail_url,
      trim_start: m.trim_start,
      trim_end: m.trim_end,
      is_muted: m.is_muted,
      aspect_ratio: m.aspect_ratio,
    }))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  const primaryMedia = mediaItems[0];
  const mediaUrl = primaryMedia ? primaryMedia.secure_url : undefined;
  const mediaType = primaryMedia ? primaryMedia.kind : undefined;

  const reactions = row.post_reactions || [];
  const isLikedByMe = Boolean(
    currentUserId && reactions.some((r) => r.user_id === currentUserId)
  );

  // Audience mapping
  let audience: PostAudience = 'Public';
  if (row.visibility === 'friends') audience = 'Friends Only';
  else if (row.visibility === 'campus') audience = 'Campus Only';

  // Required Category Hashtag extraction: #Event, #CampusUpdates, #GeneralPost
  let categoryHashtag: '#Event' | '#CampusUpdates' | '#GeneralPost' | undefined = undefined;
  const rawBody = row.body || '';
  if (/(?:^|\s)#Event\b/i.test(rawBody)) {
    categoryHashtag = '#Event';
  } else if (/(?:^|\s)#CampusUpdates\b/i.test(rawBody)) {
    categoryHashtag = '#CampusUpdates';
  } else if (/(?:^|\s)#GeneralPost\b/i.test(rawBody)) {
    categoryHashtag = '#GeneralPost';
  }

  // Category inference from hashtag or content or fallback
  let category: PostCategory = 'General';
  if (categoryHashtag === '#Event') {
    category = 'Event';
  } else if (categoryHashtag === '#CampusUpdates') {
    category = 'Campus Update';
  } else if (categoryHashtag === '#GeneralPost') {
    category = 'General';
  } else {
    const lowerBody = rawBody.toLowerCase();
    if (lowerBody.includes('#academic') || lowerBody.includes('exam') || lowerBody.includes('class') || lowerBody.includes('lecture')) {
      category = 'Academic';
    } else if (lowerBody.includes('#campus') || lowerBody.includes('hostel') || lowerBody.includes('faculty')) {
      category = 'Campus Update';
    } else if (lowerBody.includes('#hostel') || lowerBody.includes('lodge')) {
      category = 'Hostel Life';
    }
  }

  // Community detection from direct row relationship or fallback tag #community_<id>
  let communityId: string | undefined = row.community_id || undefined;
  let communityName: string | undefined = row.community?.name || undefined;
  let communitySlug: string | undefined = row.community?.slug || undefined;
  let communityImageUrl: string | undefined = row.community?.image_url || undefined;
  let displayContent = rawBody;

  const commMatch = rawBody.match(/#community_([a-zA-Z0-9_-]+)/i);
  if (commMatch) {
    if (!communityId) communityId = commMatch[1];
    displayContent = rawBody.replace(/#community_[a-zA-Z0-9_-]+/gi, '').trim();
    if (!communityName) {
      const rawSlug = communityId.replace(/^comm_\d+_/, '').replace(/-/g, ' ');
      if (rawSlug) {
        communityName = rawSlug.charAt(0).toUpperCase() + rawSlug.slice(1);
      }
    }
  }

  return {
    id: row.id,
    author,
    content: displayContent || '',
    mediaUrl,
    mediaType,
    mediaItems,
    category,
    categoryHashtag,
    audience,
    createdAt: formatTimeAgo(row.created_at),
    likesCount: reactions.length,
    isLiked: isLikedByMe,
    isSaved: Boolean(savedPostIds?.has(row.id)),
    commentsCount: Array.isArray(row.comments) ? row.comments.length : 0,
    comments: [],
    isPinned: Boolean(row.is_pinned),
    pageId: row.page_id || undefined,
    isPagePost,
    communityId,
    communityName,
    communitySlug,
    communityImageUrl,
  };
}

/**
 * Resolve fresh signed URLs on post_media rows from persistent storage paths (`post-media`).
 * Preserves public bucket URLs (`profile-avatars`), legacy Cloudinary URLs, and presets untouched.
 */
export async function resolvePostMediaUrlsOnRows(postRows: SupabasePostRow[]): Promise<void> {
  const allMediaRows = postRows.flatMap((r) => r.post_media || []);
  if (allMediaRows.length === 0) return;

  const signedMap = await batchResolvePostMediaSignedUrls(allMediaRows);
  for (const row of postRows) {
    if (!row.post_media) continue;
    for (const m of row.post_media) {
      const storagePath = extractPostMediaStoragePath(m.asset_id, m.secure_url, m.provider);
      if (storagePath) {
        m.asset_id = storagePath;
        if (signedMap.has(storagePath)) {
          m.secure_url = signedMap.get(storagePath);
        } else if (
          !m.secure_url?.startsWith('http://') &&
          !m.secure_url?.startsWith('https://') &&
          !m.secure_url?.startsWith('data:') &&
          !m.secure_url?.startsWith('/')
        ) {
          // Avoid leaving a bare storage path in <img src>; trigger error + retry card instead
          m.secure_url = '';
        }
      } else if (m.secure_url && signedMap.has(m.secure_url)) {
        m.secure_url = signedMap.get(m.secure_url);
      }
    }
  }
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function fetchSavedPostIds(userId?: string): Promise<Set<string>> {
  const savedSet = new Set<string>();
  if (!userId || !UUID_REGEX.test(userId)) return savedSet;
  try {
    const { data, error } = await supabase
      .from('saved_posts')
      .select('post_id')
      .eq('user_id', userId);
    if (!error && Array.isArray(data)) {
      for (const row of data as Array<{ post_id: string }>) {
        if (row.post_id) savedSet.add(row.post_id);
      }
    }
  } catch (err) {
    console.warn('[SavedPosts] Failed to fetch saved post IDs:', err);
  }
  return savedSet;
}

export async function toggleSavePostInDb(
  postId: string,
  userId: string,
  currentlySaved: boolean
): Promise<{ success: boolean; isSaved: boolean; error?: string }> {
  if (!postId || !userId) {
    return { success: false, isSaved: currentlySaved, error: 'Sign in to save posts.' };
  }
  if (!UUID_REGEX.test(postId) || !UUID_REGEX.test(userId)) {
    return {
      success: false,
      isSaved: currentlySaved,
      error: 'This post cannot be saved right now.',
    };
  }

  try {
    if (currentlySaved) {
      const { error } = await supabase
        .from('saved_posts')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', userId);
      if (error) {
        return { success: false, isSaved: currentlySaved, error: error.message };
      }
      return { success: true, isSaved: false };
    }

    // Prevent duplicates gracefully without relying on UPDATE RLS via upsert
    const { data: existing, error: checkErr } = await supabase
      .from('saved_posts')
      .select('id')
      .eq('user_id', userId)
      .eq('post_id', postId)
      .maybeSingle();

    if (!checkErr && existing?.id) {
      return { success: true, isSaved: true };
    }

    const { error } = await supabase.from('saved_posts').insert({
      user_id: userId,
      post_id: postId,
    });

    if (error) {
      const code = (error.code || '').toUpperCase();
      if (code === '23505') {
        // Unique constraint race: already saved in public.saved_posts
        return { success: true, isSaved: true };
      }
      if (code === '23503') {
        return {
          success: false,
          isSaved: currentlySaved,
          error: 'This post is no longer available to save.',
        };
      }
      return { success: false, isSaved: currentlySaved, error: error.message };
    }

    return { success: true, isSaved: true };
  } catch (err: unknown) {
    return {
      success: false,
      isSaved: currentlySaved,
      error: err instanceof Error ? err.message : 'Failed to update saved status.',
    };
  }
}

export async function getOptionalAuthHeaders(): Promise<Record<string, string>> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

export async function parseApiJson(res: Response | null): Promise<any | null> {
  if (!res) return null;
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (!ct.includes('application/json')) return null;
  return await res.json().catch(() => null);
}

export async function fetchModeratedPostIds(): Promise<Set<string>> {
  const moderatedSet = new Set<string>();
  try {
    const modRes = await fetch('/api/content/moderated-posts').catch(() => null);
    if (modRes && modRes.ok) {
      const modData = await parseApiJson(modRes);
      if (modData?.success && modData.moderated) {
        for (const [pId, info] of Object.entries(modData.moderated as Record<string, { action: string }>)) {
          if (info.action === 'hide' || info.action === 'delete') {
            moderatedSet.add(pId);
          }
        }
      }
    }
  } catch {
    // Non-blocking if offline or running on static host
  }
  return moderatedSet;
}

export async function getDirectSafetyContext(currentUserId?: string): Promise<{
  friendIds: Set<string>;
  blockedIds: Set<string>;
}> {
  const friendIds = new Set<string>();
  const blockedIds = new Set<string>();
  if (!currentUserId) return { friendIds, blockedIds };

  try {
    const [friendsRes, blocksRes] = await Promise.all([
      supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${currentUserId},addressee_id.eq.${currentUserId}`),
      supabase
        .from('user_blocks')
        .select('blocker_id, blocked_id')
        .or(`blocker_id.eq.${currentUserId},blocked_id.eq.${currentUserId}`),
    ]);

    for (const f of (friendsRes.data || []) as Array<{ requester_id: string; addressee_id: string }>) {
      if (f.requester_id === currentUserId && f.addressee_id) friendIds.add(f.addressee_id);
      else if (f.addressee_id === currentUserId && f.requester_id) friendIds.add(f.requester_id);
    }

    for (const b of (blocksRes.data || []) as Array<{ blocker_id: string; blocked_id: string }>) {
      if (b.blocker_id === currentUserId && b.blocked_id) blockedIds.add(b.blocked_id);
      else if (b.blocked_id === currentUserId && b.blocker_id) blockedIds.add(b.blocker_id);
    }
  } catch {
    // Non-blocking fallback
  }

  return { friendIds, blockedIds };
}

const CLIENT_RICH_SELECT = `
  *,
  author:profiles!posts_author_id_fkey(*),
  page:pages(*),
  community:communities(*),
  post_media(*),
  post_reactions(*),
  comments(id)
`;

const CLIENT_CORE_SELECT = `
  *,
  author:profiles!posts_author_id_fkey(*),
  post_media(*),
  post_reactions(*),
  comments(id)
`;

export async function hydratePostRowsFromSupabase(rows: SupabasePostRow[]): Promise<SupabasePostRow[]> {
  if (rows.length === 0) return rows;

  const missingAuthorIds = Array.from(
    new Set(rows.filter((r) => !r.page_id && !r.author && r.author_id).map((r) => r.author_id))
  );
  const missingPageIds = Array.from(
    new Set(rows.filter((r) => r.page_id && !r.page).map((r) => r.page_id as string))
  );
  const missingCommunityIds = Array.from(
    new Set(rows.filter((r) => r.community_id && !r.community).map((r) => r.community_id as string))
  );
  const postIdsNeedingRelations = rows
    .filter((r) => !Array.isArray(r.post_media) || !Array.isArray(r.post_reactions) || !Array.isArray(r.comments))
    .map((r) => r.id);

  try {
    const [profilesRes, pagesRes, communitiesRes, mediaRes, reactionsRes, commentsRes] = await Promise.all([
      missingAuthorIds.length > 0
        ? supabase.from('profiles').select('*').in('id', missingAuthorIds)
        : Promise.resolve({ data: null }),
      missingPageIds.length > 0
        ? supabase.from('pages').select('id, slug, name, description, avatar_url').in('id', missingPageIds)
        : Promise.resolve({ data: null }),
      missingCommunityIds.length > 0
        ? supabase.from('communities').select('id, name, slug, image_url').in('id', missingCommunityIds)
        : Promise.resolve({ data: null }),
      postIdsNeedingRelations.length > 0
        ? supabase.from('post_media').select('*').in('post_id', postIdsNeedingRelations)
        : Promise.resolve({ data: null }),
      postIdsNeedingRelations.length > 0
        ? supabase.from('post_reactions').select('post_id, user_id, reaction').in('post_id', postIdsNeedingRelations)
        : Promise.resolve({ data: null }),
      postIdsNeedingRelations.length > 0
        ? supabase.from('comments').select('id, post_id').in('post_id', postIdsNeedingRelations)
        : Promise.resolve({ data: null }),
    ]);

    const profileMap = new Map<string, SupabaseProfileRow>();
    for (const p of (profilesRes.data || []) as SupabaseProfileRow[]) profileMap.set(p.id, p);

    const pageMap = new Map<string, any>();
    for (const pg of (pagesRes.data || []) as any[]) pageMap.set(pg.id, pg);

    const communityMap = new Map<string, any>();
    for (const cm of (communitiesRes.data || []) as any[]) communityMap.set(cm.id, cm);

    const mediaByPost = new Map<string, any[]>();
    for (const m of (mediaRes.data || []) as any[]) {
      const list = mediaByPost.get(m.post_id) || [];
      list.push(m);
      mediaByPost.set(m.post_id, list);
    }

    const reactionsByPost = new Map<string, any[]>();
    for (const r of (reactionsRes.data || []) as any[]) {
      const list = reactionsByPost.get(r.post_id) || [];
      list.push(r);
      reactionsByPost.set(r.post_id, list);
    }

    const commentsByPost = new Map<string, Array<{ id: string }>>();
    for (const c of (commentsRes.data || []) as Array<{ id: string; post_id: string }>) {
      const list = commentsByPost.get(c.post_id) || [];
      list.push({ id: c.id });
      commentsByPost.set(c.post_id, list);
    }

    return rows.map((row) => ({
      ...row,
      author: row.author || (!row.page_id ? profileMap.get(row.author_id) : undefined),
      page: row.page || (row.page_id ? pageMap.get(row.page_id) : undefined),
      community: row.community || (row.community_id ? communityMap.get(row.community_id) : undefined),
      post_media: Array.isArray(row.post_media) ? row.post_media : mediaByPost.get(row.id) || [],
      post_reactions: Array.isArray(row.post_reactions) ? row.post_reactions : reactionsByPost.get(row.id) || [],
      comments: Array.isArray(row.comments) ? row.comments : commentsByPost.get(row.id) || [],
    }));
  } catch {
    return rows;
  }
}

export async function querySupabasePostsResilient(
  applyFilters: (query: any) => any
): Promise<{ rows: SupabasePostRow[]; error?: string }> {
  const richRes = await applyFilters(supabase.from('posts').select(CLIENT_RICH_SELECT));
  if (!richRes.error) {
    return { rows: (richRes.data || []) as unknown as SupabasePostRow[] };
  }

  // Fallback if relation (e.g. pages or communities) has stricter RLS for current role
  const coreRes = await applyFilters(supabase.from('posts').select(CLIENT_CORE_SELECT));
  if (!coreRes.error) {
    const hydrated = await hydratePostRowsFromSupabase(
      (coreRes.data || []) as unknown as SupabasePostRow[]
    );
    return { rows: hydrated };
  }

  const baseRes = await applyFilters(supabase.from('posts').select('*'));
  if (!baseRes.error) {
    const hydrated = await hydratePostRowsFromSupabase(
      (baseRes.data || []) as unknown as SupabasePostRow[]
    );
    return { rows: hydrated };
  }

  return { rows: [], error: richRes.error.message || coreRes.error.message || baseRes.error.message };
}

export async function fetchSavedPostsWithStatus(
  userId: string
): Promise<{ posts: Post[]; error?: string }> {
  if (!userId || !UUID_REGEX.test(userId)) {
    return { posts: [], error: 'Sign in to view your saved posts.' };
  }
  try {
    const { data: savedRows, error: savedErr } = await supabase
      .from('saved_posts')
      .select('post_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (savedErr) {
      console.warn('[SavedPosts] Direct saved_posts query error:', savedErr.message);
      // Fallback to server route if web backend is active
      const headers = await getOptionalAuthHeaders();
      if (headers.Authorization) {
        const apiRes = await fetch('/api/posts/saved', { headers }).catch(() => null);
        const json = apiRes?.ok ? await parseApiJson(apiRes) : null;
        if (json?.success && Array.isArray(json.posts)) {
          const rows = json.posts as SupabasePostRow[];
          const savedSet = new Set<string>(json.savedPostIds || rows.map((r) => r.id));
          const friendSet = new Set<string>(json.friendIds || []);
          return {
            posts: rows.map((row) => mapSupabasePostToFrontend(row, userId, savedSet, friendSet)),
          };
        }
      }
      return { posts: [], error: savedErr.message || 'Unable to load saved posts.' };
    }

    if (!savedRows || savedRows.length === 0) {
      return { posts: [] };
    }

    const postIds = Array.from(
      new Set(savedRows.map((r: any) => r.post_id).filter((id: any) => typeof id === 'string' && id.length > 0))
    );
    if (postIds.length === 0) {
      return { posts: [] };
    }

    const [{ rows: postRows, error }, safetyCtx] = await Promise.all([
      querySupabasePostsResilient((q) => q.in('id', postIds)),
      getDirectSafetyContext(userId),
    ]);

    if (error) {
      return { posts: [], error };
    }
    if (postRows.length === 0) {
      return { posts: [] };
    }

    await resolvePostMediaUrlsOnRows(postRows);

    const savedSet = new Set<string>(postIds);
    const byId = new Map<string, Post>();
    for (const row of postRows) {
      if (row.visibility !== 'hidden' && (row.page_id || !safetyCtx.blockedIds.has(row.author_id))) {
        byId.set(row.id, mapSupabasePostToFrontend(row, userId, savedSet, safetyCtx.friendIds));
      }
    }

    return {
      posts: postIds.map((id) => byId.get(id)).filter((p): p is Post => Boolean(p)),
    };
  } catch (err: unknown) {
    console.warn('Error fetching saved posts:', err);
    return {
      posts: [],
      error: err instanceof Error ? err.message : 'Unable to load saved posts right now.',
    };
  }
}

export async function fetchSavedPosts(userId: string): Promise<Post[]> {
  const res = await fetchSavedPostsWithStatus(userId);
  return res.posts;
}

export async function fetchCommunityPostsFromSupabase(
  communityId: string,
  currentUserId?: string
): Promise<Post[]> {
  if (!communityId) return [];
  try {
    const headers = await getOptionalAuthHeaders();
    const apiRes = await fetch(`/api/posts/community/${encodeURIComponent(communityId)}?limit=100`, {
      headers,
    }).catch(() => null);
    const json = apiRes?.ok ? await parseApiJson(apiRes) : null;
    if (json?.success && Array.isArray(json.posts)) {
      const rows = json.posts as SupabasePostRow[];
      const savedSet = new Set<string>(json.savedPostIds || []);
      const friendSet = new Set<string>(json.friendIds || []);
      return rows.map((row) => mapSupabasePostToFrontend(row, currentUserId, savedSet, friendSet));
    }

    const [postsRes, savedSet, moderatedSet, safetyCtx] = await Promise.all([
      querySupabasePostsResilient((q) =>
        q
          .eq('community_id', communityId)
          .order('created_at', { ascending: false })
          .limit(100)
      ),
      fetchSavedPostIds(currentUserId),
      fetchModeratedPostIds(),
      getDirectSafetyContext(currentUserId),
    ]);

    if (postsRes.error || postsRes.rows.length === 0) return [];
    await resolvePostMediaUrlsOnRows(postsRes.rows);

    return postsRes.rows
      .filter(
        (r) =>
          r.visibility !== 'hidden' &&
          !moderatedSet.has(r.id) &&
          (r.page_id || !safetyCtx.blockedIds.has(r.author_id))
      )
      .sort((a, b) => Number(Boolean(b.is_pinned)) - Number(Boolean(a.is_pinned)))
      .map((row) => mapSupabasePostToFrontend(row, currentUserId, savedSet, safetyCtx.friendIds));
  } catch (err) {
    console.warn('Error fetching community posts:', err);
    return [];
  }
}

export interface FeedPostsPageResult {
  posts: Post[];
  hasMore: boolean;
  nextCursor: string | null;
}

/**
 * Fetch feed posts with cursor pagination.
 * Uses server-authoritative `/api/posts/feed` first when mounted; cleanly falls back to
 * resilient direct Supabase queries when running on static hosting (e.g., Vercel).
 */
export async function fetchFeedPostsPage(
  currentUserId?: string,
  options?: { limit?: number; before?: string | null }
): Promise<FeedPostsPageResult> {
  const limit = Math.min(Math.max(options?.limit ?? 100, 1), 300);
  const before = options?.before || null;

  try {
    const headers = await getOptionalAuthHeaders();
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) params.set('before', before);

    const apiRes = await fetch(`/api/posts/feed?${params.toString()}`, { headers }).catch(() => null);
    const json = apiRes?.ok ? await parseApiJson(apiRes) : null;
    if (json?.success && Array.isArray(json.posts)) {
      const postRows = json.posts as SupabasePostRow[];
      const savedSet = new Set<string>(json.savedPostIds || []);
      const friendSet = new Set<string>(json.friendIds || []);
      return {
        posts: postRows.map((row) => mapSupabasePostToFrontend(row, currentUserId, savedSet, friendSet)),
        hasMore: Boolean(json.hasMore),
        nextCursor: typeof json.nextCursor === 'string' ? json.nextCursor : null,
      };
    }

    // Fallback: resilient direct Supabase query
    const [postsRes, savedSet, moderatedSet, safetyCtx] = await Promise.all([
      querySupabasePostsResilient((q) => {
        let next = q.order('created_at', { ascending: false });
        if (before) {
          next = next.lt('created_at', before);
        }
        return next.limit(limit);
      }),
      fetchSavedPostIds(currentUserId),
      fetchModeratedPostIds(),
      getDirectSafetyContext(currentUserId),
    ]);

    if (postsRes.error) {
      console.warn('Supabase fetchFeedPosts error:', postsRes.error);
      return { posts: [], hasMore: false, nextCursor: null };
    }

    const postRows = postsRes.rows;
    await resolvePostMediaUrlsOnRows(postRows);

    const visibleRows = postRows.filter(
      (r) =>
        r.visibility !== 'hidden' &&
        !moderatedSet.has(r.id) &&
        (r.page_id || !safetyCtx.blockedIds.has(r.author_id))
    );
    const hasMore = postRows.length >= limit;
    const nextCursor = hasMore ? postRows[postRows.length - 1]?.created_at || null : null;

    return {
      posts: visibleRows.map((row) =>
        mapSupabasePostToFrontend(row, currentUserId, savedSet, safetyCtx.friendIds)
      ),
      hasMore,
      nextCursor,
    };
  } catch (err) {
    console.warn('Unexpected error in fetchFeedPostsPage:', err);
    return { posts: [], hasMore: false, nextCursor: null };
  }
}

/**
 * Fetch feed posts from Supabase posts table with author and reactions.
 * Batch resolves signed URLs for private 'post-media' bucket items.
 */
export async function fetchFeedPosts(currentUserId?: string): Promise<Post[]> {
  const result = await fetchFeedPostsPage(currentUserId, { limit: 100 });
  return result.posts;
}

export interface SinglePostFetchResult {
  post: Post | null;
  status: 'ok' | 'not_found' | 'restricted' | 'error';
  error?: string;
}

/**
 * Fetch a single post by ID with visibility/deletion checks via server endpoint
 * (and direct Supabase fallback whenever the Express endpoint is unmounted or unreachable).
 */
export async function fetchSinglePostById(
  postId: string,
  currentUserId?: string
): Promise<SinglePostFetchResult> {
  const isValidPostUuid =
    Boolean(postId) &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      postId.trim()
    );
  if (!isValidPostUuid) {
    return { post: null, status: 'not_found', error: 'Post not found.' };
  }

  try {
    const headers = await getOptionalAuthHeaders();
    const apiRes = await fetch(`/api/posts/${encodeURIComponent(postId)}`, { headers }).catch(
      () => null
    );

    // Only honor API responses that are genuine JSON payloads from Express.
    // On static hosts like Vercel, `/api/posts/:id` returns HTML 404 — fall through to Supabase!
    const json = await parseApiJson(apiRes);
    if (apiRes && json) {
      if (apiRes.ok && json.success && json.post) {
        const savedSet = new Set<string>(json.savedPostIds || []);
        const friendSet = new Set<string>(json.friendIds || []);
        return {
          post: mapSupabasePostToFrontend(
            json.post as SupabasePostRow,
            currentUserId,
            savedSet,
            friendSet
          ),
          status: 'ok',
        };
      }
      if (apiRes.status === 404 || json.reason === 'not_found') {
        return {
          post: null,
          status: 'not_found',
          error: json.error || 'This post may have been deleted.',
        };
      }
      if (apiRes.status === 403 || json.reason === 'restricted') {
        return {
          post: null,
          status: 'restricted',
          error: json.error || 'This post is restricted or private.',
        };
      }
    }

    // Direct Supabase query fallback (authoritative for static deployments like Vercel)
    const [postsRes, savedSet, moderatedSet, safetyCtx] = await Promise.all([
      querySupabasePostsResilient((q) => q.eq('id', postId).limit(1)),
      fetchSavedPostIds(currentUserId),
      fetchModeratedPostIds(),
      getDirectSafetyContext(currentUserId),
    ]);

    if (postsRes.error) {
      return { post: null, status: 'error', error: postsRes.error };
    }

    const row = postsRes.rows[0];
    if (!row) {
      return {
        post: null,
        status: 'not_found',
        error: 'This post may have been deleted or is private.',
      };
    }
    if (row.visibility === 'hidden' || moderatedSet.has(row.id)) {
      return { post: null, status: 'not_found', error: 'This post is no longer available.' };
    }
    if (!row.page_id && safetyCtx.blockedIds.has(row.author_id)) {
      return {
        post: null,
        status: 'restricted',
        error: 'This post is not available due to account privacy settings.',
      };
    }

    await resolvePostMediaUrlsOnRows([row]);
    return {
      post: mapSupabasePostToFrontend(row, currentUserId, savedSet, safetyCtx.friendIds),
      status: 'ok',
    };
  } catch (err: unknown) {
    return {
      post: null,
      status: 'error',
      error: err instanceof Error ? err.message : 'Unable to load this post right now.',
    };
  }
}

/**
 * Fetch posts published by a specific user (for ProfileView cross-user & self views).
 */
export async function fetchUserPosts(targetUserId: string, currentUserId?: string): Promise<Post[]> {
  if (!targetUserId) return [];
  try {
    const headers = await getOptionalAuthHeaders();
    const apiRes = await fetch(`/api/posts/user/${encodeURIComponent(targetUserId)}?limit=100`, {
      headers,
    }).catch(() => null);
    const json = apiRes?.ok ? await parseApiJson(apiRes) : null;
    if (json?.success && Array.isArray(json.posts)) {
      const postRows = json.posts as SupabasePostRow[];
      const savedSet = new Set<string>(json.savedPostIds || []);
      const friendSet = new Set<string>(json.friendIds || []);
      return postRows.map((row) => mapSupabasePostToFrontend(row, currentUserId, savedSet, friendSet));
    }

    const [postsRes, savedSet, moderatedSet, safetyCtx] = await Promise.all([
      querySupabasePostsResilient((q) =>
        q
          .eq('author_id', targetUserId)
          .is('page_id', null)
          .order('created_at', { ascending: false })
          .limit(100)
      ),
      fetchSavedPostIds(currentUserId),
      fetchModeratedPostIds(),
      getDirectSafetyContext(currentUserId),
    ]);

    if (postsRes.error) {
      console.warn('Supabase fetchUserPosts error:', postsRes.error);
      return [];
    }

    const postRows = postsRes.rows;
    await resolvePostMediaUrlsOnRows(postRows);

    const visibleRows = postRows.filter(
      (r) =>
        r.visibility !== 'hidden' &&
        !moderatedSet.has(r.id) &&
        !safetyCtx.blockedIds.has(r.author_id)
    );
    return visibleRows.map((row) =>
      mapSupabasePostToFrontend(row, currentUserId, savedSet, safetyCtx.friendIds)
    );
  } catch (err) {
    console.warn('Unexpected error in fetchUserPosts:', err);
    return [];
  }
}

export interface PostMediaAttachment {
  secure_url: string;
  asset_id?: string;
  format?: string;
  bytes?: number;
  width?: number;
  height?: number;
  kind?: 'image' | 'video';
  provider?: string;
  position?: number;
  cloudinary_public_id?: string;
  cloudinary_resource_type?: 'image' | 'video' | 'raw' | 'auto';
  duration_seconds?: number;
  thumbnail_url?: string;
  trim_start?: number;
  trim_end?: number;
  is_muted?: boolean;
  aspect_ratio?: '16:9' | '1:1' | '9:16' | 'original';
}

function collectPostRollbackAssets(mediaList: PostMediaAttachment[]): {
  supabasePaths: string[];
  cloudinaryAssets: DeleteCloudinaryAssetInput[];
} {
  const supabasePaths: string[] = [];
  const cloudinaryAssets: DeleteCloudinaryAssetInput[] = [];

  for (const m of mediaList) {
    const isCloudinary =
      m.provider === 'cloudinary' ||
      Boolean(m.cloudinary_public_id) ||
      Boolean(m.secure_url?.includes('res.cloudinary.com'));

    if (isCloudinary) {
      const publicId =
        m.cloudinary_public_id ||
        extractCloudinaryPublicId(m.asset_id) ||
        extractCloudinaryPublicId(m.secure_url);
      if (publicId) {
        cloudinaryAssets.push({
          public_id: publicId,
          resource_type:
            m.cloudinary_resource_type === 'video' || m.kind === 'video' ? 'video' : 'image',
          entity_type: 'post',
        });
      }
      const thumbPublicId = extractCloudinaryPublicId(m.thumbnail_url);
      if (thumbPublicId && thumbPublicId !== publicId) {
        cloudinaryAssets.push({
          public_id: thumbPublicId,
          resource_type: 'image',
          entity_type: 'post',
        });
      }
    } else if (m.asset_id) {
      supabasePaths.push(m.asset_id);
    }
  }

  return { supabasePaths, cloudinaryAssets };
}

async function cleanupUploadedPostMedia(mediaList: PostMediaAttachment[]): Promise<void> {
  const { supabasePaths, cloudinaryAssets } = collectPostRollbackAssets(mediaList);
  await Promise.all([
    supabasePaths.length > 0 ? deletePostMediaFilesFromStorage(supabasePaths) : Promise.resolve(),
    cloudinaryAssets.length > 0 ? deleteCloudinaryAssets(cloudinaryAssets) : Promise.resolve(),
  ]);
}

/**
 * Create a real post in Supabase with optional multiple media items (Cloudinary MPV2 + Supabase Storage compatibility).
 * Cleans up orphaned files and posts on any failure.
 */
export async function createRealPost(params: {
  authorId: string;
  body: string;
  visibility?: 'public' | 'friends' | 'campus';
  media?: PostMediaAttachment | PostMediaAttachment[];
  communityId?: string;
  categoryHashtag?: '#Event' | '#CampusUpdates' | '#GeneralPost';
}): Promise<{ success: boolean; post?: Post; error?: string }> {
  const mediaList: PostMediaAttachment[] = Array.isArray(params.media)
    ? params.media
    : params.media
    ? [params.media]
    : [];

  try {
    const postPayload: Record<string, any> = {
      author_id: params.authorId,
      body: params.body.trim(),
      visibility: params.visibility || 'public',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (params.communityId) {
      postPayload.community_id = params.communityId;
    }

    const { data: postData, error: postError } = await supabase
      .from('posts')
      .insert(postPayload)
      .select(`
        *,
        author:profiles!posts_author_id_fkey(*),
        community:communities(*)
      `)
      .single();

    if (postError || !postData) {
      console.error('[Supabase Post Error] Failed to insert post:', postError?.message);
      await cleanupUploadedPostMedia(mediaList);
      return { success: false, error: postError?.message || 'Failed to create post.' };
    }

    if (mediaList.length > 0) {
      const nowIso = new Date().toISOString();

      const buildMediaRow = (m: PostMediaAttachment, idx: number, includeExtended: boolean) => {
        const mediaKind: 'image' | 'video' =
          m.kind ||
          (m.format === 'mp4' ||
          m.secure_url.includes('/video/') ||
          m.secure_url.match(/\.(mp4|webm|mov|ogg|m4v)(\?.*)?$/i)
            ? 'video'
            : 'image');

        const isCloudinary =
          m.provider === 'cloudinary' ||
          Boolean(m.cloudinary_public_id) ||
          m.secure_url.includes('res.cloudinary.com');

        const persistentStoragePath = isCloudinary
          ? null
          : extractPostMediaStoragePath(m.asset_id, m.secure_url, m.provider);

        const publicId =
          m.cloudinary_public_id ||
          (isCloudinary
            ? extractCloudinaryPublicId(m.asset_id) || extractCloudinaryPublicId(m.secure_url)
            : null);

        const baseRow: Record<string, any> = {
          post_id: postData.id,
          uploader_id: params.authorId,
          kind: mediaKind,
          provider: m.provider || (isCloudinary ? 'cloudinary' : 'supabase'),
          secure_url: isCloudinary ? m.secure_url : persistentStoragePath || m.secure_url,
          asset_id: isCloudinary
            ? publicId || m.asset_id || m.secure_url
            : persistentStoragePath || m.asset_id || m.secure_url || `media_${postData.id}_${idx}`,
          format: m.format || null,
          bytes: m.bytes || null,
          width: m.width || null,
          height: m.height || null,
          position: m.position ?? idx,
          created_at: nowIso,
        };

        if (includeExtended) {
          baseRow.cloudinary_public_id = publicId || null;
          baseRow.cloudinary_resource_type = isCloudinary
            ? m.cloudinary_resource_type || (mediaKind === 'video' ? 'video' : 'image')
            : null;
          baseRow.duration_seconds =
            typeof m.duration_seconds === 'number' && Number.isFinite(m.duration_seconds)
              ? m.duration_seconds
              : null;
          baseRow.thumbnail_url = m.thumbnail_url || null;
          baseRow.trim_start =
            typeof m.trim_start === 'number' && Number.isFinite(m.trim_start) ? m.trim_start : null;
          baseRow.trim_end =
            typeof m.trim_end === 'number' && Number.isFinite(m.trim_end) ? m.trim_end : null;
          baseRow.is_muted = typeof m.is_muted === 'boolean' ? m.is_muted : false;
          baseRow.aspect_ratio = m.aspect_ratio || null;
        }

        return baseRow;
      };

      const extendedPayloads = mediaList.map((m, idx) => buildMediaRow(m, idx, true));
      let { error: mediaError } = await supabase.from('post_media').insert(extendedPayloads);

      // Graceful MPV1 backward-compatibility fallback if MPV2 SQL columns aren't migrated yet
      if (
        mediaError &&
        (mediaError.code === '42703' ||
          mediaError.code === 'PGRST204' ||
          mediaError.message?.toLowerCase().includes('schema cache') ||
          (mediaError.message?.toLowerCase().includes('column') &&
            !mediaError.message?.toLowerCase().includes('file_name')))
      ) {
        const corePayloads = mediaList.map((m, idx) => buildMediaRow(m, idx, false));
        const retryRes = await supabase.from('post_media').insert(corePayloads);
        mediaError = retryRes.error;
      }

      if (mediaError) {
        console.error('[Supabase Media Insert Failed]', {
          message: mediaError.message,
          code: mediaError.code,
          details: mediaError.details,
        });

        await supabase.from('posts').delete().eq('id', postData.id);
        await cleanupUploadedPostMedia(mediaList);

        const isMissingFileNameTrigger =
          mediaError.code === '42703' ||
          mediaError.message?.toLowerCase().includes('file_name');

        return {
          success: false,
          error: isMissingFileNameTrigger
            ? 'Database trigger mismatch on post_media (missing file_name). Run the SQL migration in Supabase SQL Editor to resolve.'
            : `Media metadata failed to save (${mediaError.message}). Please try again.`,
        };
      }
    }

    const frontendPost = mapSupabasePostToFrontend(
      {
        ...postData,
        post_media: mediaList,
        post_reactions: [],
        comments: [],
      } as unknown as SupabasePostRow,
      params.authorId
    );

    return { success: true, post: frontendPost };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to publish post';
    console.error('[Supabase Post Error] Unexpected exception:', msg);
    await cleanupUploadedPostMedia(mediaList);
    return { success: false, error: msg };
  }
}

/**
 * Delete a post from Supabase and remove associated Cloudinary and/or Storage media
 */
export async function deleteRealPost(
  postId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Verify ownership and fetch attached media before DB delete
    let mediaRows: Array<Record<string, any>> | null = null;
    const { data: extRows, error: extErr } = await supabase
      .from('post_media')
      .select('id, asset_id, provider, secure_url, kind, cloudinary_public_id, cloudinary_resource_type, thumbnail_url')
      .eq('post_id', postId);

    if (extErr) {
      const { data: coreRows } = await supabase
        .from('post_media')
        .select('id, asset_id, provider, secure_url, kind')
        .eq('post_id', postId);
      mediaRows = coreRows || [];
    } else {
      mediaRows = extRows || [];
    }

    // 2. Clean up Cloudinary assets FIRST while DB ownership records still exist for Edge Function verification
    if (mediaRows && mediaRows.length > 0) {
      const cloudinaryAssets: DeleteCloudinaryAssetInput[] = [];
      for (const m of mediaRows) {
        const isCloudinary =
          m.provider === 'cloudinary' ||
          Boolean(m.cloudinary_public_id) ||
          String(m.secure_url || '').includes('res.cloudinary.com');
        if (!isCloudinary) continue;

        const publicId =
          m.cloudinary_public_id ||
          extractCloudinaryPublicId(m.asset_id) ||
          extractCloudinaryPublicId(m.secure_url);

        if (publicId) {
          cloudinaryAssets.push({
            public_id: publicId,
            resource_type:
              m.cloudinary_resource_type === 'video' || m.kind === 'video' ? 'video' : 'image',
            entity_type: 'post',
            entity_id: postId,
          });
        }

        const thumbPublicId = extractCloudinaryPublicId(m.thumbnail_url);
        if (thumbPublicId && thumbPublicId !== publicId) {
          cloudinaryAssets.push({
            public_id: thumbPublicId,
            resource_type: 'image',
            entity_type: 'post',
            entity_id: postId,
          });
        }
      }

      if (cloudinaryAssets.length > 0) {
        await deleteCloudinaryAssets(cloudinaryAssets).catch(() => {});
      }
    }

    // 3. Delete post row (cascades or deletes post_media/reactions)
    const { error } = await supabase
      .from('posts')
      .delete()
      .match({ id: postId, author_id: userId });

    if (error) {
      console.warn('Supabase deletePost error:', error.message);
      return { success: false, error: error.message };
    }

    // 4. Clean up legacy Supabase post-media files if any
    if (mediaRows && mediaRows.length > 0) {
      const pathsToDelete = mediaRows
        .filter((m) => m.asset_id && m.provider !== 'cloudinary' && !String(m.secure_url || '').includes('res.cloudinary.com'))
        .map((m) => m.asset_id as string);
      if (pathsToDelete.length > 0) {
        await deletePostMediaFilesFromStorage(pathsToDelete);
      }
    }

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete post';
    return { success: false, error: msg };
  }
}

/**
 * Toggle post reaction in Supabase post_reactions table
 */
export async function toggleRealPostReaction(
  postId: string,
  userId: string,
  reaction = 'heart'
): Promise<{ success: boolean; isLiked: boolean; error?: string }> {
  try {
    // Check if reaction exists
    const { data: existing, error: checkErr } = await supabase
      .from('post_reactions')
      .select('*')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .maybeSingle();

    if (checkErr) {
      console.warn('Check reaction error:', checkErr.message);
    }

    if (existing) {
      // Remove reaction
      const { error: delErr } = await supabase
        .from('post_reactions')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', userId);

      if (delErr) {
        return { success: false, isLiked: true, error: delErr.message };
      }
      return { success: true, isLiked: false };
    } else {
      // Insert reaction
      const { error: insErr } = await supabase
        .from('post_reactions')
        .insert({
          post_id: postId,
          user_id: userId,
          reaction,
          created_at: new Date().toISOString(),
        });

      if (insErr) {
        return { success: false, isLiked: false, error: insErr.message };
      }
      return { success: true, isLiked: true };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Reaction update failed';
    return { success: false, isLiked: false, error: msg };
  }
}

/**
 * Recursively count total comments (top-level + nested replies)
 */
export function countThreadedComments(comments: Comment[]): number {
  return comments.reduce(
    (sum, c) => sum + 1 + (c.replies ? countThreadedComments(c.replies) : 0),
    0
  );
}

/**
 * Fetch threaded comments for a post along with independent `comment_reactions` counts/state
 */
export async function fetchPostComments(
  postId: string,
  currentUserId?: string
): Promise<Comment[]> {
  try {
    const { data, error } = await supabase
      .from('comments')
      .select(`
        *,
        author:profiles!comments_author_id_fkey(*)
      `)
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('Supabase fetchPostComments error:', error.message);
      return [];
    }

    const rows = data || [];
    if (rows.length === 0) return [];

    const commentIds = rows.map((r: any) => r.id);
    const likesCountMap = new Map<string, number>();
    const likedByMeSet = new Set<string>();

    try {
      const { data: reactionsData, error: reactionsErr } = await supabase
        .from('comment_reactions')
        .select('comment_id, user_id')
        .in('comment_id', commentIds);

      if (!reactionsErr && reactionsData) {
        for (const r of reactionsData as Array<{ comment_id: string; user_id: string }>) {
          likesCountMap.set(r.comment_id, (likesCountMap.get(r.comment_id) || 0) + 1);
          if (currentUserId && r.user_id === currentUserId) {
            likedByMeSet.add(r.comment_id);
          }
        }
      }
    } catch {
      // Safe fallback if comment_reactions table is not yet migrated
    }

    const flatComments: Comment[] = rows.map((row: any) => {
      const author = row.author
        ? mapProfileRowToUser(row.author, null, row.author.id === currentUserId ? 'self' : 'none')
        : {
            id: row.author_id,
            name: 'ABSU Student',
            avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${row.author_id}&backgroundColor=6d45d9&textColor=ffffff`,
            handle: '@student',
            department: 'Student',
            faculty: 'Abia State University',
            level: 'Undergraduate',
            campus: 'Uturu (Main Campus)',
            bio: '',
            interests: [],
            relationshipState: 'none' as const,
          };

      const isEdited = Boolean(
        row.updated_at &&
          row.created_at &&
          new Date(row.updated_at).getTime() - new Date(row.created_at).getTime() > 2000
      );

      return {
        id: row.id,
        postId: row.post_id,
        parentId: row.parent_comment_id || null,
        author: {
          id: author.id,
          name: author.name,
          avatar: author.avatar,
          department: author.department,
          level: author.level,
        },
        content: row.body || '',
        createdAt: formatTimeAgo(row.created_at),
        updatedAt: row.updated_at,
        isEdited,
        likesCount: likesCountMap.get(row.id) || 0,
        isLiked: likedByMeSet.has(row.id),
        replies: [],
      };
    });

    // Assemble parent -> replies hierarchy cleanly (supports deep replies collapsed onto top-level root or direct parent)
    const commentById = new Map<string, Comment>();
    for (const c of flatComments) {
      commentById.set(c.id, c);
    }

    const roots: Comment[] = [];
    for (const c of flatComments) {
      if (c.parentId && commentById.has(c.parentId)) {
        const parent = commentById.get(c.parentId)!;
        parent.replies = parent.replies || [];
        parent.replies.push(c);
      } else {
        roots.push(c);
      }
    }

    return roots;
  } catch (err) {
    console.warn('Error fetching comments:', err);
    return [];
  }
}

/**
 * Add a top-level comment or threaded reply to a post in Supabase comments table
 */
export async function createRealComment(params: {
  postId: string;
  authorId: string;
  body: string;
  parentId?: string | null;
}): Promise<{ success: boolean; comment?: Comment; error?: string }> {
  try {
    const nowIso = new Date().toISOString();
    const payload: Record<string, any> = {
      post_id: params.postId,
      author_id: params.authorId,
      body: params.body.trim(),
      created_at: nowIso,
      updated_at: nowIso,
    };

    if (params.parentId) {
      payload.parent_comment_id = params.parentId;
    }

    const { data, error } = await supabase
      .from('comments')
      .insert(payload)
      .select(`
        *,
        author:profiles!comments_author_id_fkey(*)
      `)
      .single();

    if (error || !data) {
      return { success: false, error: error?.message || 'Failed to post comment.' };
    }

    const author = data.author
      ? mapProfileRowToUser(data.author, null, 'self')
      : {
          id: params.authorId,
          name: 'You',
          avatar: '',
          handle: '@you',
          department: 'Student',
          faculty: 'Abia State University',
          level: 'Undergraduate',
          campus: 'Uturu (Main Campus)',
          bio: '',
          interests: [],
          relationshipState: 'self' as const,
        };

    const comment: Comment = {
      id: data.id,
      postId: data.post_id,
      parentId: data.parent_comment_id || null,
      author: {
        id: author.id,
        name: author.name,
        avatar: author.avatar,
        department: author.department,
        level: author.level,
      },
      content: data.body,
      createdAt: 'Just now',
      updatedAt: data.updated_at,
      isEdited: false,
      likesCount: 0,
      isLiked: false,
      replies: [],
    };

    return { success: true, comment };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Comment creation failed';
    return { success: false, error: msg };
  }
}

/**
 * Edit an existing comment/reply owned by the current user
 */
export async function updateRealComment(
  commentId: string,
  authorId: string,
  body: string
): Promise<{ success: boolean; error?: string }> {
  const trimmed = body.trim();
  if (!trimmed) return { success: false, error: 'Comment cannot be empty.' };

  try {
    const { error } = await supabase
      .from('comments')
      .update({
        body: trimmed,
        updated_at: new Date().toISOString(),
      })
      .eq('id', commentId)
      .eq('author_id', authorId);

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update comment.',
    };
  }
}

/**
 * Delete a comment/reply owned by the current user
 */
export async function deleteRealComment(
  commentId: string,
  authorId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('comments')
      .delete()
      .eq('id', commentId)
      .eq('author_id', authorId);

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to delete comment.',
    };
  }
}

/**
 * Toggle independent like on a comment or reply via `comment_reactions` (isolated from `post_reactions`)
 */
export async function toggleRealCommentReaction(
  commentId: string,
  userId: string,
  reaction = 'heart'
): Promise<{ success: boolean; isLiked: boolean; error?: string }> {
  try {
    const { data: existing, error: checkErr } = await supabase
      .from('comment_reactions')
      .select('comment_id')
      .eq('comment_id', commentId)
      .eq('user_id', userId)
      .maybeSingle();

    if (checkErr && !checkErr.message.includes('0 rows')) {
      console.warn('[Comments] comment_reactions check notice:', checkErr.message);
    }

    if (existing) {
      const { error: delErr } = await supabase
        .from('comment_reactions')
        .delete()
        .eq('comment_id', commentId)
        .eq('user_id', userId);

      if (delErr) {
        return { success: false, isLiked: true, error: delErr.message };
      }
      return { success: true, isLiked: false };
    } else {
      const { error: insErr } = await supabase.from('comment_reactions').insert({
        comment_id: commentId,
        user_id: userId,
        reaction,
        created_at: new Date().toISOString(),
      });

      if (insErr) {
        return { success: false, isLiked: false, error: insErr.message };
      }
      return { success: true, isLiked: true };
    }
  } catch (err: unknown) {
    return {
      success: false,
      isLiked: false,
      error: err instanceof Error ? err.message : 'Comment like update failed.',
    };
  }
}

