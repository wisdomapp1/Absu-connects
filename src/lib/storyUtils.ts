import type { StoryReactionItem, StoryViewItem, StoryViewerProfile } from '../types/stories.ts';

export const STORY_QUICK_REACTIONS = [
  { key: '❤️', label: 'Love' },
  { key: '🔥', label: 'Fire' },
  { key: '😂', label: 'Haha' },
  { key: '😮', label: 'Wow' },
  { key: '👏', label: 'Clap' },
  { key: '😢', label: 'Sad' },
] as const;

const LEGACY_REACTION_EMOJI_MAP: Record<string, string> = {
  like: '❤️',
  heart: '❤️',
  love: '❤️',
  fire: '🔥',
  flame: '🔥',
  haha: '😂',
  laugh: '😂',
  lol: '😂',
  wow: '😮',
  surprised: '😮',
  clap: '👏',
  applause: '👏',
  sad: '😢',
  cry: '😢',
  thumbsup: '👍',
  thumbs_up: '👍',
};

const REACTION_LABEL_MAP: Record<string, string> = {
  '❤️': 'Love',
  '🔥': 'Fire',
  '😂': 'Haha',
  '😮': 'Wow',
  '👏': 'Clap',
  '😢': 'Sad',
  '👍': 'Like',
};

export function formatStoryReactionEmoji(reaction?: string | null): string {
  const raw = String(reaction || '').trim();
  if (!raw) return '❤️';
  const mapped = LEGACY_REACTION_EMOJI_MAP[raw.toLowerCase()];
  if (mapped) return mapped;
  return raw;
}

export function formatStoryReactionLabel(reaction?: string | null): string {
  const emoji = formatStoryReactionEmoji(reaction);
  return REACTION_LABEL_MAP[emoji] || emoji;
}

