import { supabase } from './supabase.ts';
import type { User, FriendRequest } from '../types/index.ts';
import { mapProfileRowToUser, SupabaseProfileRow } from './profileService.ts';
import { safeStorage } from '../utils/safeStorage.ts';

export interface SupabaseFriendshipRow {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: string;
  created_at: string;
  updated_at: string;
}

/**
 * Fetch all friendships involving the current user
 */
export async function fetchUserFriendships(currentUserId: string): Promise<{
  friends: User[];
  incomingRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
}> {
  try {
    const { data: rows, error } = await supabase
      .from('friendships')
      .select('*')
      .or(`requester_id.eq.${currentUserId},addressee_id.eq.${currentUserId}`);

    if (error) {
      console.warn('Supabase fetchUserFriendships error:', error.message);
      return { friends: [], incomingRequests: [], outgoingRequests: [] };
    }

    if (!rows || rows.length === 0) {
      return { friends: [], incomingRequests: [], outgoingRequests: [] };
    }

    // Collect all related user IDs to fetch their profiles
    const otherUserIds = Array.from(
      new Set(
        rows.map((r) =>
          r.requester_id === currentUserId ? r.addressee_id : r.requester_id
        )
      )
    );

    let profilesMap: Record<string, User> = {};
    if (otherUserIds.length > 0) {
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('*')
        .in('id', otherUserIds);

      if (!pErr && profiles) {
        profilesMap = profiles.reduce<Record<string, User>>((acc, p) => {
          acc[p.id] = mapProfileRowToUser(p as SupabaseProfileRow, null, 'friends');
          return acc;
        }, {});
      }
    }

    const friends: User[] = [];
    const incomingRequests: FriendRequest[] = [];
    const outgoingRequests: FriendRequest[] = [];

    for (const row of rows) {
      const isRequester = row.requester_id === currentUserId;
      const otherId = isRequester ? row.addressee_id : row.requester_id;
      const otherUser =
        profilesMap[otherId] || {
          id: otherId,
          name: 'ABSU Student',
          avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${otherId}&backgroundColor=6d45d9&textColor=ffffff`,
          handle: '@student',
          department: 'Student',
          faculty: 'Abia State University',
          level: 'Undergraduate',
          campus: 'Uturu (Main Campus)',
          bio: '',
          interests: [],
          relationshipState: 'none' as const,
        };

      if (row.status === 'accepted') {
        friends.push({
          ...otherUser,
          relationshipState: 'friends',
        });
      } else if (row.status === 'pending') {
        if (isRequester) {
          // Sent by me
          outgoingRequests.push({
            id: row.id,
            user: { ...otherUser, relationshipState: 'request_sent' },
            createdAt: 'Pending',
            mutualCount: 0,
            type: 'sent',
          });
        } else {
          // Received by me
          incomingRequests.push({
            id: row.id,
            user: { ...otherUser, relationshipState: 'request_received' },
            createdAt: 'Pending',
            mutualCount: 0,
            type: 'received',
          });
        }
      }
    }

    return { friends, incomingRequests, outgoingRequests };
  } catch (err) {
    console.warn('Unexpected error in fetchUserFriendships:', err);
    return { friends: [], incomingRequests: [], outgoingRequests: [] };
  }
}

/**
 * Send a friend request to another student
 */
export async function sendRealFriendRequest(
  requesterId: string,
  addresseeId: string
): Promise<{ success: boolean; friendshipId?: string; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('friendships')
      .insert({
        requester_id: requesterId,
        addressee_id: addresseeId,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      console.warn('Supabase sendFriendRequest error:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true, friendshipId: data?.id };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to send request';
    return { success: false, error: msg };
  }
}

/**
 * Accept an incoming friend request
 */
export async function acceptRealFriendRequest(
  friendshipId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('friendships')
      .update({
        status: 'accepted',
        updated_at: new Date().toISOString(),
      })
      .eq('id', friendshipId);

    if (error) {
      console.warn('Supabase acceptFriendRequest error:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to accept request';
    return { success: false, error: msg };
  }
}

/**
 * Decline or cancel a friend request
 */
export async function declineOrCancelFriendRequest(
  friendshipId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('friendships')
      .delete()
      .eq('id', friendshipId);

    if (error) {
      console.warn('Supabase declineFriendRequest error:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to decline request';
    return { success: false, error: msg };
  }
}

/**
 * Remove an existing friendship
 */
export async function removeRealFriend(
  userId: string,
  friendId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('friendships')
      .delete()
      .or(
        `and(requester_id.eq.${userId},addressee_id.eq.${friendId}),and(requester_id.eq.${friendId},addressee_id.eq.${userId})`
      );

    if (error) {
      console.warn('Supabase removeFriend error:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to remove friend';
    return { success: false, error: msg };
  }
}

/**
 * Fetch real accepted friends for a profile, respecting the target user's privacy policy.
 */
export async function fetchAcceptedFriends(
  targetUserId: string,
  viewerId?: string
): Promise<{
  allowed: boolean;
  friends: User[];
  privacySetting: 'everyone' | 'friends' | 'selected';
  privacyReason?: string;
}> {
  try {
    // 1. Check target user's privacy configuration (Everyone, Friends only, Selected friends)
    let privacy: 'everyone' | 'friends' | 'selected' = 'friends';
    let allowedUserIds: string[] = [];

    if (typeof window !== 'undefined') {
      const stored = safeStorage.getItem(`absu_friend_list_privacy_${targetUserId}`);
      if (stored === 'everyone' || stored === 'friends' || stored === 'selected') {
        privacy = stored;
      }
      try {
        const allowed = safeStorage.getItem(`absu_friend_list_allowed_${targetUserId}`);
        if (allowed) allowedUserIds = JSON.parse(allowed);
      } catch {}
    }

    const isSelf = Boolean(viewerId && viewerId === targetUserId);

    // 2. Fetch accepted friendships for targetUserId
    const { data: rows, error } = await supabase
      .from('friendships')
      .select('*')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${targetUserId},addressee_id.eq.${targetUserId}`);

    if (error) {
      console.warn('fetchAcceptedFriends error:', error.message);
      return { allowed: false, friends: [], privacySetting: privacy, privacyReason: error.message };
    }

    const friendIds = (rows || []).map((r) =>
      r.requester_id === targetUserId ? r.addressee_id : r.requester_id
    );

    // 3. Evaluate privacy access
    if (!isSelf) {
      if (privacy === 'friends') {
        const isViewerFriend = viewerId ? friendIds.includes(viewerId) : false;
        if (!isViewerFriend) {
          return {
            allowed: false,
            friends: [],
            privacySetting: privacy,
            privacyReason: "This student's friend list is visible to mutual friends only.",
          };
        }
      } else if (privacy === 'selected') {
        const isViewerAllowed = viewerId ? allowedUserIds.includes(viewerId) : false;
        if (!isViewerAllowed) {
          return {
            allowed: false,
            friends: [],
            privacySetting: privacy,
            privacyReason: "This student only shares their friend list with selected friends.",
          };
        }
      }
    }

    if (friendIds.length === 0) {
      return { allowed: true, friends: [], privacySetting: privacy };
    }

    // 4. Fetch profiles of friends
    const { data: profiles, error: pErr } = await supabase
      .from('profiles')
      .select('*')
      .in('id', friendIds);

    if (pErr) {
      console.warn('fetchAcceptedFriends profiles error:', pErr.message);
      return { allowed: true, friends: [], privacySetting: privacy };
    }

    const friendsList: User[] = (profiles || []).map((p) =>
      mapProfileRowToUser(p as SupabaseProfileRow, null, 'friends')
    );

    return { allowed: true, friends: friendsList, privacySetting: privacy };
  } catch (err) {
    console.warn('Unexpected error in fetchAcceptedFriends:', err);
    return { allowed: false, friends: [], privacySetting: 'friends', privacyReason: 'Could not load friends list.' };
  }
}
