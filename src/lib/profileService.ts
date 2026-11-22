import { supabase } from './supabase.ts';
import type { User } from '../types/index.ts';

export interface SupabaseProfileRow {
  id: string;
  display_name?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  avatar_asset_id?: string | null;
  department?: string | null;
  level?: string | null;
  campus?: string | null;
  bio?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

/**
 * Maps a real Supabase `profiles` database row into the frontend `User` interface
 */
export function mapProfileRowToUser(
  row: SupabaseProfileRow,
  authEmail?: string | null,
  relationshipState: User['relationshipState'] = 'none'
): User & { onboardingCompleted: boolean } {
  const name =
    row.display_name?.trim() ||
    (row.username ? `@${row.username}` : (authEmail ? authEmail.split('@')[0] : 'ABSU Student'));

  const avatar =
    row.avatar_url ||
    `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=6d45d9&textColor=ffffff`;

  const level = row.level || '100 Level';
  const campus = row.campus || 'Uturu (Main Campus)';
  const department = row.department || 'Undergraduate Student';
  const faculty = 'Abia State University';
  const bio = row.bio || '';
  const interests: string[] = [];

  const handle = row.username ? (row.username.startsWith('@') ? row.username : `@${row.username}`) : `@${name.toLowerCase().replace(/[^a-z0-9_]/g, '')}`;

  const onboardingCompleted = Boolean(
    (row.department && row.department !== 'Undergraduate Student') ||
    (row.bio && row.bio.trim().length > 0) ||
    row.avatar_url
  );

  return {
    id: row.id,
    name,
    avatar,
    handle,
    department,
    faculty,
    level,
    campus,
    bio,
    interests,
    isVerified: false,
    relationshipState,
    onboardingCompleted,
  };
}

/**
 * Fetch a profile by user ID from Supabase
 */
export async function fetchProfileById(
  userId: string,
  authEmail?: string | null
): Promise<(User & { onboardingCompleted: boolean }) | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.warn('Supabase fetchProfileById error:', error.message);
      return null;
    }

    if (!data) {
      return null;
    }

    return mapProfileRowToUser(data as SupabaseProfileRow, authEmail, 'self');
  } catch (err) {
    console.warn('Unexpected error fetching profile:', err);
    return null;
  }
}

export const EXCLUDED_STUDENT_IDS = [
  'b4f38505-fce6-44be-8727-8ebf04eb2ceb', // Mr Anonymous student dummy account
  '0c3240e3-ae39-461d-bd7a-4963859b9bc7', // Mr Anonymous page ID
];

export interface DiscoverProfilesPageResult {
  users: User[];
  totalCount: number;
  hasMore: boolean;
  nextOffset: number | null;
}

/**
 * Paginated student discovery (calls /api/users/discover first to include ALL eligible users beyond 50,
 * enforce blocks/restrictions, and support live search; falls back to paginated Supabase query).
 */
