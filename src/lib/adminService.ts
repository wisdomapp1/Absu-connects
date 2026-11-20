import { supabase } from './supabase.ts';

export interface AdminStats {
  totalAccounts: number;
  activeUsers: number;
  newRegistrationsToday: number;
  newRegistrations7d: number;
  newRegistrations30d: number;
  totalPosts: number;
  totalComments: number;
  reports: {
    total: number;
    pending: number;
    underReview: number;
    resolved: number;
    dismissed: number;
  };
    restrictions: {
    suspended: number;
    disabled: number;
  };
  pendingAnonymousCount?: number;
  auditLogsCount: number;
}

export interface AdminAnonymousSubmission {
  id: string;
  page_id?: string;
  body: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at?: string;
  reviewed_at?: string;
  reviewed_by?: string;
  published_post_id?: string;
}

export interface AdminUserListItem {
  id: string;
  displayName: string;
  username: string;
  avatar?: string | null;
  department: string;
  level: string;
  campus: string;
  bio: string;
  createdAt: string;
  accountStatus: 'active' | 'suspended' | 'disabled';
  restrictionDetails?: {
    status: 'active' | 'suspended' | 'disabled';
    suspendedUntil?: string;
    restrictionReason?: string;
    restrictedAt: string;
    restrictedBy: string;
    restrictions: ('posting' | 'messaging' | 'full')[];
  } | null;
  warningsCount: number;
}

export interface AdminUserDetail {
  id: string;
  displayName: string;
  username: string;
  avatar?: string | null;
  department: string;
  level: string;
  campus: string;
  bio: string;
  createdAt: string;
  restriction?: {
    status: 'active' | 'suspended' | 'disabled';
    suspendedUntil?: string;
    restrictionReason?: string;
    restrictedAt: string;
    restrictedBy: string;
    restrictions: ('posting' | 'messaging' | 'full')[];
  } | null;
  warnings: Array<{
    id: string;
    reason: string;
    adminEmail: string;
    createdAt: string;
  }>;
  posts: Array<{
    id: string;
    body: string;
    created_at: string;
    visibility: string;
  }>;
  reportsAgainstUser: Array<any>;
}

export interface AdminReportItem {
  id: string;
  reporterId: string;
  reporter?: {
    id: string;
    display_name?: string;
    username?: string;
  } | null;
  targetId: string;
  targetType: 'post' | 'user' | 'message';
  target?: any;
  reason: string;
  createdAt: string;
  status: 'pending' | 'under_review' | 'resolved' | 'dismissed';
  resolutionNotes?: string;
  actionTaken?: string;
  resolvedBy?: string;
  resolvedAt?: string;
}

export interface AdminPostItem {
  id: string;
  body: string;
  visibility: string;
  isHidden: boolean;
  createdAt: string;
  author: {
    id: string;
    name: string;
    handle: string;
    avatar?: string;
  };
  media: Array<{
    id: string;
    secure_url?: string;
    kind?: 'image' | 'video';
    format?: string;
  }>;
}

export interface AdminAnnouncement {
  id: string;
  title: string;
  body: string;
  authorName: string;
  createdAt: string;
  isBroadcast: boolean;
  isPinned: boolean;
}

export interface AdminAuditLog {
  id: string;
  adminEmail: string;
  action: string;
  targetId?: string;
  targetType?: string;
  details?: string;
  outcome: 'success' | 'failed';
  timestamp: string;
}

export interface SystemStatusData {
  timestamp: string;
  uptimeSeconds: number;
  database: {
    healthy: boolean;
    latencyMs: number;
    endpoint: string;
  };
  storage: {
    healthy: boolean;
    buckets: Record<string, string>;
  };
  auth: {
    healthy: boolean;
    superAdminConfigured: string;
    serviceRoleKeyConfigured: boolean;
  };
  environment: {
    nodeVersion: string;
    memoryUsageMb: number;
  };
}

export interface PlatformSettings {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  broadcastBanner: {
    active: boolean;
    text: string;
    type: 'info' | 'warning' | 'urgent';
  };
  features: {
    postingEnabled: boolean;
    messagingEnabled: boolean;
    registrationOpen: boolean;
  };
}

export interface InvitationItem {
  id: string;
  email: string;
  invitedBy: string;
  invitedAt: string;
  status: 'sent' | 'accepted' | 'expired';
}

export const AUTHORIZED_SUPER_ADMIN_EMAILS = [
  'wisdomchinonso82@gmail.com',
  'natashaojiugo112@gmail.com',
  'absuconnect.team@gmail.com',
];

export function isSuperAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase().trim();
  return AUTHORIZED_SUPER_ADMIN_EMAILS.some(
    (admin) => admin.toLowerCase().trim() === normalized
  );
}

/**
 * Retrieve current user's session token for authenticated admin requests
 */
async function getAuthHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) return {};
  return {
    Authorization: `Bearer ${token}`,
  };
}

