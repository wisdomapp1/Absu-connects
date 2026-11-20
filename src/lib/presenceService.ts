import { supabase } from './supabase.ts';

export interface UserPresenceRecord {
  user_id: string;
  last_seen_at: string;
  updated_at: string;
}

const TWO_MINUTES_MS = 2 * 60 * 1000;

let lastErrorTimestamp = 0;
const ERROR_COOLDOWN_MS = 60000; // 1-minute backoff if database permissions are unavailable

/**
 * Checks whether a last_seen_at timestamp indicates a user is currently online (within 2 minutes).
 */
export function isOnlineTimestamp(lastSeenAt?: string | null): boolean {
  if (!lastSeenAt) return false;
  const time = new Date(lastSeenAt).getTime();
  if (isNaN(time)) return false;
  const diff = Date.now() - time;
  return diff >= 0 && diff <= TWO_MINUTES_MS;
}

/**
 * Upsert the authenticated user's presence heartbeat into public.user_presence
 * Only executes if an authenticated user session is active.
 */
export async function updateMyPresence(userId: string): Promise<boolean> {
  if (!userId) return false;
  try {
    // Verify an active session exists so the request carries the authenticated Bearer token
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user || session.user.id !== userId) {
      // Unauthenticated or mismatched session; do not send under anon role
      return false;
    }

    const now = new Date().toISOString();
    const { error } = await supabase.from('user_presence').upsert(
      {
        user_id: userId,
        last_seen_at: now,
        updated_at: now,
      },
      { onConflict: 'user_id' }
    );

    if (error) {
      if (error.code !== '42501' && error.code !== 'PGRST301') {
        console.warn('Supabase updateMyPresence notice:', error.message);
      }
      return false;
    }
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Fetch presence records for a list of user IDs
 * Strictly requires an active authenticated session; never executes under anon role.
 */
export async function fetchPresences(
  userIds: string[]
): Promise<Record<string, string>> {
  if (!userIds || userIds.length === 0) return {};

  // Guard 1: Verify authenticated session before querying
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      // Anonymous or unauthenticated: do not hit user_presence table
      return {};
    }
  } catch {
    return {};
  }

  // Guard 2: Backoff if previous call encountered 42501 permission error to avoid infinite retry loops
  if (Date.now() - lastErrorTimestamp < ERROR_COOLDOWN_MS) {
    return {};
  }

  try {
    const { data, error } = await supabase
      .from('user_presence')
      .select('user_id, last_seen_at')
      .in('user_id', userIds);

    if (error) {
      if (error.code === '42501' || error.message?.includes('permission denied')) {
        lastErrorTimestamp = Date.now();
      }
      console.warn('Supabase fetchPresences note:', error.message);
      return {};
    }

    // Reset cooldown on success
    lastErrorTimestamp = 0;

    const presenceMap: Record<string, string> = {};
    for (const row of data || []) {
      if (row.user_id && row.last_seen_at) {
        presenceMap[row.user_id] = row.last_seen_at;
      }
    }
    return presenceMap;
  } catch (err) {
    return {};
  }
}
