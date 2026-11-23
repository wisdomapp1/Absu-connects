import { supabase } from './supabase.ts';
import type {
  Story,
  UserStoryGroup,
  StoryMediaType,
  StoryViewItem,
  StoryReactionItem,
} from '../types/stories.ts';
import {
  resolveStoryMediaSignedUrl,
  deleteStoryMediaFromStorage,
} from './storageService.ts';
import {
  uploadMediaToCloudinary,
  deleteCloudinaryAssets,
  buildCloudinaryVideoPosterUrl,
  extractCloudinaryPublicId,
} from './cloudinaryService.ts';
import { compressImageForUpload, validatePostVideoFile } from './mediaCompression.ts';
import { getOrCreateDirectConversation, sendRealMessage } from './messageService.ts';
import { getOptionalAuthHeaders, parseApiJson } from './postService.ts';
import { fetchUserBlocks } from './moderationService.ts';
import type { User } from '../types/index.ts';
import {
  isStoryExpired,
  normalizeStoryInsightsRows,
  shouldSkipStoryViewRecord,
  type RawProfileMiniRow,
  type RawStoryReactionRow,
  type RawStoryViewRow,
} from './storyUtils.ts';

function isMissingColumnError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  return (
    err.code === '42703' ||
    err.code === 'PGRST204' ||
    msg.includes('schema cache') ||
    msg.includes('column')
  );
}

function encodeBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(b64url: string): string {
  const padded = b64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64url.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

export function encodeOwnerScopedStoryRef(userId: string, mediaUrl: string | null | undefined): string | null {
  if (!mediaUrl) return null;
  const trimmed = String(mediaUrl).trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return trimmed;
  }
  const cleanNoQuery = trimmed.split('?')[0];
  const extMatch = cleanNoQuery.match(/\.([a-z0-9]{2,5})$/i);
  const ext = extMatch ? extMatch[1].toLowerCase() : 'bin';
  return `${userId}/cld__${encodeBase64Url(trimmed)}.${ext}`;
}

export function decodeOwnerScopedStoryRef(ref: string | null | undefined): string {
  if (!ref) return '';
  const trimmed = String(ref).trim();
  const cldMatch = trimmed.match(/^[^/]+\/cld__([A-Za-z0-9_-]+)(?:\.[a-z0-9]+)?$/i);
  if (cldMatch?.[1]) {
    try {
      const decoded = decodeBase64Url(cldMatch[1]);
      if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
        return decoded;
      }
    } catch {
      // ignore decode errors
    }
  }
  const directPrefixed = trimmed.match(/^[^/]+\/(https?:\/\/.+)$/i);
  if (directPrefixed?.[1]) {
    return directPrefixed[1];
  }
  return trimmed;
}

/**
 * Deterministic Story Group Sorting:
 * 1. Current user's own story group first
 * 2. Friends/students with unviewed stories (`has_unviewed: true`), newest first
 * 3. Viewed story groups (`has_unviewed: false`), newest first
 */
export function sortStoryGroups(
  groups: UserStoryGroup[],
  currentUserId?: string
): UserStoryGroup[] {
  const normalized = groups.map((group) => {
    const isSelf = Boolean(currentUserId && group.user_id === currentUserId);
    const hasUnviewed = isSelf ? false : group.stories.some((s) => !s.has_viewed);
    const latestTimestamp = group.stories.reduce(
      (latest, s) =>
        new Date(s.created_at).getTime() > new Date(latest).getTime() ? s.created_at : latest,
      group.latest_timestamp || group.stories[0]?.created_at || new Date(0).toISOString()
    );
    return {
      ...group,
      has_unviewed: hasUnviewed,
      latest_timestamp: latestTimestamp,
    };
  });

  normalized.sort((a, b) => {
    if (currentUserId && a.user_id === currentUserId) return -1;
    if (currentUserId && b.user_id === currentUserId) return 1;
    if (a.has_unviewed && !b.has_unviewed) return -1;
    if (!a.has_unviewed && b.has_unviewed) return 1;
    return new Date(b.latest_timestamp).getTime() - new Date(a.latest_timestamp).getTime();
  });

  return normalized;
}

function isStoryPermissionError(error: unknown): boolean {
  const msg =
    error && typeof error === 'object' && 'message' in error
      ? String((error as any).message || '').toLowerCase()
      : '';
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as any).code || '').trim()
      : '';
  return (
    code === '42501' ||
    code === 'PGRST301' ||
    msg.includes('row-level security') ||
    msg.includes('permission denied') ||
    msg.includes('insufficient_privilege') ||
    msg.includes('not authorized') ||
    msg.includes('jwt')
  );
}

export type StoryByIdResult =
  | { status: 'ok'; story: Story }
  | { status: 'unavailable'; reason: 'not_found' | 'restricted' | 'error'; error?: string };

// Short-lived cache for single-story lookups (DM story replies & notification routing)
const storyLookupCache = new Map<
  string,
  { result: StoryByIdResult; expiresAt: number }
>();
const inFlightStoryLookups = new Map<string, Promise<StoryByIdResult>>();
const STORY_LOOKUP_CACHE_TTL_MS = 60 * 1000;

export function invalidateStoryCache(storyId?: string): void {
  if (!storyId) {
    storyLookupCache.clear();
    return;
  }
  for (const key of Array.from(storyLookupCache.keys())) {
    if (key.startsWith(`${storyId}:`)) {
      storyLookupCache.delete(key);
    }
  }
}