export async function fetchDiscoverProfilesPage(options: {
  currentUserId?: string;
  offset?: number;
  limit?: number;
  search?: string;
  excludeIds?: string[];
}): Promise<DiscoverProfilesPageResult> {
  const offset = Math.max(0, options.offset ?? 0);
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 60);
  const search = (options.search || '').trim();

  try {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    if (search) params.set('q', search);

    const headers: Record<string, string> = {};
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (token) headers.Authorization = `Bearer ${token}`;
    } catch {
      // Optional auth header
    }

    const res = await fetch(`/api/users/discover?${params.toString()}`, { headers });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data?.success && Array.isArray(data.profiles)) {
        const mapped = data.profiles.map((row: SupabaseProfileRow & { relationship_state?: User['relationshipState'] }) =>
          mapProfileRowToUser(row, null, row.relationship_state || 'none')
        );
        return {
          users: mapped,
          totalCount: Number(data.totalCount) || mapped.length,
          hasMore: Boolean(data.hasMore),
          nextOffset: typeof data.nextOffset === 'number' ? data.nextOffset : null,
        };
      }
    }
  } catch {
    // Fall back to direct Supabase paginated query below
  }

  try {
    const excludeSet = new Set([
      ...(options.excludeIds || []),
      ...EXCLUDED_STUDENT_IDS,
      ...(options.currentUserId ? [options.currentUserId] : []),
    ]);

    const scanWindow = Math.max(limit * 2, 60);
    const collected: User[] = [];
    let rawCursor = offset;
    let exhausted = false;

    for (let step = 0; step < 3 && collected.length < limit; step++) {
      let query = supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(rawCursor, rawCursor + scanWindow - 1);

      if (search) {
        const term = `%${search}%`;
        query = query.or(
          `display_name.ilike.${term},username.ilike.${term},department.ilike.${term},campus.ilike.${term},level.ilike.${term}`
        );
      }

      const { data, error } = await query;
      if (error) {
        console.warn('Supabase fetchDiscoverProfilesPage fallback error:', error.message);
        break;
      }

      const rows = (data || []) as SupabaseProfileRow[];
      rawCursor += rows.length;

      for (const row of rows) {
        if (!row?.id || excludeSet.has(row.id)) continue;
        if (row.display_name?.trim().toLowerCase() === 'mr anonymous') continue;
        collected.push(mapProfileRowToUser(row, null, 'none'));
        if (collected.length >= limit) break;
      }

      if (rows.length < scanWindow) {
        exhausted = true;
        break;
      }
    }

    const hasMore = !exhausted && collected.length >= limit;
    return {
      users: collected,
      totalCount: collected.length,
      hasMore,
      nextOffset: hasMore ? rawCursor : null,
    };
  } catch (err) {
    console.warn('Unexpected error in fetchDiscoverProfilesPage:', err);
    return { users: [], totalCount: 0, hasMore: false, nextOffset: null };
  }
}

/**
 * Fetch profiles for student discovery and people list
 */
export async function fetchAllProfiles(
  currentUserId?: string,
  limit = 50,
  excludeIds?: string[]
): Promise<User[]> {
  const page = await fetchDiscoverProfilesPage({
    currentUserId,
    offset: 0,
    limit,
    excludeIds,
  });
  return page.users;
}

/**
 * Search profiles by student name, username, or department
 */
export async function searchProfiles(
  searchTerm: string,
  currentUserId?: string
): Promise<User[]> {
  if (!searchTerm.trim()) return [];
  const page = await fetchDiscoverProfilesPage({
    currentUserId,
    offset: 0,
    limit: 30,
    search: searchTerm.trim(),
  });
  return page.users;
}

/**
 * Save / Update student profile in Supabase profiles table
 */
export async function saveProfileToSupabase(
  userId: string,
  updates: {
    fullName?: string;
    name?: string;
    username?: string;
    department?: string;
    faculty?: string;
    level?: string;
    campus?: string;
    bio?: string;
    interests?: string[];
    avatarUrl?: string;
    avatarAssetId?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const payload: Record<string, unknown> = {
      id: userId,
      updated_at: new Date().toISOString(),
    };

    const displayName = updates.fullName ?? updates.name;
    if (displayName !== undefined && displayName.trim().length > 0) {
      payload.display_name = displayName.trim();
    }
    if (updates.username !== undefined) {
      payload.username = updates.username.replace(/^@/, '').trim();
    }
    if (updates.department !== undefined) {
      payload.department = updates.department.trim();
    }
    if (updates.level !== undefined) {
      payload.level = updates.level.trim();
    }
    if (updates.campus !== undefined) {
      payload.campus = updates.campus.trim();
    }
    if (updates.bio !== undefined) {
      payload.bio = updates.bio.trim();
    }
    if (updates.avatarUrl !== undefined) {
      payload.avatar_url = updates.avatarUrl.trim();
    }
    if (updates.avatarAssetId !== undefined) {
      payload.avatar_asset_id = updates.avatarAssetId;
    }

    const { error } = await supabase.from('profiles').upsert(payload, {
      onConflict: 'id',
    });

    if (error) {
      console.warn('Supabase saveProfileToSupabase error:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Database error';
    return { success: false, error: message };
  }
}
