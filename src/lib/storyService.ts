import { supabase } from './supabase.ts';
import type { Story, UserStoryGroup, StoryMediaType, StoryViewItem } from '../types/stories.ts';
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
import type { User } from '../types/index.ts';

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

/**
 * Fetch all active (non-expired) campus stories strictly from Supabase (`stories`, `story_views`, `story_reactions`, `profiles`).
 */
export async function fetchActiveStories(currentUserId?: string): Promise<UserStoryGroup[]> {
  try {
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

    if (
      extRes.error &&
      (extRes.error.code === '42703' ||
        extRes.error.code === 'PGRST204' ||
        extRes.error.message?.toLowerCase().includes('column'))
    ) {
      const coreRes = await supabase
        .from('stories')
        .select(`
          id,
          user_id,
          media_type,
          storage_path,
          text_content,
          caption,
          background_color,
          font_style,
          created_at,
          expires_at
        `)
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
        console.warn('[Stories] Supabase fetch error:', storiesErr.message);
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
      currentUserId
        ? supabase
            .from('story_views')
            .select('story_id, viewer_id')
            .in('story_id', storyIds)
            .eq('viewer_id', currentUserId)
        : Promise.resolve({ data: [] as Array<{ story_id: string; viewer_id: string }> }),
      currentUserId
        ? supabase
            .from('story_reactions')
            .select('story_id, user_id')
            .in('story_id', storyIds)
            .eq('user_id', currentUserId)
        : Promise.resolve({ data: [] as Array<{ story_id: string; user_id: string }> }),
    ]);

    const profileMap = new Map<string, any>();
    if (profilesRes.data) {
      for (const p of profilesRes.data) profileMap.set(p.id, p);
    }

    const viewedStorySet = new Set<string>();
    if (viewsRes.data) {
      for (const v of viewsRes.data) viewedStorySet.add(v.story_id);
    }

    const reactedStorySet = new Set<string>();
    if (reactionsRes.data) {
      for (const r of reactionsRes.data) reactedStorySet.add(r.story_id);
    }

    const resolvedStories: Story[] = await Promise.all(
      storiesData.map(async (row) => {
        const rawMediaRef = row.media_url || row.storage_path || '';
        const isDirectUrl =
          row.provider === 'cloudinary' ||
          rawMediaRef.startsWith('https://') ||
          rawMediaRef.startsWith('http://') ||
          rawMediaRef.startsWith('data:');

        let signedUrl = rawMediaRef;
        if (rawMediaRef && row.media_type !== 'text' && !isDirectUrl) {
          signedUrl = await resolveStoryMediaSignedUrl(rawMediaRef);
        }

        const author = profileMap.get(row.user_id);
        const authorName =
          author?.display_name || author?.username || 'ABSU Student';

        return {
          id: row.id,
          user_id: row.user_id,
          media_type: row.media_type as StoryMediaType,
          storage_path: signedUrl,
          media_url: row.media_url || signedUrl,
          provider: row.provider || (signedUrl.includes('res.cloudinary.com') ? 'cloudinary' : 'supabase'),
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
          has_viewed: viewedStorySet.has(row.id),
          has_reacted: reactedStorySet.has(row.id),
          user: {
            id: row.user_id,
            name: authorName,
            avatar_url: author?.avatar_url,
            department: author?.department,
          },
        };
      })
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

    const extendedPayload: Record<string, any> = {
      user_id: effectiveUserId,
      media_type: mediaType,
      storage_path: resolvedMediaUrl,
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
    };

    let { data: sbData, error: insertError } = await supabase
      .from('stories')
      .insert(extendedPayload)
      .select()
      .single();

    if (
      insertError &&
      (insertError.code === '42703' ||
        insertError.code === 'PGRST204' ||
        insertError.message?.toLowerCase().includes('schema cache') ||
        insertError.message?.toLowerCase().includes('column'))
    ) {
      const corePayload: Record<string, any> = {
        user_id: effectiveUserId,
        media_type: mediaType,
        storage_path: resolvedMediaUrl,
        text_content: mediaType === 'text' ? textContent?.trim() : null,
        caption: caption?.trim() || null,
        background_color: backgroundColor || null,
        font_style: fontStyle || null,
      };
      const fallbackRes = await supabase.from('stories').insert(corePayload).select().single();
      sbData = fallbackRes.data;
      insertError = fallbackRes.error;
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

    return {
      success: true,
      story: {
        id: sbData.id,
        user_id: sbData.user_id,
        media_type: sbData.media_type as StoryMediaType,
        storage_path: resolvedMediaUrl || sbData.storage_path || null,
        media_url: sbData.media_url || resolvedMediaUrl || sbData.storage_path || null,
        provider: sbData.provider || (resolvedMediaUrl ? 'cloudinary' : null),
        cloudinary_public_id: sbData.cloudinary_public_id || uploadedPublicId,
        cloudinary_resource_type: sbData.cloudinary_resource_type || (resolvedMediaUrl ? uploadedResourceType : null),
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
 */
export async function recordStoryView(storyId: string, viewerId: string): Promise<void> {
  if (!storyId || !viewerId) return;
  try {
    const { error } = await supabase
      .from('story_views')
      .upsert(
        { story_id: storyId, viewer_id: viewerId },
        { onConflict: 'story_id,viewer_id', ignoreDuplicates: true }
      );

    if (error) {
      await supabase
        .from('story_views')
        .insert({ story_id: storyId, viewer_id: viewerId });
    }
  } catch {
    // Ignore duplicate constraint conflicts safely
  }
}

/**
 * Toggle reaction (like) on a story directly in Supabase `story_reactions`.
 */
export async function toggleStoryReaction(
  storyId: string,
  userId: string,
  currentlyLiked: boolean
): Promise<{ success: boolean; liked: boolean; error?: string }> {
  try {
    if (currentlyLiked) {
      const { error } = await supabase
        .from('story_reactions')
        .delete()
        .eq('story_id', storyId)
        .eq('user_id', userId);

      if (error) {
        return { success: false, liked: currentlyLiked, error: error.message };
      }
      return { success: true, liked: false };
    } else {
      const { error } = await supabase
        .from('story_reactions')
        .upsert(
          {
            story_id: storyId,
            user_id: userId,
            reaction: 'like',
          },
          { onConflict: 'story_id,user_id', ignoreDuplicates: true }
        );

      if (error) {
        return { success: false, liked: currentlyLiked, error: error.message };
      }
      return { success: true, liked: true };
    }
  } catch (err: unknown) {
    console.error('[Stories] Error toggling reaction:', err);
    return {
      success: false,
      liked: currentlyLiked,
      error: err instanceof Error ? err.message : 'Failed to update story reaction',
    };
  }
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
 * Fetch insights/viewers for a story directly from Supabase (`story_views` + `story_reactions` + `profiles`).
 */
export async function fetchStoryInsights(storyId: string): Promise<{
  views: StoryViewItem[];
  reactionsCount: number;
}> {
  try {
    const [viewsRes, reactionsRes] = await Promise.all([
      supabase
        .from('story_views')
        .select(`
          id,
          story_id,
          viewer_id,
          created_at,
          profiles:viewer_id (
            id,
            display_name,
            username,
            avatar_url,
            department,
            level
          )
        `)
        .eq('story_id', storyId)
        .order('created_at', { ascending: false }),
      supabase
        .from('story_reactions')
        .select('id', { count: 'exact', head: true })
        .eq('story_id', storyId),
    ]);

    const formattedViews: StoryViewItem[] = (viewsRes.data || []).map((row: any) => ({
      id: row.id,
      story_id: row.story_id,
      viewer_id: row.viewer_id,
      created_at: row.created_at,
      viewer: row.profiles
        ? {
            id: row.profiles.id,
            name: row.profiles.display_name || row.profiles.username || 'ABSU Student',
            avatar_url: row.profiles.avatar_url,
            department: row.profiles.department,
            level: row.profiles.level,
          }
        : undefined,
    }));

    return {
      views: formattedViews,
      reactionsCount: reactionsRes.count || 0,
    };
  } catch (err) {
    console.error('[Stories] Error fetching insights:', err);
    return { views: [], reactionsCount: 0 };
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

    const mediaRef = storyRow?.media_url || storyRow?.storage_path || storagePath || '';
    const isCloudinary =
      storyRow?.provider === 'cloudinary' ||
      Boolean(storyRow?.cloudinary_public_id) ||
      String(mediaRef).includes('res.cloudinary.com');

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
      // Soft-delete immediately so story disappears from active feed and cron retries Cloudinary cleanup
      const { error: softErr } = await supabase
        .from('stories')
        .update({
          deleted_at: new Date().toISOString(),
          cleanup_status: 'pending',
        })
        .eq('id', storyId);

      if (!softErr) {
        return { success: true };
      }
      // If deleted_at column is not yet migrated, proceed with hard delete
    }

    const { error } = await supabase.from('stories').delete().eq('id', storyId);
    if (error) {
      return { success: false, error: error.message };
    }

    if (!isCloudinary && mediaRef && !mediaRef.startsWith('http')) {
      await deleteStoryMediaFromStorage(mediaRef);
    }
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete story';
    return { success: false, error: msg };
  }
}