async function hydrateStoryRow(
  row: any,
  profileRow: any,
  opts: {
    currentUserId?: string;
    viewsCount?: number;
    reactionsCount?: number;
    hasViewed?: boolean;
    hasReacted?: boolean;
    userReaction?: string | null;
  }
): Promise<Story> {
  const rawMediaRef =
    row.media_type === 'text'
      ? ''
      : decodeOwnerScopedStoryRef(row.media_url || row.storage_path || '');
  const isDirectUrl =
    row.provider === 'cloudinary' ||
    rawMediaRef.startsWith('https://') ||
    rawMediaRef.startsWith('http://') ||
    rawMediaRef.startsWith('data:');

  let signedUrl = rawMediaRef;
  if (rawMediaRef && row.media_type !== 'text' && !isDirectUrl) {
    signedUrl = await resolveStoryMediaSignedUrl(rawMediaRef);
  }

  const authorName =
    profileRow?.display_name || profileRow?.username || 'ABSU Student';

  return {
    id: row.id,
    user_id: row.user_id,
    media_type: row.media_type as StoryMediaType,
    storage_path: row.media_type === 'text' ? null : signedUrl,
    media_url:
      row.media_type === 'text'
        ? null
        : decodeOwnerScopedStoryRef(row.media_url) || signedUrl,
    provider:
      row.provider ||
      (signedUrl.includes('res.cloudinary.com') ? 'cloudinary' : 'supabase'),
    cloudinary_public_id: row.cloudinary_public_id || null,
    cloudinary_resource_type: row.cloudinary_resource_type || null,
    duration_seconds: row.duration_seconds ?? null,
    thumbnail_url: row.thumbnail_url || null,
    text_content: row.text_content,
    caption: row.caption,
    background_color: row.background_color || null,
    font_style: row.font_style || null,
    created_at: row.created_at,
    expires_at: row.expires_at,
    is_expired: isStoryExpired(row.expires_at),
    views_count: opts.viewsCount ?? 0,
    reactions_count: opts.reactionsCount ?? 0,
    has_viewed: Boolean(opts.hasViewed),
    has_reacted: Boolean(opts.hasReacted),
    user_reaction: opts.userReaction ?? null,
    user: {
      id: row.user_id,
      name: authorName,
      avatar_url: profileRow?.avatar_url,
      department: profileRow?.department,
    },
  };
}

/**
 * Fetch a single story by UUID using the authenticated Supabase client so RLS
 * (including the updated expired-story policy for story owners & DM repliers)
 * is strictly respected. Never filters out expired stories by timestamp.
 */
export async function fetchStoryById(
  storyId: string,
  currentUserId?: string,
  options?: { forceRefresh?: boolean }
): Promise<StoryByIdResult> {
  const cleanId = String(storyId || '').trim();
  if (!cleanId) {
    return { status: 'unavailable', reason: 'not_found', error: 'Invalid story ID.' };
  }

  const cacheKey = `${cleanId}:${currentUserId || 'anon'}`;
  if (!options?.forceRefresh) {
    const cached = storyLookupCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }
  }

  const existingFlight = inFlightStoryLookups.get(cacheKey);
  if (existingFlight) {
    return existingFlight;
  }

  const flightPromise = (async (): Promise<StoryByIdResult> => {
    try {
      let storyRow: any = null;
      let storyErr: any = null;

      const extRes = await supabase
        .from('stories')
        .select(`
          id,
          user_id,
          media_type,
          storage_path,
          media_url,
          provider,
          cloudinary_public_id,
          cloudinary_resource_type,
          duration_seconds,
          thumbnail_url,
          text_content,
          caption,
          background_color,
          font_style,
          deleted_at,
          created_at,
          expires_at
        `)
        .eq('id', cleanId)
        .is('deleted_at', null)
        .maybeSingle();

      if (isMissingColumnError(extRes.error)) {
        const coreRes = await supabase
          .from('stories')
          .select('id, user_id, media_type, storage_path, text_content, caption, created_at, expires_at')
          .eq('id', cleanId)
          .maybeSingle();
        storyRow = coreRes.data;
        storyErr = coreRes.error;
      } else {
        storyRow = extRes.data;
        storyErr = extRes.error;
      }

      if (storyErr) {
        console.error('[Stories] fetchStoryById Supabase error:', {
          storyId: cleanId,
          code: storyErr.code,
          message: storyErr.message,
          details: storyErr.details,
          hint: storyErr.hint,
        });
        const restricted = isStoryPermissionError(storyErr);
        return {
          status: 'unavailable',
          reason: restricted ? 'restricted' : 'error',
          error: restricted
            ? 'You do not have permission to view this story.'
            : storyErr.message || 'Unable to load this story right now.',
        };
      }

      if (!storyRow) {
        const res: StoryByIdResult = {
          status: 'unavailable',
          reason: 'not_found',
          error: 'This story has been deleted or is no longer available.',
        };
        storyLookupCache.set(cacheKey, {
          result: res,
          expiresAt: Date.now() + 15 * 1000,
        });
        return res;
      }

      // Enforce client-side block filtering when viewer has blocked or been blocked by story owner
      if (currentUserId && storyRow.user_id && storyRow.user_id !== currentUserId) {
        const blocks = await fetchUserBlocks(currentUserId).catch(() => null);
        if (blocks && blocks.allBlockedIds.includes(storyRow.user_id)) {
          const res: StoryByIdResult = {
            status: 'unavailable',
            reason: 'restricted',
            error: 'This story is not available due to privacy settings.',
          };
          storyLookupCache.set(cacheKey, {
            result: res,
            expiresAt: Date.now() + STORY_LOOKUP_CACHE_TTL_MS,
          });
          return res;
        }
      }

      const [profileRes, myViewRes, reactionsRes, viewsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, display_name, username, avatar_url, department, level')
          .eq('id', storyRow.user_id)
          .maybeSingle(),
        currentUserId
          ? supabase
              .from('story_views')
              .select('viewer_id')
              .eq('story_id', cleanId)
              .eq('viewer_id', currentUserId)
              .limit(1)
          : Promise.resolve({ data: [] as Array<{ viewer_id: string }> }),
        supabase
          .from('story_reactions')
          .select('user_id, reaction')
          .eq('story_id', cleanId),
        currentUserId && storyRow.user_id === currentUserId
          ? supabase
              .from('story_views')
              .select('viewer_id')
              .eq('story_id', cleanId)
          : Promise.resolve({ data: [] as Array<{ viewer_id: string }> }),
      ]);

      const reactionRows = (reactionsRes.data || []) as Array<{
        user_id: string;
        reaction?: string | null;
      }>;
      const uniqueReactors = new Set(reactionRows.map((r) => r.user_id));
      const myReactionRow = currentUserId
        ? reactionRows.find((r) => r.user_id === currentUserId)
        : undefined;

      const uniqueViewers = new Set(
        ((viewsRes.data || []) as Array<{ viewer_id: string }>)
          .map((v) => v.viewer_id)
          .filter((vid) => vid && vid !== storyRow.user_id)
      );

      const story = await hydrateStoryRow(storyRow, profileRes.data, {
        currentUserId,
        viewsCount: uniqueViewers.size,
        reactionsCount: uniqueReactors.size,
        hasViewed: Boolean((myViewRes.data || []).length > 0),
        hasReacted: Boolean(myReactionRow),
        userReaction: myReactionRow ? myReactionRow.reaction || '❤️' : null,
      });

      const res: StoryByIdResult = { status: 'ok', story };
      storyLookupCache.set(cacheKey, {
        result: res,
        expiresAt: Date.now() + STORY_LOOKUP_CACHE_TTL_MS,
      });
      return res;
    } catch (err) {
      console.error('[Stories] fetchStoryById unexpected error:', err);
      return {
        status: 'unavailable',
        reason: 'error',
        error: err instanceof Error ? err.message : 'Unable to load this story right now.',
      };
    } finally {
      inFlightStoryLookups.delete(cacheKey);
    }
  })();

  inFlightStoryLookups.set(cacheKey, flightPromise);
  return flightPromise;
}

