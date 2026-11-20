import { supabase } from './supabase.ts';
import type {
  Community,
  CommunityMember,
  CreateCommunityInput,
  UpdateCommunityInput,
  CommunityRole,
  CommunityCategory,
} from '../types/communities.ts';
import type { Post, AttachedMediaItem } from '../types/index.ts';
import { safeStorage } from '../utils/safeStorage.ts';
import { fetchCommunityPostsFromSupabase, createRealPost, PostMediaAttachment } from './postService.ts';
import { uploadPostMediaToSupabaseStorage, deletePostMediaFilesFromStorage } from './storageService.ts';

function purgeLegacyLocalCommunityCache() {
  try {
    safeStorage.removeItem('absu_local_communities');
  } catch {
    // ignore
  }
}

async function getAuthHeaders(includeJson = true): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (includeJson) headers['Content-Type'] = 'application/json';
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.access_token) {
      headers['Authorization'] = `Bearer ${data.session.access_token}`;
    }
  } catch {
    // ignore
  }
  return headers;
}

async function parseApiJson(res: Response | null): Promise<any | null> {
  if (!res) return null;
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (!ct.includes('application/json')) return null;
  return await res.json().catch(() => null);
}

function slugifyCommunityName(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 48);
  return `${base || 'community'}-${Date.now().toString(36)}`;
}

async function recalculateCommunityMembersCountDirect(communityId: string): Promise<number> {
  const { count } = await supabase
    .from('community_members')
    .select('id', { count: 'exact', head: true })
    .eq('community_id', communityId)
    .in('status', ['active', 'approved']);

  const safeCount = count || 0;
  await supabase
    .from('communities')
    .update({ members_count: safeCount })
    .eq('id', communityId);

  return safeCount;
}

export function mapSupabaseRowToCommunity(row: any, _currentUserId?: string, membership?: any): Community {
  const rulesList = Array.isArray(row?.rules_list)
    ? row.rules_list
    : typeof row?.rules === 'string' && row.rules.trim()
    ? row.rules.split('\n').map((s: string) => s.trim()).filter(Boolean)
    : [];

  return {
    id: row?.id || '',
    name: row?.name || 'ABSU Community',
    slug: row?.slug || 'community',
    description: row?.description || '',
    category: (row?.category || 'General') as CommunityCategory,
    imageUrl: row?.image_url || '',
    coverUrl: row?.cover_image_url || '',
    location: row?.location || 'Uturu Main Campus',
    privacy: row?.privacy === 'private' ? 'private' : 'public',
    creatorId: row?.creator_id || '',
    rules: row?.rules || rulesList.join('\n'),
    rulesList,
    membersCount: Number(row?.members_count || 0),
    status: row?.status || 'active',
    isVerified: Boolean(row?.is_verified),
    createdAt: row?.created_at || new Date().toISOString(),
    updatedAt: row?.updated_at || new Date().toISOString(),
    isMember: membership ? membership.status === 'active' || membership.status === 'approved' : Boolean(row?.isMember),
    userRole: membership?.role || row?.userRole,
    membershipStatus: membership?.status || row?.membershipStatus,
  };
}