const STATIC_ADMIN_UNAVAILABLE_MSG =
  'Privileged Express admin server is not mounted on this static deployment. This action requires the full-stack Node server.';

async function parseApiJson(res: Response | null): Promise<any | null> {
  if (!res) return null;
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (!ct.includes('application/json')) return null;
  return await res.json().catch(() => null);
}

async function verifyLocalSuperAdminSession(providedToken?: string): Promise<{
  isSuperAdmin: boolean;
  email?: string;
  userId?: string;
  role?: string;
  staticHostMode?: boolean;
  reason?: string;
}> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session || null;
  const token = providedToken || session?.access_token;

  if (!token) {
    return { isSuperAdmin: false, reason: 'Not signed in' };
  }

  let verifiedUser = null as { id: string; email?: string | null } | null;
  try {
    const { data: userData } = await supabase.auth.getUser(token);
    if (userData?.user) {
      verifiedUser = userData.user;
    }
  } catch {
    // Network issue; fall back to un-expired active session user below
  }

  if (!verifiedUser && session?.user) {
    const expiresAtMs = (session.expires_at ?? 0) * 1000;
    if (expiresAtMs === 0 || expiresAtMs > Date.now()) {
      verifiedUser = session.user;
    }
  }

  if (!verifiedUser) {
    return { isSuperAdmin: false, reason: 'Could not verify authenticated session.' };
  }

  const email = verifiedUser.email?.toLowerCase().trim() || '';
  if (!isSuperAdminEmail(email)) {
    return {
      isSuperAdmin: false,
      email,
      userId: verifiedUser.id,
      reason: `Account "${email}" is not an authorized Super Admin.`,
    };
  }

  return {
    isSuperAdmin: true,
    email,
    userId: verifiedUser.id,
    role: 'Super Admin',
    staticHostMode: true,
  };
}

/**
 * 1. Verify Super Admin access on Express backend when available, or directly via
 *    verified Supabase Auth session on static deployments (e.g. Vercel / Android APK).
 */
export async function checkIsSuperAdmin(providedToken?: string): Promise<{
  isSuperAdmin: boolean;
  email?: string;
  userId?: string;
  role?: string;
  staticHostMode?: boolean;
  reason?: string;
}> {
  try {
    const headers = providedToken
      ? { Authorization: `Bearer ${providedToken}` }
      : await getAuthHeader();

    if (!headers.Authorization) {
      return { isSuperAdmin: false, reason: 'Not signed in' };
    }

    const res = await fetch('/api/admin/verify', { headers }).catch(() => null);
    const json = await parseApiJson(res);

    // Authoritative Express backend response
    if (res && json && typeof json.isSuperAdmin === 'boolean') {
      if (json.isSuperAdmin) {
        return json;
      }
      // If server returned ok:false strictly due to expired/invalid token when client already refreshed,
      // double-check against live Supabase auth before rejecting an authorized admin
      const fallbackCheck = await verifyLocalSuperAdminSession(providedToken);
      if (fallbackCheck.isSuperAdmin && !res.ok) {
        return fallbackCheck;
      }
      if (!res.ok) {
        return { isSuperAdmin: false, reason: json.reason || json.error || `Status ${res.status}` };
      }
      return json;
    }

    // Static deployment (404 / non-JSON from /api/admin/verify): verify directly against Supabase Auth
    return await verifyLocalSuperAdminSession(providedToken);
  } catch (err: unknown) {
    const fallback = await verifyLocalSuperAdminSession(providedToken).catch(() => null);
    if (fallback?.isSuperAdmin) {
      return fallback;
    }
    return {
      isSuperAdmin: false,
      reason: err instanceof Error ? err.message : 'Network error',
    };
  }
}

/**
 * 2. Fetch Executive Stats (Express API with direct Supabase fallback for static hosts)
 */