/**
 * Fetch all active (non-expired) campus stories strictly from Supabase (`stories`, `story_views`, `story_reactions`, `profiles`).
 */
export async function fetchActiveStories(currentUserId?: string): Promise<UserStoryGroup[]> {
  try {
    // 1. Try Express API endpoint first (uses admin client so schema/RLS never blocks story feed)
    try {
      const headers = await getOptionalAuthHeaders();
      const qs = currentUserId ? `?userId=${encodeURIComponent(currentUserId)}` : '';
      const apiRes = await fetch(`/api/stories${qs}`, { headers }).catch(() => null);
      const json = apiRes?.ok ? await parseApiJson(apiRes) : null;
      if (json?.success && Array.isArray(json.groups)) {
        return sortStoryGroups(json.groups as UserStoryGroup[], currentUserId);
      }
    } catch {
      // Fall back to direct Supabase client below (for static Vercel / offline hosts)
    }

    const nowIso = new Date().toISOString();

    let storiesData: any[] | null = null;
    let storiesErr: any = null;

    const extRes = await supabase
      .from('stories')
      .select(`
        id,
        user_id,
        media_type,
        storage_path,
        media_url,
        provider,
        cloudinary_public_id,
        cloudinary_resource_type,
        duration_seconds,
        thumbnail_url,
        text_content,
        caption,
        background_color,
        font_style,
        deleted_at,
        created_at,
        expires_at
      `)
      .gt('expires_at', nowIso)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (isMissingColumnError(extRes.error)) {
      const coreRes = await supabase
        .from('stories')
        .select('id, user_id, media_type, storage_path, text_content, caption, created_at, expires_at')
        .gt('expires_at', nowIso)
        .order('created_at', { ascending: true });
      storiesData = coreRes.data;
      storiesErr = coreRes.error;
    } else {
      storiesData = extRes.data;
      storiesErr = extRes.error;
    }

    if (storiesErr || !storiesData || storiesData.length === 0) {
      if (storiesErr) {
        console.warn('[Stories] Supabase fetch note:', storiesErr.message);
      }
      return [];
    }

    const storyIds = storiesData.map((s) => s.id);
    const userIds = Array.from(new Set(storiesData.map((s) => s.user_id)));

    const [profilesRes, viewsRes, reactionsRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, display_name, username, avatar_url, department, level')
        .in('id', userIds),
      supabase
        .from('story_views')
        .select('story_id, viewer_id')
        .in('story_id', storyIds),
      supabase
        .from('story_reactions')
        .select('story_id, user_id, reaction')
        .in('story_id', storyIds),
    ]);

    const profileMap = new Map<string, any>();
    if (profilesRes.data) {
      for (const p of profilesRes.data) profileMap.set(p.id, p);
    }

    const storyOwnerById = new Map<string, string>();
    for (const s of storiesData) {
      storyOwnerById.set(s.id, s.user_id);
    }

    const viewersByStory = new Map<string, Set<string>>();
    const viewedStorySet = new Set<string>();
    for (const v of (viewsRes.data || []) as Array<{ story_id: string; viewer_id: string }>) {
      if (currentUserId && v.viewer_id === currentUserId) {
        viewedStorySet.add(v.story_id);
      }
      const ownerId = storyOwnerById.get(v.story_id);
      if (ownerId && v.viewer_id === ownerId) continue;
      if (!viewersByStory.has(v.story_id)) viewersByStory.set(v.story_id, new Set());
      viewersByStory.get(v.story_id)!.add(v.viewer_id);
    }

    const reactorsByStory = new Map<string, Set<string>>();
    const myReactionByStory = new Map<string, string>();
    for (const r of (reactionsRes.data || []) as Array<{
      story_id: string;
      user_id: string;
      reaction?: string | null;
    }>) {
      if (!reactorsByStory.has(r.story_id)) reactorsByStory.set(r.story_id, new Set());
      reactorsByStory.get(r.story_id)!.add(r.user_id);
      if (currentUserId && r.user_id === currentUserId) {
        myReactionByStory.set(r.story_id, r.reaction || '❤️');
      }
    }

    const resolvedStories: Story[] = await Promise.all(
      storiesData.map((row) =>
        hydrateStoryRow(row, profileMap.get(row.user_id), {
          currentUserId,
          viewsCount: viewersByStory.get(row.id)?.size ?? 0,
          reactionsCount: reactorsByStory.get(row.id)?.size ?? 0,
          hasViewed: viewedStorySet.has(row.id),
          hasReacted: myReactionByStory.has(row.id),
          userReaction: myReactionByStory.get(row.id) ?? null,
        })
      )
    );

    const groupMap = new Map<string, UserStoryGroup>();

    for (const story of resolvedStories) {
      const uId = story.user_id;
      if (!groupMap.has(uId)) {
        groupMap.set(uId, {
          user_id: uId,
          user_name: story.user?.name || 'ABSU Student',
          user_avatar: story.user?.avatar_url,
          has_unviewed: false,
          latest_timestamp: story.created_at,
          stories: [],
        });
      }

      const group = groupMap.get(uId)!;
      group.stories.push(story);
      if (!story.has_viewed && uId !== currentUserId) {
        group.has_unviewed = true;
      }
      if (new Date(story.created_at) > new Date(group.latest_timestamp)) {
        group.latest_timestamp = story.created_at;
      }
    }

    return sortStoryGroups(Array.from(groupMap.values()), currentUserId);
  } catch (err) {
    console.error('[Stories] Unexpected error fetching stories:', err);
    return [];
  }
}

