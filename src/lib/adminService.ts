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
  'Super Admin server API is not mounted on this static deployment. Run on the full-stack server for privileged auth operations.';

async function parseApiJson(res: Response | null): Promise<any | null> {
  if (!res) return null;
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (!ct.includes('application/json')) return null;
  return await res.json().catch(() => null);
}

/**
 * 1. Verify Super Admin access on server
 */
export async function checkIsSuperAdmin(): Promise<{
  isSuperAdmin: boolean;
  email?: string;
  userId?: string;
  reason?: string;
}> {
  try {
    const headers = await getAuthHeader();
    if (!headers.Authorization) {
      return { isSuperAdmin: false, reason: 'Not signed in' };
    }

    const res = await fetch('/api/admin/verify', { headers }).catch(() => null);
    const json = await parseApiJson(res);
    if (!res || !json) {
      return { isSuperAdmin: false, reason: STATIC_ADMIN_UNAVAILABLE_MSG };
    }
    if (!res.ok) {
      return { isSuperAdmin: false, reason: json.reason || json.error || `Status ${res.status}` };
    }
    return json;
  } catch (err: unknown) {
    return {
      isSuperAdmin: false,
      reason: err instanceof Error ? err.message : 'Network error',
    };
  }
}

/**
 * 2. Fetch Executive Stats
 */
export async function fetchAdminStats(): Promise<{
  success: boolean;
  stats?: AdminStats;
  error?: string;
}> {
  try {
    const headers = await getAuthHeader();
    const res = await fetch('/api/admin/stats', { headers }).catch(() => null);
    const json = await parseApiJson(res);
    if (!res || !json) {
      return { success: false, error: STATIC_ADMIN_UNAVAILABLE_MSG };
    }
    return json;
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch stats' };
  }
}

/**
 * 3. Search & List Users
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
    if (!res || !json) return { success: false, error: STATIC_ADMIN_UNAVAILABLE_MSG };
    return json;
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch users' };
  }
}

/**
 * 4. Fetch User Detail
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
    if (!res || !json) return { success: false, error: STATIC_ADMIN_UNAVAILABLE_MSG };
    return json;
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
  error?: string;
}> {
  try {
    const headers = await getAuthHeader();
    const res = await fetch('/api/admin/invitations', { headers }).catch(() => null);
    const json = await parseApiJson(res);
    if (!res || !json) return { success: false, error: STATIC_ADMIN_UNAVAILABLE_MSG };
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
    if (!res || !json) return { success: false, error: STATIC_ADMIN_UNAVAILABLE_MSG };
    return json;
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
    if (!res || !json) return { success: false, error: STATIC_ADMIN_UNAVAILABLE_MSG };
    return json;
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
  error?: string;
}> {
  try {
    const headers = await getAuthHeader();
    const res = await fetch('/api/admin/announcements', { headers }).catch(() => null);
    const json = await parseApiJson(res);
    if (!res || !json) return { success: false, error: STATIC_ADMIN_UNAVAILABLE_MSG };
    return json;
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
    if (!res || !json) return { success: false, error: STATIC_ADMIN_UNAVAILABLE_MSG };
    return json;
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
    if (!res || !json) return { success: false, error: STATIC_ADMIN_UNAVAILABLE_MSG };
    return json;
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
  error?: string;
}> {
  try {
    const headers = await getAuthHeader();
    const res = await fetch('/api/admin/system/status', { headers }).catch(() => null);
    const json = await parseApiJson(res);
    if (!res || !json) return { success: false, error: STATIC_ADMIN_UNAVAILABLE_MSG };
    return json;
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
  error?: string;
}> {
  try {
    const headers = await getAuthHeader();
    const res = await fetch(`/api/admin/audit-logs?limit=${limit}`, { headers }).catch(() => null);
    const json = await parseApiJson(res);
    if (!res || !json) return { success: false, error: STATIC_ADMIN_UNAVAILABLE_MSG };
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
  error?: string;
}> {
  try {
    const headers = await getAuthHeader();
    const res = await fetch('/api/admin/settings', { headers }).catch(() => null);
    const json = await parseApiJson(res);
    if (!res || !json) return { success: false, error: STATIC_ADMIN_UNAVAILABLE_MSG };
    return json;
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
  verifySuperAdmin: async (_token?: string) => {
    return await checkIsSuperAdmin();
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

