import { supabase } from './supabase.ts';

export async function submitRealReport(params: {
  reporterId: string;
  targetId: string;
  targetType: 'post' | 'user' | 'message';
  reason: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('reports').insert({
      reporter_id: params.reporterId,
      target_id: params.targetId,
      target_type: params.targetType,
      reason: params.reason,
      status: 'pending',
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.warn('submitRealReport error:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to submit report';
    return { success: false, error: msg };
  }
}

export async function blockRealUser(params: {
  blockerId: string;
  blockedId: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('user_blocks').insert({
      blocker_id: params.blockerId,
      blocked_id: params.blockedId,
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.warn('blockRealUser error:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to block user';
    return { success: false, error: msg };
  }
}

export async function unblockRealUser(params: {
  blockerId: string;
  blockedId: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('user_blocks')
      .delete()
      .eq('blocker_id', params.blockerId)
      .eq('blocked_id', params.blockedId);

    if (error) {
      console.warn('unblockRealUser error:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to unblock user';
    return { success: false, error: msg };
  }
}

export async function fetchUserBlocks(userId: string): Promise<{
  blockedByMe: string[];
  blockedMe: string[];
  allBlockedIds: string[];
}> {
  if (!userId) return { blockedByMe: [], blockedMe: [], allBlockedIds: [] };
  try {
    const { data, error } = await supabase
      .from('user_blocks')
      .select('blocker_id, blocked_id')
      .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);

    if (error || !data) {
      return { blockedByMe: [], blockedMe: [], allBlockedIds: [] };
    }

    const blockedByMe: string[] = [];
    const blockedMe: string[] = [];
    const allSet = new Set<string>();

    for (const row of data) {
      if (row.blocker_id === userId) {
        blockedByMe.push(row.blocked_id);
        allSet.add(row.blocked_id);
      } else {
        blockedMe.push(row.blocker_id);
        allSet.add(row.blocker_id);
      }
    }

    return {
      blockedByMe,
      blockedMe,
      allBlockedIds: Array.from(allSet),
    };
  } catch (err) {
    console.warn('fetchUserBlocks error:', err);
    return { blockedByMe: [], blockedMe: [], allBlockedIds: [] };
  }
}