/**
 * Create a new 24-hour story (Text, Image, or Video) via Cloudinary (`absu-connect/stories`) & Supabase DB (`stories`).
 * Writes both `storage_path` (MPV1 compat) and `media_url` / Cloudinary metadata (MPV2).
 */
export async function createStory(params: {
  userId: string;
  mediaType: StoryMediaType;
  file?: File;
  fallbackUrl?: string;
  textContent?: string;
  caption?: string;
  backgroundColor?: string;
  fontStyle?: string;
  onProgress?: (msg: string) => void;
  onPercent?: (percent: number) => void;
  signal?: AbortSignal;
}): Promise<{ success: boolean; story?: Story; error?: string; aborted?: boolean }> {
  let uploadedPublicId: string | null = null;
  let uploadedResourceType: 'image' | 'video' = 'image';

  const rollbackCloudinary = async () => {
    if (uploadedPublicId) {
      await deleteCloudinaryAssets([
        {
          public_id: uploadedPublicId,
          resource_type: uploadedResourceType,
          entity_type: 'story',
        },
      ]).catch(() => {});
    }
  };

  try {
    const {
      userId,
      mediaType,
      file,
      textContent,
      caption,
      backgroundColor,
      fontStyle,
      onProgress,
      onPercent,
      signal,
    } = params;

    if (signal?.aborted) {
      return { success: false, aborted: true, error: 'Story upload cancelled.' };
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const effectiveUserId = sessionData?.session?.user?.id || userId;
    if (!effectiveUserId) {
      return { success: false, error: 'Please sign in to publish a story.' };
    }

    let resolvedMediaUrl: string | null = null;
    let durationSeconds: number | null = null;
    let thumbnailUrl: string | null = null;

    if (mediaType === 'image' || mediaType === 'video') {
      if (!file) {
        return { success: false, error: 'Please choose an image or video to post.' };
      }

      let fileToUpload = file;
      if (mediaType === 'video') {
        const vidVal = await validatePostVideoFile(fileToUpload);
        if (!vidVal.valid) {
          return { success: false, error: vidVal.error || 'Invalid story video.' };
        }
        durationSeconds = vidVal.metadata?.duration ?? null;
      } else {
        onProgress?.('Optimizing photo story...');
        const comp = await compressImageForUpload(fileToUpload, 2.5, 1920);
        fileToUpload = comp.file;
      }

      const cldRes = await uploadMediaToCloudinary(fileToUpload, 'story', {
        onProgress,
        onPercent,
        signal,
        maxBytes: 50 * 1024 * 1024,
      });

      if (!cldRes.success || !cldRes.secure_url) {
        return {
          success: false,
          aborted: cldRes.aborted,
          error: cldRes.error || 'Failed to upload story media to Cloudinary.',
        };
      }

      uploadedPublicId = cldRes.public_id || cldRes.asset_id || null;
      uploadedResourceType = mediaType === 'video' ? 'video' : 'image';
      resolvedMediaUrl = cldRes.secure_url;
      if (mediaType === 'video') {
        durationSeconds = durationSeconds ?? cldRes.duration ?? null;
        thumbnailUrl = buildCloudinaryVideoPosterUrl(cldRes.secure_url) || null;
      }
    } else if (mediaType === 'text') {
      if (!textContent || textContent.trim().length === 0) {
        return { success: false, error: 'Please write something for your text story.' };
      }
      onPercent?.(50);
    }

    if (signal?.aborted) {
      await rollbackCloudinary();
      return { success: false, aborted: true, error: 'Story upload cancelled.' };
    }

    onProgress?.('Saving story...');
    onPercent?.(95);

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // 1. Try Express API endpoint first (handles MPV1/MPV2 schema variations + admin fallback cleanly)
    try {
      const authHeaders = await getOptionalAuthHeaders();
      const apiRes = await fetch('/api/stories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          userId: effectiveUserId,
          mediaType,
          storagePath: resolvedMediaUrl,
          mediaUrl: resolvedMediaUrl,
          provider: resolvedMediaUrl ? 'cloudinary' : null,
          cloudinaryPublicId: uploadedPublicId,
          cloudinaryResourceType: resolvedMediaUrl ? uploadedResourceType : null,
          durationSeconds,
          thumbnailUrl,
          textContent: mediaType === 'text' ? textContent?.trim() : null,
          caption: caption?.trim() || null,
          backgroundColor: backgroundColor || null,
          fontStyle: fontStyle || null,
          expiresAt,
        }),
      }).catch(() => null);

      const apiJson = apiRes ? await parseApiJson(apiRes) : null;
      if (apiRes && apiRes.ok && apiJson?.success && apiJson.story) {
        onPercent?.(100);
        return {
          success: true,
          story: {
            ...apiJson.story,
            has_viewed: true,
          },
        };
      }
    } catch {
      // Fall back to direct Supabase insert below
    }

    const ownerScopedStoragePath =
      mediaType === 'text'
        ? null
        : encodeOwnerScopedStoryRef(effectiveUserId, resolvedMediaUrl);

    const extendedPayload: Record<string, any> = {
      user_id: effectiveUserId,
      media_type: mediaType,
      storage_path: ownerScopedStoragePath,
      media_url: resolvedMediaUrl,
      provider: resolvedMediaUrl ? 'cloudinary' : null,
      cloudinary_public_id: uploadedPublicId,
      cloudinary_resource_type: resolvedMediaUrl ? uploadedResourceType : null,
      duration_seconds: durationSeconds,
      thumbnail_url: thumbnailUrl,
      cleanup_status: 'pending',
      text_content: mediaType === 'text' ? textContent?.trim() : null,
      caption: caption?.trim() || null,
      background_color: backgroundColor || null,
      font_style: fontStyle || null,
      expires_at: expiresAt,
    };

    let { data: sbData, error: insertError } = await supabase
      .from('stories')
      .insert(extendedPayload)
      .select()
      .single();

    if (isMissingColumnError(insertError)) {
      const corePayload: Record<string, any> = {
        user_id: effectiveUserId,
        media_type: mediaType,
        storage_path: ownerScopedStoragePath,
        text_content: mediaType === 'text' ? textContent?.trim() : null,
        caption: caption?.trim() || null,
        expires_at: expiresAt,
      };
      const fallbackRes = await supabase.from('stories').insert(corePayload).select().single();
      sbData = fallbackRes.data;
      insertError = fallbackRes.error;
    }

    if (
      insertError &&
      mediaType === 'text' &&
      insertError.message?.toLowerCase().includes('stories_storage_owner_path')
    ) {
      const textRetryRes = await supabase
        .from('stories')
        .insert({
          user_id: effectiveUserId,
          media_type: mediaType,
          storage_path: `${effectiveUserId}/text_${Date.now()}.txt`,
          text_content: textContent?.trim() || null,
          caption: caption?.trim() || null,
          expires_at: expiresAt,
        })
        .select()
        .single();
      sbData = textRetryRes.data;
      insertError = textRetryRes.error;
    }

    if (insertError || !sbData) {
      console.error('[Stories] Supabase stories insert error:', insertError?.message);
      await rollbackCloudinary();
      return {
        success: false,
        error: insertError?.message || 'Failed to save story record in database.',
      };
    }

    onPercent?.(100);

    const decodedStoryMediaUrl =
      mediaType === 'text'
        ? null
        : resolvedMediaUrl || decodeOwnerScopedStoryRef(sbData.media_url || sbData.storage_path || '');

    return {
      success: true,
      story: {
        id: sbData.id,
        user_id: sbData.user_id,
        media_type: sbData.media_type as StoryMediaType,
        storage_path: decodedStoryMediaUrl,
        media_url: decodedStoryMediaUrl,
        provider: sbData.provider || (decodedStoryMediaUrl ? 'cloudinary' : null),
        cloudinary_public_id: sbData.cloudinary_public_id || uploadedPublicId,
        cloudinary_resource_type: sbData.cloudinary_resource_type || (decodedStoryMediaUrl ? uploadedResourceType : null),
        duration_seconds: sbData.duration_seconds ?? durationSeconds,
        thumbnail_url: sbData.thumbnail_url ?? thumbnailUrl,
        text_content: sbData.text_content,
        caption: sbData.caption,
        background_color: sbData.background_color || backgroundColor || null,
        font_style: sbData.font_style || fontStyle || null,
        created_at: sbData.created_at,
        expires_at: sbData.expires_at,
        has_viewed: true,
      },
    };
  } catch (err: unknown) {
    await rollbackCloudinary();
    const msg = err instanceof Error ? err.message : 'Failed to publish story';
    return { success: false, error: msg };
  }
}

