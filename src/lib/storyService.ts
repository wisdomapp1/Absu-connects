import { supabase } from './supabase.ts';
import type { Story, UserStoryGroup, StoryMediaType, StoryViewItem } from '../types/stories.ts';
import {
  uploadStoryMediaToStorage,
  resolveStoryMediaSignedUrl,
  deleteStoryMediaFromStorage,
} from './storageService.ts';
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
    const { data: storiesData, error: storiesErr } = await supabase
      .from('stories')
      .select(`
        id,
        user_id,
        media_type,
        storage_path,
        text_content,
        caption,
        created_at,
        expires_at
      `)
      .gt('expires_at', nowIso)
      .order('created_at', { ascending: true });

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
        let signedUrl = row.storage_path;
        if (row.storage_path && row.media_type !== 'text') {
          signedUrl = await resolveStoryMediaSignedUrl(row.storage_path);
        }

        const author = profileMap.get(row.user_id);
        const authorName =
          author?.display_name || author?.username || 'ABSU Student';

        return {
          id: row.id,
          user_id: row.user_id,
          media_type: row.media_type as StoryMediaType,
          storage_path: signedUrl,
          text_content: row.text_content,
          caption: row.caption,
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
 * Create a new 24-hour story (Text, Image, or Video) strictly via Supabase Storage ('story-media') & Supabase DB ('stories').
 * Client never sets `created_at` or `expires_at` manually; PostgreSQL handles defaults/triggers.
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
}): Promise<{ success: boolean; story?: Story; error?: string }> {
  let uploadedStoragePath: string | null = null;

  try {
    const { userId, mediaType, file, fallbackUrl, textContent, caption, onProgress } = params;

    const { data: sessionData } = await supabase.auth.getSession();
    const effectiveUserId = sessionData?.session?.user?.id || userId;
    if (!effectiveUserId) {
      return { success: false, error: 'Please sign in to publish a story.' };
    }

    let resolvedMediaUrl: string | null = null;

    if (mediaType === 'image' || mediaType === 'video') {
      if (!file) {
        return { success: false, error: 'Please choose an image or video to post.' };
      }

      onProgress?.(`Uploading ${mediaType} story to Supabase Storage...`);
      const sbResult = await uploadStoryMediaToStorage(
        effectiveUserId,
        file,
        mediaType,
        onProgress,
        fallbackUrl
      );
      if (!sbResult.success || !sbResult.path) {
        return {
          success: false,
          error: sbResult.error || 'Failed to upload story media to Supabase Storage.',
        };
      }
      uploadedStoragePath = sbResult.path;
      resolvedMediaUrl = sbResult.url || sbResult.path;
    } else if (mediaType === 'text') {
      if (!textContent || textContent.trim().length === 0) {
        return { success: false, error: 'Please write something for your text story.' };
      }
    }

    onProgress?.('Saving story to Supabase...');

    const { data: sbData, error: insertError } = await supabase
      .from('stories')
      .insert({
        user_id: effectiveUserId,
        media_type: mediaType,
        storage_path: uploadedStoragePath,
        text_content: mediaType === 'text' ? textContent?.trim() : null,
        caption: caption?.trim() || null,
      })
      .select()
      .single();

    if (insertError || !sbData) {
      console.error('[Stories] Supabase stories insert error:', insertError?.message);
      if (uploadedStoragePath) {
        await deleteStoryMediaFromStorage(uploadedStoragePath);
      }
      return {
        success: false,
        error: insertError?.message || 'Failed to save story record in database.',
      };
    }

    return {
      success: true,
      story: {
        id: sbData.id,
        user_id: sbData.user_id,
        media_type: sbData.media_type as StoryMediaType,
        storage_path:
          resolvedMediaUrl ||
          (sbData.storage_path ? await resolveStoryMediaSignedUrl(sbData.storage_path) : null),
        text_content: sbData.text_content,
        caption: sbData.caption,
        created_at: sbData.created_at,
        expires_at: sbData.expires_at,
        has_viewed: true,
      },
    };
  } catch (err: unknown) {
    if (uploadedStoragePath) {
      await deleteStoryMediaFromStorage(uploadedStoragePath);
    }
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
 * Delete a story from Supabase and clean up its `story-media` storage object.
 */
export async function deleteStory(
  storyId: string,
  storagePath?: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: storyRow } = await supabase
      .from('stories')
      .select('storage_path')
      .eq('id', storyId)
      .maybeSingle();

    const { error } = await supabase.from('stories').delete().eq('id', storyId);
    if (error) {
      return { success: false, error: error.message };
    }

    const rawPath = storyRow?.storage_path || storagePath;
    if (rawPath && !rawPath.startsWith('http')) {
      await deleteStoryMediaFromStorage(rawPath);
    }
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete story';
    return { success: false, error: msg };
  }
}