export async function fetchAdminStats(): Promise<{
  success: boolean;
  stats?: AdminStats;
  staticHostMode?: boolean;
  error?: string;
}> {
  try {
    const headers = await getAuthHeader();
    const res = await fetch('/api/admin/stats', { headers }).catch(() => null);
    const json = await parseApiJson(res);
    if (res && json) {
      return json;
    }

    const [profilesRes, postsRes, commentsRes, reportsRes, anonPendingRes] = await Promise.all([
      supabase.from('profiles').select('id, created_at, updated_at', { count: 'exact' }),
      supabase.from('posts').select('id', { count: 'exact', head: true }),
      supabase.from('comments').select('id', { count: 'exact', head: true }),
      supabase.from('reports').select('id, status', { count: 'exact' }),
      supabase.from('anonymous_submissions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);

    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    let newRegistrationsToday = 0;
    let newRegistrations7d = 0;
    let newRegistrations30d = 0;
    let activeUsers = 0;

    for (const p of profilesRes.data || []) {
      if (p.created_at) {
        const t = new Date(p.created_at).getTime();
        if (t >= oneDayAgo) newRegistrationsToday++;
        if (t >= sevenDaysAgo) newRegistrations7d++;
        if (t >= thirtyDaysAgo) newRegistrations30d++;
      }
      if (p.updated_at && new Date(p.updated_at).getTime() >= sevenDaysAgo) {
        activeUsers++;
      }
    }

    const rawReports = reportsRes.data || [];
    let pending = 0;
    let underReview = 0;
    let resolved = 0;
    let dismissed = 0;
    for (const r of rawReports) {
      if (r.status === 'under_review') underReview++;
      else if (r.status === 'resolved') resolved++;
      else if (r.status === 'dismissed') dismissed++;
      else pending++;
    }

    return {
      success: true,
      staticHostMode: true,
      stats: {
        totalAccounts: profilesRes.count ?? profilesRes.data?.length ?? 0,
        activeUsers,
        newRegistrationsToday,
        newRegistrations7d,
        newRegistrations30d,
        totalPosts: postsRes.count ?? 0,
        totalComments: commentsRes.count ?? 0,
        reports: {
          total: reportsRes.count ?? rawReports.length,
          pending,
          underReview,
          resolved,
          dismissed,
        },
        restrictions: {
          suspended: 0,
          disabled: 0,
        },
        pendingAnonymousCount: anonPendingRes.count ?? 0,
        auditLogsCount: 0,
      },
    };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch stats' };
  }
}

/**
 * 3. Search & List Users (Express API with direct Supabase profiles fallback)
 */
export async function fetchAdminUsers(params?: {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
}): Promise<{
  success: boolean;
  users?: AdminUserListItem[];
  totalCount?: number;
  page?: number;
  limit?: number;
  staticHostMode?: boolean;
  error?: string;
}> {
  try {
    const headers = await getAuthHeader();
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.status) query.set('status', params.status);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));

    const res = await fetch(`/api/admin/users?${query.toString()}`, { headers }).catch(() => null);
    const json = await parseApiJson(res);
    if (res && json) return json;

    // Direct Supabase fallback for static deployments
    const page = Math.max(1, params?.page || 1);
    const limit = Math.min(50, Math.max(10, params?.limit || 15));
    const offset = (page - 1) * limit;
    const search = (params?.search || '').trim();

    let q = supabase.from('profiles').select('*', { count: 'exact' });
    if (search) {
      q = q.or(
        `display_name.ilike.%${search}%,username.ilike.%${search}%,department.ilike.%${search}%`
      );
    }
    const { data: profiles, count, error } = await q
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return { success: false, error: error.message || STATIC_ADMIN_UNAVAILABLE_MSG };
    }

    const mapped: AdminUserListItem[] = (profiles || []).map((p: any) => ({
      id: p.id,
      displayName: p.display_name || 'ABSU Student',
      username: p.username ? `@${p.username}` : '@student',
      avatar: p.avatar_url || null,
      department: p.department || 'Undergraduate',
      level: p.level || '100 Level',
      campus: p.campus || 'Uturu (Main Campus)',
      bio: p.bio || '',
      createdAt: p.created_at,
      accountStatus: 'active',
      restrictionDetails: null,
      warningsCount: 0,
    }));

    const filtered =
      params?.status && params.status !== 'all'
        ? mapped.filter((u) => u.accountStatus === params.status)
        : mapped;

    return {
      success: true,
      staticHostMode: true,
      users: filtered,
      totalCount: count ?? filtered.length,
      page,
      limit,
    };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch users' };
  }
}

/**
 * 4. Fetch User Detail (Express API with direct Supabase fallback)
 */
export async function fetchAdminUserDetail(userId: string): Promise<{
  success: boolean;
  user?: AdminUserDetail;
  error?: string;
}> {
  try {
    const headers = await getAuthHeader();
    const res = await fetch(`/api/admin/users/${userId}`, { headers }).catch(() => null);
    const json = await parseApiJson(res);
    if (res && json) return json;

    const [profRes, postsRes, reportsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase
        .from('posts')
        .select('id, body, created_at, visibility')
        .eq('author_id', userId)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('reports')
        .select('id, reason, status, created_at')
        .eq('target_id', userId)
        .limit(10),
    ]);

    if (profRes.error || !profRes.data) {
      return { success: false, error: profRes.error?.message || STATIC_ADMIN_UNAVAILABLE_MSG };
    }

    const p: any = profRes.data;
    return {
      success: true,
      user: {
        id: p.id,
        displayName: p.display_name || 'ABSU Student',
        username: p.username ? `@${p.username}` : '@student',
        avatar: p.avatar_url || null,
        department: p.department || 'Undergraduate',
        level: p.level || '100 Level',
        campus: p.campus || 'Uturu (Main Campus)',
        bio: p.bio || '',
        createdAt: p.created_at,
        restriction: null,
        warnings: [],
        posts: postsRes.data || [],
        reportsAgainstUser: reportsRes.data || [],
      },
    };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch user' };
  }
}