/**
 * Record a view for a story idempotently in `story_views`.
 * Strictly skips recording if the viewer is the story owner, and prevents duplicate rows.
 */
export async function recordStoryView(
  storyId: string,
  viewerId: string,
  storyOwnerId?: string | null
): Promise<void> {
  if (!storyId || !viewerId) return;
  if (shouldSkipStoryViewRecord(storyOwnerId, viewerId)) return;

  try {
    // Verify story owner before recording when not provided
    let resolvedOwnerId = storyOwnerId || null;
    if (!resolvedOwnerId) {
      const { data: storyRow } = await supabase
        .from('stories')
        .select('user_id')
        .eq('id', storyId)
        .maybeSingle();
      resolvedOwnerId = storyRow?.user_id || null;
    }

    if (shouldSkipStoryViewRecord(resolvedOwnerId, viewerId)) {
      return;
    }

    const authHeaders = await getOptionalAuthHeaders();
    const apiRes = await fetch(`/api/stories/${encodeURIComponent(storyId)}/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ viewerId }),
    }).catch(() => null);
    const json = apiRes?.ok ? await parseApiJson(apiRes) : null;
    if (json?.success) {
      invalidateStoryCache(storyId);
      return;
    }

    const nowIso = new Date().toISOString();
    let { error } = await supabase
      .from('story_views')
      .upsert(
        { story_id: storyId, viewer_id: viewerId, viewed_at: nowIso },
        { onConflict: 'story_id,viewer_id', ignoreDuplicates: true }
      );

    if (error && isMissingColumnError(error)) {
      const retry = await supabase
        .from('story_views')
        .upsert(
          { story_id: storyId, viewer_id: viewerId },
          { onConflict: 'story_id,viewer_id', ignoreDuplicates: true }
        );
      error = retry.error;
    }

    if (error) {
      // Check existence first before falling back to insert so repeated opens never create duplicates
      const { data: existingView } = await supabase
        .from('story_views')
        .select('viewer_id')
        .eq('story_id', storyId)
        .eq('viewer_id', viewerId)
        .limit(1)
        .maybeSingle();

      if (!existingView) {
        const ins = await supabase
          .from('story_views')
          .insert({ story_id: storyId, viewer_id: viewerId, viewed_at: nowIso });
        if (ins.error && isMissingColumnError(ins.error)) {
          await supabase
            .from('story_views')
            .insert({ story_id: storyId, viewer_id: viewerId });
        }
      }
    }

    invalidateStoryCache(storyId);
  } catch {
    // Ignore duplicate constraint conflicts safely
  }
}

/**
 * Add, change, or remove a user's reaction on a story cleanly without duplicates.
 * Pass `reaction = null` to remove the user's reaction.
 */
export async function setStoryReaction(
  storyId: string,
  userId: string,
  reaction: string | null
): Promise<{
  success: boolean;
  reacted: boolean;
  reaction: string | null;
  error?: string;
}> {
  if (!storyId || !userId) {
    return {
      success: false,
      reacted: false,
      reaction: null,
      error: 'Missing story or user ID',
    };
  }

  const nextReaction = reaction ? reaction.trim() : null;

  try {
    const authHeaders = await getOptionalAuthHeaders();
    const apiRes = await fetch(`/api/stories/${encodeURIComponent(storyId)}/reaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({
        userId,
        reaction: nextReaction,
        currentlyLiked: nextReaction === null,
      }),
    }).catch(() => null);
    const json = apiRes?.ok ? await parseApiJson(apiRes) : null;
    if (json?.success && 'reaction' in json) {
      invalidateStoryCache(storyId);
      return {
        success: true,
        reacted: Boolean(json.liked ?? json.reaction),
        reaction: json.reaction ?? null,
      };
    }

    if (!nextReaction) {
      const { error } = await supabase
        .from('story_reactions')
        .delete()
        .eq('story_id', storyId)
        .eq('user_id', userId);

      if (error) {
        return { success: false, reacted: true, reaction: null, error: error.message };
      }
      invalidateStoryCache(storyId);
      return { success: true, reacted: false, reaction: null };
    }

    // Attempt upsert first (updates reaction if UNIQUE(story_id, user_id) & UPDATE policy allow)
    const { error: upsertErr } = await supabase
      .from('story_reactions')
      .upsert(
        {
          story_id: storyId,
          user_id: userId,
          reaction: nextReaction,
        },
        { onConflict: 'story_id,user_id', ignoreDuplicates: false }
      );

    if (upsertErr) {
      // Fallback for RLS without UPDATE policy or missing unique constraint: DELETE then INSERT
      await supabase
        .from('story_reactions')
        .delete()
        .eq('story_id', storyId)
        .eq('user_id', userId);

      const { error: insertErr } = await supabase
        .from('story_reactions')
        .insert({
          story_id: storyId,
          user_id: userId,
          reaction: nextReaction,
        });

      if (insertErr) {
        return {
          success: false,
          reacted: false,
          reaction: null,
          error: insertErr.message,
        };
      }
    }

    invalidateStoryCache(storyId);
    return { success: true, reacted: true, reaction: nextReaction };
  } catch (err: unknown) {
    console.error('[Stories] Error updating story reaction:', err);
    return {
      success: false,
      reacted: false,
      reaction: null,
      error: err instanceof Error ? err.message : 'Failed to update story reaction',
    };
  }
}