export function extractStoryIdFromAttachment(
  att:
    | {
        story_id?: string | null;
        asset_id?: string | null;
        secure_url?: string | null;
      }
    | null
    | undefined
): string | null {
  if (!att) return null;

  const directStoryId = typeof att.story_id === 'string' ? att.story_id.trim() : '';
  if (directStoryId) return directStoryId;

  const secureUrl = typeof att.secure_url === 'string' ? att.secure_url.trim() : '';
  if (secureUrl.toLowerCase().startsWith('story://')) {
    const id = secureUrl.slice('story://'.length).split(/[/?#]/)[0]?.trim();
    if (id) return id;
  }

  const assetId = typeof att.asset_id === 'string' ? att.asset_id.trim() : '';
  if (assetId.toLowerCase().startsWith('story:')) {
    const id = assetId.slice('story:'.length).trim();
    if (id) return id;
  }
  if (assetId.toLowerCase().startsWith('story://')) {
    const id = assetId.slice('story://'.length).split(/[/?#]/)[0]?.trim();
    if (id) return id;
  }

  return null;
}

export function isStoryAttachment(
  att:
    | {
        story_id?: string | null;
        asset_id?: string | null;
        secure_url?: string | null;
      }
    | null
    | undefined
): boolean {
  return Boolean(extractStoryIdFromAttachment(att));
}

export function shouldSkipStoryViewRecord(
  storyOwnerId: string | null | undefined,
  viewerId: string | null | undefined
): boolean {
  if (!viewerId) return true;
  if (storyOwnerId && storyOwnerId === viewerId) return true;
  return false;
}

export function isStoryExpired(
  expiresAt: string | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!expiresAt) return false;
  const ts = new Date(expiresAt).getTime();
  if (!Number.isFinite(ts)) return false;
  return ts <= nowMs;
}

export function isStoryNotificationType(typeOrEntity?: string | null): boolean {
  const clean = String(typeOrEntity || '').toLowerCase().trim();
  return (
    clean === 'story_comment' ||
    clean === 'story_reaction' ||
    clean === 'story_view' ||
    clean === 'story_like'
  );
}

export interface RawStoryViewRow {
  id?: string;
  story_id: string;
  viewer_id: string;
  viewed_at?: string | null;
  created_at?: string | null;
}

export interface RawStoryReactionRow {
  id?: string;
  story_id: string;
  user_id: string;
  reaction?: string | null;
  reaction_type?: string | null;
  created_at?: string | null;
}

export interface RawProfileMiniRow {
  id: string;
  display_name?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  department?: string | null;
  level?: string | null;
}

function mapMiniProfile(row?: RawProfileMiniRow): StoryViewerProfile | undefined {
  if (!row) return undefined;
  return {
    id: row.id,
    name: row.display_name || row.username || 'ABSU Student',
    avatar_url: row.avatar_url || undefined,
    department: row.department || undefined,
    level: row.level || undefined,
  };
}

/**
 * Pure deterministic normalization for story viewers and reactions:
 * - Excludes story owner self-views from viewer list & view count
 * - Deduplicates repeated view rows per viewer keeping the most recent timestamp
 * - Deduplicates reaction rows per user keeping the most recent timestamp
 * - Maps profile metadata reliably without PostgREST FK join ambiguity
 */
export function normalizeStoryInsightsRows(params: {
  viewsRows: RawStoryViewRow[];
  reactionsRows: RawStoryReactionRow[];
  profilesById: Map<string, RawProfileMiniRow> | Record<string, RawProfileMiniRow>;
  storyOwnerId?: string | null;
}): {
  views: StoryViewItem[];
  viewsCount: number;
  reactions: StoryReactionItem[];
  reactionsCount: number;
} {
  const getProfile = (id: string): RawProfileMiniRow | undefined =>
    params.profilesById instanceof Map
      ? params.profilesById.get(id)
      : params.profilesById[id];

  const viewsByViewer = new Map<string, StoryViewItem>();
  for (const row of params.viewsRows || []) {
    if (!row?.viewer_id) continue;
    if (params.storyOwnerId && row.viewer_id === params.storyOwnerId) continue;

    const viewedAt = row.viewed_at || row.created_at || new Date(0).toISOString();
    const existing = viewsByViewer.get(row.viewer_id);
    if (existing) {
      const existingTs = new Date(existing.viewed_at).getTime();
      const nextTs = new Date(viewedAt).getTime();
      if (nextTs <= existingTs) continue;
    }

    viewsByViewer.set(row.viewer_id, {
      id: row.id || `${row.story_id}_${row.viewer_id}`,
      story_id: row.story_id,
      viewer_id: row.viewer_id,
      viewed_at: viewedAt,
      created_at: row.created_at || viewedAt,
      viewer: mapMiniProfile(getProfile(row.viewer_id)),
    });
  }

  const views = Array.from(viewsByViewer.values()).sort(
    (a, b) => new Date(b.viewed_at).getTime() - new Date(a.viewed_at).getTime()
  );

  const reactionsByUser = new Map<string, StoryReactionItem>();
  for (const row of params.reactionsRows || []) {
    if (!row?.user_id) continue;
    const createdAt = row.created_at || new Date(0).toISOString();
    const existing = reactionsByUser.get(row.user_id);
    if (existing) {
      const existingTs = new Date(existing.created_at).getTime();
      const nextTs = new Date(createdAt).getTime();
      if (nextTs <= existingTs) continue;
    }

    const rawReaction = row.reaction || row.reaction_type || 'like';
    reactionsByUser.set(row.user_id, {
      id: row.id || `${row.story_id}_${row.user_id}`,
      story_id: row.story_id,
      user_id: row.user_id,
      reaction: rawReaction,
      reaction_type: rawReaction,
      created_at: createdAt,
      user: mapMiniProfile(getProfile(row.user_id)),
    });
  }

  const reactions = Array.from(reactionsByUser.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return {
    views,
    viewsCount: views.length,
    reactions,
    reactionsCount: reactions.length,
  };
}