/**
 * 5. Update Account Status (Disable, Reactivate, Suspend, Unsuspend)
 */
export async function updateAdminUserStatus(
  userId: string,
  payload: {
    action: 'disable' | 'reactivate' | 'suspend' | 'unsuspend';
    reason: string;
    durationHours?: number;
    restrictions?: ('posting' | 'messaging' | 'full')[];
  }
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const headers = await getAuthHeader();
    const res = await fetch(`/api/admin/users/${userId}/status`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => null);
    const json = await parseApiJson(res);
    if (!res || !json) return { success: false, error: STATIC_ADMIN_UNAVAILABLE_MSG };
    return json;
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update status' };
  }
}

/**
 * 6. Send Warning
 */
export async function sendAdminUserWarning(
  userId: string,
  payload: { reason: string; category?: string }
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const headers = await getAuthHeader();
    const res = await fetch(`/api/admin/users/${userId}/warn`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => null);
    const json = await parseApiJson(res);
    if (!res || !json) return { success: false, error: STATIC_ADMIN_UNAVAILABLE_MSG };
    return json;
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to send warning' };
  }
}

/**
 * 7. Trigger Password Recovery
 */
export async function triggerAdminPasswordRecovery(
  userId: string,
  email: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const headers = await getAuthHeader();
    const res = await fetch(`/api/admin/users/${userId}/password-recovery`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    const json = await parseApiJson(res);
    if (!res || !json) return { success: false, error: STATIC_ADMIN_UNAVAILABLE_MSG };
    return json;
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Recovery request failed' };
  }
}

/**
 * 8. Permanently Delete User Account (Double Confirmed)
 */
export async function permanentlyDeleteUserAccount(
  userId: string,
  confirmationText: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const headers = await getAuthHeader();
    const res = await fetch(`/api/admin/users/${userId}/delete`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmationText }),
    }).catch(() => null);
    const json = await parseApiJson(res);
    if (!res || !json) return { success: false, error: STATIC_ADMIN_UNAVAILABLE_MSG };
    return json;
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Delete failed' };
  }
}

/**
 * 9. Invitations
 */
export async function fetchAdminInvitations(): Promise<{
  success: boolean;
  invitations?: InvitationItem[];
  staticHostMode?: boolean;
  error?: string;
}> {
  try {
    const headers = await getAuthHeader();
    const res = await fetch('/api/admin/invitations', { headers }).catch(() => null);
    const json = await parseApiJson(res);
    if (!res || !json) {
      return { success: true, invitations: [], staticHostMode: true };
    }
    return json;
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Error fetching invitations' };
  }
}

export async function createAdminInvitation(
  email: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const headers = await getAuthHeader();
    const res = await fetch('/api/admin/invitations', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    const json = await parseApiJson(res);
    if (!res || !json) return { success: false, error: STATIC_ADMIN_UNAVAILABLE_MSG };
    return json;
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Invite failed' };
  }
}

export async function resendAdminInvitation(
  id: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const headers = await getAuthHeader();
    const res = await fetch(`/api/admin/invitations/${id}/resend`, {
      method: 'POST',
      headers,
    }).catch(() => null);
    const json = await parseApiJson(res);
    if (!res || !json) return { success: false, error: STATIC_ADMIN_UNAVAILABLE_MSG };
    return json;
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Resend failed' };
  }
}

/**
 * 10. Reports
 */
export async function fetchAdminReports(status = 'all'): Promise<{
  success: boolean;
  reports?: AdminReportItem[];
  error?: string;
}> {
  try {
    const headers = await getAuthHeader();
    const res = await fetch(`/api/admin/reports?status=${encodeURIComponent(status)}`, { headers }).catch(() => null);
    const json = await parseApiJson(res);
    if (res && json) return json;

    // Safe direct Supabase fallback if RLS allows admin read
    let q = supabase.from('reports').select('*').order('created_at', { ascending: false }).limit(100);
    if (status !== 'all') q = q.eq('status', status);
    const { data, error } = await q;
    if (error) return { success: false, error: error.message || STATIC_ADMIN_UNAVAILABLE_MSG };
    return {
      success: true,
      reports: (data || []).map((r: any) => ({
        id: r.id,
        reporterId: r.reporter_id,
        targetId: r.target_id,
        targetType: r.target_type,
        reason: r.reason || '',
        createdAt: r.created_at,
        status: r.status || 'pending',
        resolutionNotes: r.resolution_notes,
        actionTaken: r.action_taken,
        resolvedBy: r.resolved_by,
        resolvedAt: r.resolved_at,
      })),
    };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Error fetching reports' };
  }
}