/**
 * Legacy boolean toggle wrapper kept compatible with existing callers.
 */
export async function toggleStoryReaction(
  storyId: string,
  userId: string,
  currentlyLiked: boolean
): Promise<{ success: boolean; liked: boolean; error?: string }> {
  const res = await setStoryReaction(storyId, userId, currentlyLiked ? null : '❤️');
  return {
    success: res.success,
    liked: res.reacted,
    error: res.error,
  };
}

/**
 * Reply to a story:
 * 1. Invokes Supabase RPC `reply_to_story(p_story_id, p_body)`.
 * 2. Falls back to direct conversation creation + `sendRealMessage` when RPC is not yet provisioned
 *    and `storyOwner` context is supplied.
 */
export async function replyToStory(
  storyId: string,
  body: string,
  storyOwner?: { id: string; name: string; avatar?: string }
): Promise<{ success: boolean; messageId?: string; conversationId?: string; error?: string }> {
  const trimmed = body.trim();
  if (!storyId || !trimmed) {
    return { success: false, error: 'Reply text cannot be empty' };
  }

  try {
    const { data, error } = await supabase.rpc('reply_to_story', {
      p_story_id: storyId,
      p_body: trimmed,
    });

    if (!error) {
      return { success: true, messageId: typeof data === 'string' ? data : undefined };
    }

    console.warn('[Stories] reply_to_story RPC notice:', error.message);

    // Fallback: create/open DM with the story owner and send formatted reply
    const { data: sessionData } = await supabase.auth.getSession();
    const senderId = sessionData?.session?.user?.id;
    if (senderId && storyOwner?.id && storyOwner.id !== senderId) {
      const targetUser: User = {
        id: storyOwner.id,
        name: storyOwner.name || 'ABSU Student',
        avatar: storyOwner.avatar || '',
        handle: '@student',
        department: '',
        faculty: '',
        level: '',
        campus: '',
        bio: '',
        interests: [],
        relationshipState: 'none',
      };
      const convRes = await getOrCreateDirectConversation(senderId, targetUser);
      if (convRes.success && convRes.conversation?.id) {
        const msgRes = await sendRealMessage({
          conversationId: convRes.conversation.id,
          senderId,
          text: `Replied to your story: ${trimmed}`,
        });
        if (msgRes.success) {
          return {
            success: true,
            messageId: msgRes.message?.id,
            conversationId: convRes.conversation.id,
          };
        }
        return { success: false, error: msgRes.error || error.message };
      }
    }

    return { success: false, error: error.message };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to send reply';
    return { success: false, error: msg };
  }
}