export async function fetchCommunities(params?: {
  category?: string;
  search?: string;
  tab?: 'discover' | 'my' | 'managed';
  userId?: string;
}): Promise<Community[]> {
  purgeLegacyLocalCommunityCache();
  try {
    const qs = new URLSearchParams();
    if (params?.userId) qs.set('userId', params.userId);
    if (params?.category) qs.set('category', params.category);
    if (params?.search) qs.set('search', params.search);
    if (params?.tab) qs.set('tab', params.tab);

    const headers = await getAuthHeaders(false);
    const res = await fetch(`/api/communities?${qs.toString()}`, { headers }).catch(() => null);
    const json = res?.ok ? await parseApiJson(res) : null;
    if (json?.success && Array.isArray(json.communities)) {
      return json.communities;
    }
  } catch {
    // Fallback to direct Supabase query
  }

  try {
    const { data, error } = await supabase
      .from('communities')
      .select('*')
      .neq('status', 'archived')
      .order('members_count', { ascending: false })
      .limit(100);

    if (error || !data) return [];

    const membershipsMap = new Map<string, any>();
    if (params?.userId) {
      const { data: mems } = await supabase
        .from('community_members')
        .select('community_id, role, status')
        .eq('user_id', params.userId);
      for (const m of mems || []) membershipsMap.set(m.community_id, m);
    }

    let list = data.map((row: any) => mapSupabaseRowToCommunity(row, params?.userId, membershipsMap.get(row.id)));
    if (params?.category && params.category !== 'All') {
      list = list.filter((c) => c.category === params.category);
    }
    if (params?.search) {
      const q = params.search.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q)
      );
    }
    if (params?.tab === 'my' && params?.userId) {
      list = list.filter((c) => c.isMember || c.creatorId === params.userId);
    } else if (params?.tab === 'managed' && params?.userId) {
      list = list.filter((c) => c.creatorId === params.userId || c.userRole === 'owner' || c.userRole === 'admin');
    }
    return list;
  } catch {
    return [];
  }
}

export async function fetchCommunityById(
  communityId: string,
  currentUserId?: string
): Promise<Community | null> {
  purgeLegacyLocalCommunityCache();
  if (!communityId) return null;
  try {
    const qs = currentUserId ? `?userId=${encodeURIComponent(currentUserId)}` : '';
    const headers = await getAuthHeaders(false);
    const res = await fetch(`/api/communities/${encodeURIComponent(communityId)}${qs}`, { headers }).catch(() => null);
    const json = res?.ok ? await parseApiJson(res) : null;
    if (json?.success && json.community) {
      return json.community;
    }
  } catch {
    // Fallback below
  }

  try {
    const { data, error } = await supabase.from('communities').select('*').eq('id', communityId).maybeSingle();
    if (error || !data) return null;
    let membership: any = null;
    if (currentUserId) {
      const { data: mem } = await supabase
        .from('community_members')
        .select('role, status')
        .eq('community_id', communityId)
        .eq('user_id', currentUserId)
        .maybeSingle();
      membership = mem;
    }
    const { count: pendingCount } = await supabase
      .from('community_members')
      .select('id', { count: 'exact', head: true })
      .eq('community_id', communityId)
      .eq('status', 'pending');

    return {
      ...mapSupabaseRowToCommunity(data, currentUserId, membership),
      pendingMembersCount: pendingCount || 0,
    };
  } catch {
    return null;
  }
}

export async function createCommunity(
  input: CreateCommunityInput,
  creatorId: string
): Promise<{ success: boolean; community?: Community; error?: string }> {
  try {
    const headers = await getAuthHeaders(true);
    const res = await fetch('/api/communities', {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...input, creatorId }),
    }).catch(() => null);

    const json = await parseApiJson(res);
    if (res && json) {
      if (res.ok && json.success && json.community) {
        return { success: true, community: json.community };
      }
      if (res.status !== 404 && json.error) {
        return { success: false, error: json.error };
      }
    }

    // Direct Supabase fallback
    const cleanRulesList = Array.isArray((input as any).rulesList)
      ? (input as any).rulesList.map((r: string) => String(r).trim()).filter(Boolean)
      : typeof input.rules === 'string'
      ? input.rules.split('\n').map((r: string) => r.trim()).filter(Boolean)
      : [];

    const { data: created, error } = await supabase
      .from('communities')
      .insert({
        name: String(input.name || '').trim(),
        slug: slugifyCommunityName(String(input.name || 'community')),
        description: String(input.description || '').trim(),
        category: input.category || 'General',
        image_url: input.imageUrl || null,
        cover_image_url: input.coverUrl || null,
        location: input.location || 'Uturu Main Campus',
        privacy: input.privacy === 'private' ? 'private' : 'public',
        creator_id: creatorId,
        rules: cleanRulesList.join('\n') || null,
        rules_list: cleanRulesList,
        members_count: 1,
        status: 'active',
      })
      .select('*')
      .single();

    if (error || !created) {
      return { success: false, error: error?.message || 'Failed to create community.' };
    }

    await supabase.from('community_members').upsert(
      {
        community_id: created.id,
        user_id: creatorId,
        role: 'owner',
        status: 'active',
      },
      { onConflict: 'community_id,user_id', ignoreDuplicates: true }
    );

    return {
      success: true,
      community: mapSupabaseRowToCommunity(created, creatorId, { role: 'owner', status: 'active' }),
    };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to create community.' };
  }
}