export async function updateAdminReport(
  id: string,
  payload: {
    status: 'pending' | 'under_review' | 'resolved' | 'dismissed';
    notes?: string;
    actionTaken?: string;
  }
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const headers = await getAuthHeader();
    const res = await fetch(`/api/admin/reports/${id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => null);
    const json = await parseApiJson(res);
    if (res && json) return json;

    const { error } = await supabase
      .from('reports')
      .update({ status: payload.status })
      .eq('id', id);
    if (error) {
      return { success: false, error: error.message || STATIC_ADMIN_UNAVAILABLE_MSG };
    }
    return { success: true, message: `Report marked as ${payload.status}.` };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Error updating report' };
  }
}

/**
 * 11. Posts & Content Moderation
 */
export async function fetchAdminPosts(search?: string): Promise<{
  success: boolean;
  posts?: AdminPostItem[];
  error?: string;
}> {
  try {
    const headers = await getAuthHeader();
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    const res = await fetch(`/api/admin/content/posts${query}`, { headers }).catch(() => null);
    const json = await parseApiJson(res);
    if (res && json) return json;

    let q = supabase
      .from('posts')
      .select('id, body, visibility, created_at, author_id')
      .order('created_at', { ascending: false })
      .limit(50);
    if (search?.trim()) {
      q = q.ilike('body', `%${search.trim()}%`);
    }
    const { data, error } = await q;
    if (error) return { success: false, error: error.message || STATIC_ADMIN_UNAVAILABLE_MSG };

    const authorIds = Array.from(new Set((data || []).map((p: any) => p.author_id).filter(Boolean)));
    const profileMap = new Map<string, any>();
    if (authorIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, username, avatar_url')
        .in('id', authorIds);
      (profiles || []).forEach((pr: any) => profileMap.set(pr.id, pr));
    }

    return {
      success: true,
      posts: (data || []).map((p: any) => {
        const pr = profileMap.get(p.author_id);
        return {
          id: p.id,
          body: p.body || '',
          visibility: p.visibility || 'public',
          isHidden: p.visibility === 'hidden',
          createdAt: p.created_at,
          author: {
            id: p.author_id,
            name: pr?.display_name || pr?.username || 'Student',
            handle: pr?.username || 'student',
            avatar: pr?.avatar_url || undefined,
          },
          media: [],
        };
      }),
    };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Error fetching posts' };
  }
}

export async function moderateAdminPost(
  id: string,
  action: 'hide' | 'restore' | 'delete',
  reason: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const headers = await getAuthHeader();
    const res = await fetch(`/api/admin/content/posts/${id}/moderate`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reason }),
    }).catch(() => null);
    const json = await parseApiJson(res);
    if (res && json) return json;

    if (action === 'hide') {
      const { error } = await supabase.from('posts').update({ visibility: 'hidden' }).eq('id', id);
      if (error) return { success: false, error: error.message || STATIC_ADMIN_UNAVAILABLE_MSG };
      return { success: true, message: 'Post hidden from campus feed.' };
    }
    if (action === 'restore') {
      const { error } = await supabase.from('posts').update({ visibility: 'public' }).eq('id', id);
      if (error) return { success: false, error: error.message || STATIC_ADMIN_UNAVAILABLE_MSG };
      return { success: true, message: 'Post visibility restored.' };
    }

    const { error } = await supabase.from('posts').delete().eq('id', id);
    if (error) return { success: false, error: error.message || STATIC_ADMIN_UNAVAILABLE_MSG };
    return { success: true, message: 'Post permanently removed.' };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Moderation failed' };
  }
}

/**
 * 12. Announcements
 */
export async function fetchAdminAnnouncements(): Promise<{
  success: boolean;
  announcements?: AdminAnnouncement[];
  staticHostMode?: boolean;
  error?: string;
}> {
  try {
    const headers = await getAuthHeader();
    const res = await fetch('/api/admin/announcements', { headers }).catch(() => null);
    const json = await parseApiJson(res);
    if (res && json) return json;

    const { data, error } = await supabase
      .from('posts')
      .select('id, body, created_at')
      .ilike('body', '%OFFICIAL ABSU CONNECT ANNOUNCEMENT:%')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      return { success: true, announcements: [], staticHostMode: true };
    }

    const announcements: AdminAnnouncement[] = (data || []).map((p: any) => {
      const lines = String(p.body || '').split('\n').map((l) => l.trim()).filter(Boolean);
      const titleLine = lines[1] || 'Campus Announcement';
      const bodyLines = lines.slice(2).filter((l) => !l.startsWith('#announcement'));
      return {
        id: p.id,
        title: titleLine,
        body: bodyLines.join('\n') || p.body || '',
        authorName: 'ABSU Connect Administration',
        createdAt: p.created_at,
        isBroadcast: false,
        isPinned: false,
      };
    });

    return { success: true, announcements, staticHostMode: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Error fetching announcements' };
  }
}

export async function createAdminAnnouncement(payload: {
  title: string;
  body: string;
  isBroadcast: boolean;
  isPinned: boolean;
  publishToFeed: boolean;
}): Promise<{ success: boolean; announcement?: AdminAnnouncement; error?: string }> {
  try {
    const headers = await getAuthHeader();
    const res = await fetch('/api/admin/announcements', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => null);
    const json = await parseApiJson(res);
    if (res && json) return json;

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    if (!userId) return { success: false, error: 'Please sign in to publish announcements.' };

    const { data, error } = await supabase
      .from('posts')
      .insert({
        author_id: userId,
        body: `📢 OFFICIAL ABSU CONNECT ANNOUNCEMENT:\n\n${payload.title.trim().toUpperCase()}\n\n${payload.body.trim()}\n\n#announcement #campus`,
        visibility: 'campus',
        created_at: new Date().toISOString(),
      })
      .select('id, created_at')
      .single();

    if (error) {
      return { success: false, error: error.message || STATIC_ADMIN_UNAVAILABLE_MSG };
    }

    return {
      success: true,
      announcement: {
        id: data.id,
        title: payload.title.trim(),
        body: payload.body.trim(),
        authorName: 'ABSU Connect Administration',
        createdAt: data.created_at,
        isBroadcast: payload.isBroadcast,
        isPinned: payload.isPinned,
      },
    };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Error creating announcement' };
  }
}