/**
 * Fetch insights (viewers & reactions with full profiles) for a story.
 * Queries live `story_views` (`story_id, viewer_id, viewed_at`) and `story_reactions`
 * (`story_id, user_id, reaction, created_at`), joins `profiles` by user ID,
 * and excludes owner self-views deterministically.
 */
export async function fetchStoryInsights(
  storyId: string,
  storyOwnerId?: string | null
): Promise<{
  views: StoryViewItem[];
  viewsCount: number;
  reactions: StoryReactionItem[];
  reactionsCount: number;
}> {
  if (!storyId) {
    return { views: [], viewsCount: 0, reactions: [], reactionsCount: 0 };
  }

  try {
    const authHeaders = await getOptionalAuthHeaders();
    const apiRes = await fetch(`/api/stories/${encodeURIComponent(storyId)}/insights`, {
      headers: authHeaders,
    }).catch(() => null);
    const json = apiRes?.ok ? await parseApiJson(apiRes) : null;
    if (json?.success && Array.isArray(json.views) && Array.isArray(json.reactions)) {
      return {
        views: json.views as StoryViewItem[],
        viewsCount: Number(json.viewsCount ?? json.views.length) || 0,
        reactions: json.reactions as StoryReactionItem[],
        reactionsCount: Number(json.reactionsCount ?? json.reactions.length) || 0,
      };
    }

    let resolvedOwnerId = storyOwnerId || null;
    if (!resolvedOwnerId) {
      const { data: storyRow } = await supabase
        .from('stories')
        .select('user_id')
        .eq('id', storyId)
        .maybeSingle();
      resolvedOwnerId = storyRow?.user_id || null;
    }

    const fetchViews = async (): Promise<RawStoryViewRow[]> => {
      const primary = await supabase
        .from('story_views')
        .select('story_id, viewer_id, viewed_at')
        .eq('story_id', storyId)
        .order('viewed_at', { ascending: false });

      if (!primary.error) {
        return (primary.data || []) as RawStoryViewRow[];
      }

      if (isMissingColumnError(primary.error)) {
        const legacy = await supabase
          .from('story_views')
          .select('id, story_id, viewer_id, created_at')
          .eq('story_id', storyId)
          .order('created_at', { ascending: false });
        if (!legacy.error) {
          return (legacy.data || []) as RawStoryViewRow[];
        }
      }

      console.warn('[Stories] story_views insights note:', primary.error.message);
      return [];
    };

    const fetchReactions = async (): Promise<RawStoryReactionRow[]> => {
      const primary = await supabase
        .from('story_reactions')
        .select('story_id, user_id, reaction, created_at')
        .eq('story_id', storyId)
        .order('created_at', { ascending: false });

      if (!primary.error) {
        return (primary.data || []) as RawStoryReactionRow[];
      }

      if (isMissingColumnError(primary.error)) {
        const legacy = await supabase
          .from('story_reactions')
          .select('story_id, user_id, reaction_type, created_at')
          .eq('story_id', storyId)
          .order('created_at', { ascending: false });
        if (!legacy.error) {
          return (legacy.data || []) as RawStoryReactionRow[];
        }
      }

      console.warn('[Stories] story_reactions insights note:', primary.error.message);
      return [];
    };

    const [viewsRows, reactionsRows] = await Promise.all([fetchViews(), fetchReactions()]);

    const userIdSet = new Set<string>();
    for (const v of viewsRows) {
      if (v.viewer_id && (!resolvedOwnerId || v.viewer_id !== resolvedOwnerId)) {
        userIdSet.add(v.viewer_id);
      }
    }
    for (const r of reactionsRows) {
      if (r.user_id) {
        userIdSet.add(r.user_id);
      }
    }

    const profilesById = new Map<string, RawProfileMiniRow>();
    const allUserIds = Array.from(userIdSet);
    if (allUserIds.length > 0) {
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id, display_name, username, avatar_url, department, level')
        .in('id', allUserIds);

      for (const p of (profileRows || []) as RawProfileMiniRow[]) {
        profilesById.set(p.id, p);
      }
    }

    return normalizeStoryInsightsRows({
      viewsRows,
      reactionsRows,
      profilesById,
      storyOwnerId: resolvedOwnerId,
    });
  } catch (err) {
    console.error('[Stories] Error fetching insights:', err);
    return { views: [], viewsCount: 0, reactions: [], reactionsCount: 0 };
  }
}