export async function updateCommunity(
  communityId: string,
  updates: UpdateCommunityInput,
  currentUserId: string
): Promise<{ success: boolean; community?: Community; error?: string }> {
  try {
    const headers = await getAuthHeaders(true);
    const res = await fetch(`/api/communities/${encodeURIComponent(communityId)}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ ...updates, currentUserId }),
    }).catch(() => null);

    const json = await parseApiJson(res);
    if (res && json) {
      if (res.ok && json.success && json.community) {
        return { success: true, community: json.community };
      }
      if (res.status !== 404 && json.error) {
        return { success: false, error: json.error };
      }
    }

    const dbUpdates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (updates.name !== undefined) dbUpdates.name = String(updates.name).trim();
    if (updates.description !== undefined) dbUpdates.description = String(updates.description).trim();
    if (updates.category !== undefined) dbUpdates.category = updates.category;
    if (updates.imageUrl !== undefined) dbUpdates.image_url = updates.imageUrl;
    if (updates.coverUrl !== undefined) dbUpdates.cover_image_url = updates.coverUrl;
    if (updates.location !== undefined) dbUpdates.location = updates.location;
    if (updates.privacy !== undefined) dbUpdates.privacy = updates.privacy;
    if (updates.rules !== undefined) dbUpdates.rules = updates.rules;
    if ((updates as any).rulesList !== undefined) dbUpdates.rules_list = (updates as any).rulesList;

    const { data, error } = await supabase
      .from('communities')
      .update(dbUpdates)
      .eq('id', communityId)
      .select('*')
      .single();

    if (error || !data) {
      return { success: false, error: error?.message || 'Failed to update community.' };
    }
    return { success: true, community: mapSupabaseRowToCommunity(data, currentUserId) };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update community.' };
  }
}

export async function deleteCommunity(
  communityId: string,
  currentUserId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const headers = await getAuthHeaders(true);
    const res = await fetch(`/api/communities/${encodeURIComponent(communityId)}`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ currentUserId }),
    }).catch(() => null);

    const json = await parseApiJson(res);
    if (res && json) {
      if (res.ok && json.success) return { success: true };
      if (res.status !== 404 && json.error) return { success: false, error: json.error };
    }

    const { error } = await supabase
      .from('communities')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('id', communityId)
      .eq('creator_id', currentUserId);

    return error ? { success: false, error: error.message } : { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to archive community.' };
  }
}

export async function joinCommunity(
  communityId: string,
  userId: string
): Promise<{ success: boolean; status?: 'active' | 'pending'; error?: string }> {
  try {
    const headers = await getAuthHeaders(true);
    const res = await fetch(`/api/communities/${encodeURIComponent(communityId)}/join`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId }),
    }).catch(() => null);

    const json = await parseApiJson(res);
    if (res && json) {
      if (res.ok && json.success) {
        return { success: true, status: json.status || 'active' };
      }
      if (res.status !== 404 && json.error) {
        return { success: false, error: json.error };
      }
    }

    const { data: comm } = await supabase
      .from('communities')
      .select('id, privacy')
      .eq('id', communityId)
      .maybeSingle();

    if (!comm) {
      return { success: false, error: 'Community not found.' };
    }

    const status: 'active' | 'pending' = comm.privacy === 'private' ? 'pending' : 'active';
    const { error } = await supabase.from('community_members').upsert(
      {
        community_id: communityId,
        user_id: userId,
        role: 'member',
        status,
      },
      { onConflict: 'community_id,user_id' }
    );

    if (error) {
      return { success: false, error: error.message };
    }

    if (status === 'active') {
      await recalculateCommunityMembersCountDirect(communityId);
    }

    return { success: true, status };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to join community.' };
  }
}

export async function leaveCommunity(
  communityId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const headers = await getAuthHeaders(true);
    const res = await fetch(`/api/communities/${encodeURIComponent(communityId)}/leave`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId }),
    }).catch(() => null);

    const json = await parseApiJson(res);
    if (res && json) {
      if (res.ok && json.success) return { success: true };
      if (res.status !== 404 && json.error) return { success: false, error: json.error };
    }

    const { error } = await supabase
      .from('community_members')
      .delete()
      .eq('community_id', communityId)
      .eq('user_id', userId);

    if (error) {
      return { success: false, error: error.message };
    }

    await recalculateCommunityMembersCountDirect(communityId);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to leave community.' };
  }
}

export async function fetchCommunityMembers(communityId: string): Promise<CommunityMember[]> {
  try {
    const headers = await getAuthHeaders(false);
    const res = await fetch(`/api/communities/${encodeURIComponent(communityId)}/members`, {
      headers,
    }).catch(() => null);
    const json = res?.ok ? await parseApiJson(res) : null;
    if (json?.success && Array.isArray(json.members)) {
      return json.members;
    }
  } catch {
    // fallback below
  }

  try {
    const { data: membersRows, error } = await supabase
      .from('community_members')
      .select('*')
      .eq('community_id', communityId)
      .order('joined_at', { ascending: true });

    if (error || !membersRows) return [];

    const userIds = Array.from(new Set(membersRows.map((m: any) => m.user_id).filter(Boolean)));
    const profileMap = new Map<string, any>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, username, avatar_url, department, level, campus')
        .in('id', userIds);
      for (const p of profiles || []) profileMap.set(p.id, p);
    }

    return membersRows.map((m: any) => {
      const p = profileMap.get(m.user_id);
      return {
        id: m.id,
        communityId: m.community_id,
        userId: m.user_id,
        name: p?.display_name || p?.username || 'ABSU Student',
        avatar:
          p?.avatar_url ||
          `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(m.user_id)}&backgroundColor=6d45d9&textColor=ffffff`,
        handle: p?.username ? `@${p.username}` : '@student',
        department: p?.department || 'ABSU Student',
        level: p?.level || 'Undergraduate',
        campus: p?.campus || 'Uturu',
        role: m.role || 'member',
        membershipStatus: m.status || 'active',
        joinedAt: m.joined_at,
      };
    });
  } catch {
    return [];
  }
}

export async function updateMemberRole(
  communityId: string,
  targetUserId: string,
  newRole: CommunityRole,
  currentUserId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const headers = await getAuthHeaders(true);
    const res = await fetch(`/api/communities/${encodeURIComponent(communityId)}/manage-request`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ targetUserId, action: 'role', role: newRole, currentUserId }),
    }).catch(() => null);

    const json = await parseApiJson(res);
    if (res && json) {
      if (res.ok && json.success) return { success: true };
      if (res.status !== 404 && json.error) return { success: false, error: json.error };
    }

    const { error } = await supabase
      .from('community_members')
      .update({ role: newRole })
      .eq('community_id', communityId)
      .eq('user_id', targetUserId);

    return error ? { success: false, error: error.message } : { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update role.' };
  }
}

export async function removeMember(
  communityId: string,
  targetUserId: string,
  currentUserId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const headers = await getAuthHeaders(true);
    const res = await fetch(`/api/communities/${encodeURIComponent(communityId)}/manage-request`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ targetUserId, action: 'remove', currentUserId }),
    }).catch(() => null);

    const json = await parseApiJson(res);
    if (res && json) {
      if (res.ok && json.success) return { success: true };
      if (res.status !== 404 && json.error) return { success: false, error: json.error };
    }

    const { error } = await supabase
      .from('community_members')
      .delete()
      .eq('community_id', communityId)
      .eq('user_id', targetUserId);

    if (error) return { success: false, error: error.message };
    await recalculateCommunityMembersCountDirect(communityId);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to remove member.' };
  }
}

export async function manageMembershipRequest(
  communityId: string,
  targetUserId: string,
  action: 'approve' | 'reject',
  currentUserId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const headers = await getAuthHeaders(true);
    const res = await fetch(`/api/communities/${encodeURIComponent(communityId)}/manage-request`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ targetUserId, action, currentUserId }),
    }).catch(() => null);

    const json = await parseApiJson(res);
    if (res && json) {
      if (res.ok && json.success) return { success: true };
      if (res.status !== 404 && json.error) return { success: false, error: json.error };
    }

    if (action === 'approve') {
      const { error } = await supabase
        .from('community_members')
        .update({ status: 'active' })
        .eq('community_id', communityId)
        .eq('user_id', targetUserId);
      if (error) return { success: false, error: error.message };
    } else {
      const { error } = await supabase
        .from('community_members')
        .delete()
        .eq('community_id', communityId)
        .eq('user_id', targetUserId);
      if (error) return { success: false, error: error.message };
    }

    await recalculateCommunityMembersCountDirect(communityId);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to manage request.' };
  }
}

export async function fetchCommunityPosts(communityId: string, currentUserId?: string): Promise<Post[]> {
  return fetchCommunityPostsFromSupabase(communityId, currentUserId);
}

export async function createCommunityPost(
  communityId: string,
  authorId: string,
  content: string,
  attachments: AttachedMediaItem[] = []
): Promise<{ success: boolean; post?: Post; error?: string }> {
  const uploadedPaths: string[] = [];
  const mediaList: PostMediaAttachment[] = [];

  try {
    for (let i = 0; i < attachments.length; i++) {
      const item = attachments[i];
      if (!item.file) continue;
      const uploadRes = await uploadPostMediaToSupabaseStorage(authorId, item.file);
      if (!uploadRes.success || !uploadRes.media) {
        if (uploadedPaths.length > 0) await deletePostMediaFilesFromStorage(uploadedPaths);
        return { success: false, error: uploadRes.error || 'Failed to upload post media.' };
      }
      uploadedPaths.push(uploadRes.media.asset_id);
      mediaList.push({
        secure_url: uploadRes.media.secure_url,
        asset_id: uploadRes.media.asset_id,
        format: uploadRes.media.format,
        bytes: uploadRes.media.bytes,
        width: uploadRes.media.width,
        height: uploadRes.media.height,
        kind: uploadRes.media.kind,
        provider: 'supabase',
        position: i,
      });
    }

    return await createRealPost({
      authorId,
      body: content,
      visibility: 'public',
      media: mediaList,
      communityId,
    });
  } catch (err: unknown) {
    if (uploadedPaths.length > 0) await deletePostMediaFilesFromStorage(uploadedPaths);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to publish community post.',
    };
  }
}

export async function deleteCommunityPost(
  _communityId: string,
  postId: string,
  currentUserId: string
): Promise<{ success: boolean; error?: string }> {
  const { deleteRealPost } = await import('./postService.ts');
  return deleteRealPost(postId, currentUserId);
}

export async function togglePinCommunityPost(
  communityId: string,
  postId: string,
  isPinned: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const headers = await getAuthHeaders(true);
    const res = await fetch(
      `/api/communities/${encodeURIComponent(communityId)}/posts/${encodeURIComponent(postId)}/pin`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ isPinned: !isPinned }),
      }
    ).catch(() => null);

    const json = await parseApiJson(res);
    if (res && json) {
      if (res.ok && json.success) return { success: true };
      if (res.status !== 404 && json.error) return { success: false, error: json.error };
    }

    const { error } = await supabase
      .from('posts')
      .update({ is_pinned: !isPinned })
      .eq('id', postId)
      .eq('community_id', communityId);

    return error ? { success: false, error: error.message } : { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to toggle pin.' };
  }
}