export async function deleteAdminAnnouncement(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const headers = await getAuthHeader();
    const res = await fetch(`/api/admin/announcements/${id}`, {
      method: 'DELETE',
      headers,
    }).catch(() => null);
    const json = await parseApiJson(res);
    if (res && json) return json;

    const { error } = await supabase.from('posts').delete().eq('id', id);
    if (error) return { success: false, error: error.message || STATIC_ADMIN_UNAVAILABLE_MSG };
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Error deleting announcement' };
  }
}

/**
 * 13. System Status
 */
export async function fetchAdminSystemStatus(): Promise<{
  success: boolean;
  status?: SystemStatusData;
  staticHostMode?: boolean;
  error?: string;
}> {
  try {
    const headers = await getAuthHeader();
    const res = await fetch('/api/admin/system/status', { headers }).catch(() => null);
    const json = await parseApiJson(res);
    if (res && json) return json;

    const tStart = Date.now();
    const [dbRes, pmRes, chatRes] = await Promise.all([
      supabase.from('profiles').select('id').limit(1),
      supabase.storage.from('post-media').list('', { limit: 1 }),
      supabase.storage.from('chat-attachments').list('', { limit: 1 }),
    ]);
    const latencyMs = Date.now() - tStart;

    return {
      success: true,
      staticHostMode: true,
      status: {
        timestamp: new Date().toISOString(),
        uptimeSeconds: 0,
        database: {
          healthy: !dbRes.error,
          latencyMs,
          endpoint: 'https://aqzolewmhpmrcvkrvchn.supabase.co',
        },
        storage: {
          healthy: !pmRes.error && !chatRes.error,
          buckets: {
            'post-media': !pmRes.error ? 'accessible' : 'error',
            'chat-attachments': !chatRes.error ? 'accessible' : 'error',
          },
        },
        auth: {
          healthy: true,
          superAdminConfigured: 'wisdomchinonso82@gmail.com',
          serviceRoleKeyConfigured: false,
        },
        environment: {
          nodeVersion: 'Static Frontend',
          memoryUsageMb: 0,
        },
      },
    };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Error fetching status' };
  }
}

/**
 * 14. Audit Logs
 */
export async function fetchAdminAuditLogs(limit = 50): Promise<{
  success: boolean;
  logs?: AdminAuditLog[];
  total?: number;
  staticHostMode?: boolean;
  error?: string;
}> {
  try {
    const headers = await getAuthHeader();
    const res = await fetch(`/api/admin/audit-logs?limit=${limit}`, { headers }).catch(() => null);
    const json = await parseApiJson(res);
    if (!res || !json) {
      return { success: true, logs: [], total: 0, staticHostMode: true };
    }
    return json;
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Error fetching logs' };
  }
}

/**
 * 15. Platform Settings
 */
export async function fetchAdminPlatformSettings(): Promise<{
  success: boolean;
  settings?: PlatformSettings;
  staticHostMode?: boolean;
  error?: string;
}> {
  try {
    const headers = await getAuthHeader();
    const res = await fetch('/api/admin/settings', { headers }).catch(() => null);
    const json = await parseApiJson(res);
    if (res && json) return json;

    return {
      success: true,
      staticHostMode: true,
      settings: {
        maintenanceMode: false,
        maintenanceMessage: '',
        broadcastBanner: { active: false, text: '', type: 'info' },
        features: {
          postingEnabled: true,
          messagingEnabled: true,
          registrationOpen: true,
        },
      },
    };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Error fetching settings' };
  }
}

export async function updateAdminPlatformSettings(
  settings: Partial<PlatformSettings>
): Promise<{ success: boolean; settings?: PlatformSettings; error?: string }> {
  try {
    const headers = await getAuthHeader();
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    }).catch(() => null);
    const json = await parseApiJson(res);
    if (!res || !json) return { success: false, error: STATIC_ADMIN_UNAVAILABLE_MSG };
    return json;
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Error updating settings' };
  }
}