/**
 * Delete a story and remove its Cloudinary or legacy Storage asset.
 * If Cloudinary deletion fails transiently, soft-deletes the story immediately so scheduled cleanup retries.
 */
export async function deleteStory(
  storyId: string,
  storagePath?: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    let storyRow: any = null;
    const extSel = await supabase
      .from('stories')
      .select('id, storage_path, media_url, provider, media_type, cloudinary_public_id, cloudinary_resource_type')
      .eq('id', storyId)
      .maybeSingle();

    if (extSel.error) {
      const coreSel = await supabase
        .from('stories')
        .select('id, storage_path, media_type')
        .eq('id', storyId)
        .maybeSingle();
      storyRow = coreSel.data;
    } else {
      storyRow = extSel.data;
    }

    const rawStoragePath = storyRow?.storage_path || storagePath || '';
    const mediaRef = decodeOwnerScopedStoryRef(storyRow?.media_url || rawStoragePath || '');
    const isCloudinary =
      storyRow?.provider === 'cloudinary' ||
      Boolean(storyRow?.cloudinary_public_id) ||
      String(mediaRef).includes('res.cloudinary.com') ||
      String(rawStoragePath).includes('/cld__');

    let cloudCleanupSucceeded = true;

    if (isCloudinary) {
      const publicId =
        storyRow?.cloudinary_public_id || extractCloudinaryPublicId(mediaRef);
      if (publicId) {
        const resType: 'image' | 'video' =
          storyRow?.cloudinary_resource_type === 'video' || storyRow?.media_type === 'video'
            ? 'video'
            : 'image';
        const delRes = await deleteCloudinaryAssets([
          {
            public_id: publicId,
            resource_type: resType,
            entity_type: 'story',
            entity_id: storyId,
          },
        ]);
        cloudCleanupSucceeded = delRes.success;
      }
    }

    if (isCloudinary && !cloudCleanupSucceeded) {
      const { error: softErr } = await supabase
        .from('stories')
        .update({
          deleted_at: new Date().toISOString(),
          cleanup_status: 'pending',
        })
        .eq('id', storyId);

      if (!softErr) {
        invalidateStoryCache(storyId);
        return { success: true };
      }
    }

    const authHeaders = await getOptionalAuthHeaders();
    const apiDelRes = await fetch(`/api/stories/${encodeURIComponent(storyId)}`, {
      method: 'DELETE',
      headers: authHeaders,
    }).catch(() => null);
    const apiDelJson = apiDelRes?.ok ? await parseApiJson(apiDelRes) : null;
    if (apiDelJson?.success) {
      invalidateStoryCache(storyId);
      return { success: true };
    }

    const { error } = await supabase.from('stories').delete().eq('id', storyId);
    if (error) {
      return { success: false, error: error.message };
    }

    if (
      !isCloudinary &&
      mediaRef &&
      !mediaRef.startsWith('http') &&
      !String(rawStoragePath).match(/\/text_\d+\.txt$/)
    ) {
      await deleteStoryMediaFromStorage(mediaRef);
    }

    invalidateStoryCache(storyId);
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete story';
    return { success: false, error: msg };
  }
}