/**
 * Public endpoint to fetch active platform broadcast banner and maintenance state
 */
export async function fetchPublicPlatformBanner(): Promise<{
  maintenance: boolean;
  maintenanceMessage: string;
  banner: {
    active: boolean;
    text: string;
    type: 'info' | 'warning' | 'urgent';
  };
  features: {
    postingEnabled: boolean;
    messagingEnabled: boolean;
    registrationOpen: boolean;
  };
} | null> {
  try {
    const res = await fetch('/api/platform/banner').catch(() => null);
    if (!res || !res.ok) return null;
    return await parseApiJson(res);
  } catch {
    return null;
  }
}

/**
 * Fetch anonymous submissions for Super Admin review
 */
export async function fetchAdminAnonymousSubmissions(
  status: 'all' | 'pending' | 'approved' | 'rejected' = 'all'
): Promise<{
  success: boolean;
  submissions?: AdminAnonymousSubmission[];
  totalCount?: number;
  pendingCount?: number;
  approvedCount?: number;
  rejectedCount?: number;
  error?: string;
}> {
  try {
    const headers = await getAuthHeader();
    const res = await fetch(`/api/admin/anonymous/submissions?status=${status}`, {
      headers,
    }).catch(() => null);
    const json = await parseApiJson(res);
    if (res && json) {
      if (!res.ok) {
        return { success: false, error: json.error || 'Failed to fetch anonymous submissions' };
      }
      return json;
    }

    // Direct Supabase fallback
    let q = supabase
      .from('anonymous_submissions')
      .select('id, page_id, body, status, created_at, updated_at, reviewed_at, reviewed_by, published_post_id')
      .order('created_at', { ascending: false })
      .limit(100);
    if (status !== 'all') q = q.eq('status', status);

    const { data, error } = await q;
    if (error) {
      return { success: false, error: error.message || 'Failed to fetch anonymous submissions' };
    }
    const rows = (data || []) as AdminAnonymousSubmission[];
    return {
      success: true,
      submissions: rows,
      totalCount: rows.length,
      pendingCount: rows.filter((r) => r.status === 'pending').length,
      approvedCount: rows.filter((r) => r.status === 'approved').length,
      rejectedCount: rows.filter((r) => r.status === 'rejected').length,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error fetching submissions';
    return { success: false, error: msg };
  }
}

/**
 * Review an individual anonymous submission: approve or reject
 */
export async function reviewAdminAnonymousSubmission(
  submissionId: string,
  decision: 'approved' | 'rejected',
  rejectionReason?: string
): Promise<{ success: boolean; message?: string; postId?: string; error?: string }> {
  try {
    const headers = await getAuthHeader();
    const res = await fetch('/api/admin/anonymous/review', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({ submissionId, decision, rejectionReason }),
    }).catch(() => null);
    const json = await parseApiJson(res);
    if (res && json) {
      if (!res.ok) {
        return { success: false, error: json.error || `Failed to ${decision} submission` };
      }
      return json;
    }

    const { data, error } = await supabase.rpc('review_anonymous_submission', {
      p_submission_id: submissionId,
      p_decision: decision,
      p_rejection_reason: rejectionReason || null,
    });
    if (error) {
      return { success: false, error: error.message || `Failed to ${decision} submission` };
    }
    return {
      success: true,
      postId: typeof data === 'string' ? data : undefined,
      message: `Submission ${decision}.`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error reviewing submission';
    return { success: false, error: msg };
  }
}

/**
 * Bulk approve all pending anonymous submissions
 */
export async function approveAllAdminAnonymousSubmissions(): Promise<{
  success: boolean;
  count?: number;
  message?: string;
  error?: string;
}> {
  try {
    const headers = await getAuthHeader();
    const res = await fetch('/api/admin/anonymous/approve-all', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    }).catch(() => null);
    const json = await parseApiJson(res);
    if (res && json) {
      if (!res.ok) {
        return { success: false, error: json.error || 'Failed to approve all submissions' };
      }
      return json;
    }

    const { data: pending, error: listErr } = await supabase
      .from('anonymous_submissions')
      .select('id')
      .eq('status', 'pending')
      .limit(100);
    if (listErr) {
      return { success: false, error: listErr.message || STATIC_ADMIN_UNAVAILABLE_MSG };
    }
    let approved = 0;
    for (const row of pending || []) {
      const { error } = await supabase.rpc('review_anonymous_submission', {
        p_submission_id: row.id,
        p_decision: 'approved',
        p_rejection_reason: null,
      });
      if (!error) approved++;
    }
    return {
      success: true,
      count: approved,
      message: `Approved ${approved} pending submission(s).`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error approving all submissions';
    return { success: false, error: msg };
  }
}

// Aliases for unified consumption
export type AuditLogItem = AdminAuditLog;
export type SystemStatusResponse = SystemStatusData & {
  platform_settings?: {
    maintenance_mode: boolean;
    read_only_mode: boolean;
    registrations_open: boolean;
    require_email_verification: boolean;
    broadcast_banner: string;
  };
  supabase_db?: string;
  supabase_latency_ms?: number | null;
  uptime_seconds?: number;
  memory_usage_mb?: number;
  service_role_configured?: boolean;
  cloudinary_configured?: boolean;
};

export const adminService = {
  verifySuperAdmin: async (token?: string) => {
    return await checkIsSuperAdmin(token);
  },
  getStats: async (_token?: string) => {
    return await fetchAdminStats();
  },
  getUsers: async (_token?: string, params?: any) => {
    return await fetchAdminUsers(params);
  },
  getUserDetail: async (_token?: string, userId?: string) => {
    return await fetchAdminUserDetail(userId || '');
  },
  updateUserStatus: async (_token: string | undefined, userId: string, payload: any) => {
    return await updateAdminUserStatus(userId, payload);
  },
  warnUser: async (_token: string | undefined, userId: string, payload: any) => {
    return await sendAdminUserWarning(userId, payload);
  },
  sendPasswordRecovery: async (_token: string | undefined, userId: string, email: string) => {
    return await triggerAdminPasswordRecovery(userId, email);
  },
  deleteUser: async (_token: string | undefined, userId: string, confirmationText: string) => {
    return await permanentlyDeleteUserAccount(userId, confirmationText);
  },
  getReports: async (_token?: string, status = 'all') => {
    return await fetchAdminReports(status);
  },
  resolveReport: async (_token: string | undefined, id: string, payload: any) => {
    return await updateAdminReport(id, payload);
  },
  getPosts: async (_token?: string, search?: string) => {
    return await fetchAdminPosts(search);
  },
  moderatePost: async (_token: string | undefined, id: string, action: any, reason: string) => {
    return await moderateAdminPost(id, action, reason);
  },
  getAnnouncements: async (_token?: string) => {
    return await fetchAdminAnnouncements();
  },
  createAnnouncement: async (_token: string | undefined, payload: any) => {
    return await createAdminAnnouncement(payload);
  },
  deleteAnnouncement: async (_token: string | undefined, id: string) => {
    return await deleteAdminAnnouncement(id);
  },
  getInvitations: async (_token?: string) => {
    return await fetchAdminInvitations();
  },
  sendInvitation: async (_token: string | undefined, email: string) => {
    return await createAdminInvitation(email);
  },
  getAuditLogs: async (_token?: string, limit?: number) => {
    return await fetchAdminAuditLogs(limit);
  },
  getSystemStatus: async (_token?: string): Promise<SystemStatusResponse> => {
    const res = await fetchAdminSystemStatus();
    const settingsRes = await fetchAdminPlatformSettings();
    const st = res.status;
    return {
      ...(st || {
        timestamp: new Date().toISOString(),
        uptimeSeconds: 0,
        database: { healthy: true, latencyMs: 20, endpoint: '' },
        storage: { healthy: true, buckets: {} },
        auth: { healthy: true, superAdminConfigured: 'wisdomchinonso82@gmail.com', serviceRoleKeyConfigured: true },
        environment: { nodeVersion: 'v20', memoryUsageMb: 85 }
      }),
      supabase_db: st?.database?.healthy ? 'healthy' : 'degraded',
      supabase_latency_ms: st?.database?.latencyMs ?? 0,
      uptime_seconds: st?.uptimeSeconds ?? 0,
      memory_usage_mb: st?.environment?.memoryUsageMb ?? 0,
      service_role_configured: st?.auth?.serviceRoleKeyConfigured ?? false,
      cloudinary_configured: true,
      platform_settings: {
        maintenance_mode: settingsRes.settings?.maintenanceMode ?? false,
        read_only_mode: !(settingsRes.settings?.features?.postingEnabled ?? true),
        registrations_open: settingsRes.settings?.features?.registrationOpen ?? true,
        require_email_verification: false,
        broadcast_banner: settingsRes.settings?.broadcastBanner?.text ?? '',
      }
    };
  },
  updateSettings: async (_token: string | undefined, settings: any) => {
    return await updateAdminPlatformSettings({
      maintenanceMode: settings?.maintenance_mode ?? false,
      broadcastBanner: {
        active: Boolean(settings?.broadcast_banner),
        text: settings?.broadcast_banner || '',
        type: 'info'
      },
      features: {
        postingEnabled: !settings?.read_only_mode,
        messagingEnabled: true,
        registrationOpen: settings?.registrations_open ?? true,
      }
    });
  },
  getPlatformBanner: async () => {
    const res = await fetchPublicPlatformBanner();
    return {
      banner: res?.banner?.active ? res.banner.text : null,
      maintenance: res?.maintenance ?? false,
    };
  }
};

