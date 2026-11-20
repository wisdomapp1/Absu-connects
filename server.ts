import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { registerCommunityRoutes } from './serverCommunityRoutes.ts';
import { registerEventRoutes } from './serverEventRoutes.ts';
import { registerStoryRoutes } from './serverStoryRoutes.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '10mb' }));

// Supabase Configuration
const SUPABASE_PROJECT_URL = process.env.VITE_SUPABASE_URL || 'https://aqzolewmhpmrcvkrvchn.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_baaiGcHIsSAThnBLScTG6g_9M_stHmk';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Authorized Super Admin Configuration
export const SUPER_ADMIN_EMAIL = 'wisdomchinonso82@gmail.com';
export const AUTHORIZED_SUPER_ADMIN_EMAILS = [
  'wisdomchinonso82@gmail.com',
  'natashaojiugo112@gmail.com',
  'absuconnect.team@gmail.com',
  ...(process.env.SUPER_ADMIN_EMAILS ? process.env.SUPER_ADMIN_EMAILS.split(',').map((e: string) => e.trim().toLowerCase()) : []),
  ...(process.env.SUPER_ADMIN_EMAIL ? [process.env.SUPER_ADMIN_EMAIL.trim().toLowerCase()] : []),
];

export function isSuperAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase().trim();
  return AUTHORIZED_SUPER_ADMIN_EMAILS.some((admin: string) => admin.toLowerCase().trim() === normalized);
}

const supabaseClient = createClient(SUPABASE_PROJECT_URL, SUPABASE_PUBLISHABLE_KEY);
const supabaseAdmin = SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_PROJECT_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

// Returns privileged admin client when available, or user-scoped client carrying their Bearer token
export function getAdminSupabase(req: Request): any {
  if (supabaseAdmin) return supabaseAdmin;
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (token) {
    return createClient(SUPABASE_PROJECT_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return supabaseClient;
}

// Persistent Server-Side Admin Store
const DATA_DIR = path.resolve(__dirname, 'data');
const STORE_PATH = path.resolve(DATA_DIR, 'admin-store.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

interface AdminStore {
  restrictions: Record<string, {
    status: 'active' | 'suspended' | 'disabled';
    suspendedUntil?: string;
    restrictionReason?: string;
    restrictedAt: string;
    restrictedBy: string;
    restrictions: ('posting' | 'messaging' | 'full')[];
  }>;
  warnings: Array<{
    id: string;
    userId: string;
    reason: string;
    adminEmail: string;
    createdAt: string;
  }>;
  reportResolutions: Record<string, {
    status: 'pending' | 'under_review' | 'resolved' | 'dismissed';
    resolutionNotes?: string;
    actionTaken?: string;
    resolvedBy?: string;
    resolvedAt?: string;
  }>;
  auditLogs: Array<{
    id: string;
    adminEmail: string;
    action: string;
    targetId?: string;
    targetType?: string;
    details?: string;
    outcome: 'success' | 'failed';
    timestamp: string;
    ip?: string;
  }>;
  platformSettings: {
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
  };
  invitations: Array<{
    id: string;
    email: string;
    invitedBy: string;
    invitedAt: string;
    status: 'sent' | 'accepted' | 'expired';
  }>;
  announcements: Array<{
    id: string;
    title: string;
    body: string;
    authorName: string;
    createdAt: string;
    isBroadcast: boolean;
    isPinned: boolean;
  }>;
  moderatedPosts: Record<string, {
    action: 'hide' | 'restore' | 'delete';
    reason: string;
    moderatedAt: string;
    moderatedBy: string;
  }>;
  anonymousSubmissions?: Array<{
    id: string;
    body: string;
    status: 'pending' | 'approved' | 'rejected';
    created_at: string;
    reviewed_at?: string;
    reviewed_by?: string;
    published_post_id?: string;
  }>;
}

const defaultStore: AdminStore = {
  restrictions: {},
  warnings: [],
  reportResolutions: {},
  auditLogs: [],
  platformSettings: {
    maintenanceMode: false,
    maintenanceMessage: 'ABSU Connect is briefly undergoing scheduled maintenance. Services will resume shortly.',
    broadcastBanner: {
      active: false,
      text: '',
      type: 'info',
    },
    features: {
      postingEnabled: true,
      messagingEnabled: true,
      registrationOpen: true,
    },
  },
  invitations: [],
  announcements: [],
  moderatedPosts: {},
  anonymousSubmissions: [],
};

function readStore(): AdminStore {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf-8');
      return { ...defaultStore, ...JSON.parse(raw) };
    }
  } catch (err) {
    console.error('[Admin Store] Error reading store, using defaults:', err);
  }
  return { ...defaultStore };
}

function writeStore(store: AdminStore): void {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Admin Store] Error writing store:', err);
  }
}

function appendAuditLog(entry: {
  adminEmail: string;
  action: string;
  targetId?: string;
  targetType?: string;
  details?: string;
  outcome: 'success' | 'failed';
  ip?: string;
}) {
  const store = readStore();
  const id = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  store.auditLogs.unshift({
    id,
    ...entry,
    timestamp: new Date().toISOString(),
  });
  // Keep up to 2000 log records
  if (store.auditLogs.length > 2000) {
    store.auditLogs = store.auditLogs.slice(0, 2000);
  }
  writeStore(store);
}

// Security: Verify user identity & super admin authorization from Supabase session token
async function verifyAdminAuth(req: Request): Promise<{
  authorized: boolean;
  user?: { id: string; email: string };
  reason?: string;
}> {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return { authorized: false, reason: 'Missing authorization bearer token.' };
  }

  try {
    const { data, error } = await supabaseClient.auth.getUser(token);
    if (error || !data?.user) {
      return { authorized: false, reason: 'Invalid or expired user session.' };
    }

    const email = data.user.email?.toLowerCase().trim() || '';
    if (!isSuperAdminEmail(email)) {
      return {
        authorized: false,
        reason: `Account "${email}" is not authorized. Super Admin privileges are restricted to configured administrators (${SUPER_ADMIN_EMAIL}).`,
      };
    }

    return {
      authorized: true,
      user: {
        id: data.user.id,
        email,
      },
    };
  } catch (err) {
    return { authorized: false, reason: 'Server error validating session token.' };
  }
}

// Middleware for Admin API routes
async function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  const check = await verifyAdminAuth(req);
  if (!check.authorized || !check.user) {
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    console.warn(`[Security Alert] Unauthorized access attempt to ${req.originalUrl} from IP: ${clientIp}`);
    res.status(403).json({
      error: 'Forbidden',
      message: check.reason || 'Super Admin authorization required.',
    });
    return;
  }
  (req as any).adminUser = check.user;
  next();
}

// -------------------------------------------------------------
// MR ANONYMOUS PAGE & MODERATION ROUTES
// -------------------------------------------------------------
const MR_ANONYMOUS_PAGE_ID = '0c3240e3-ae39-461d-bd7a-4963859b9bc7';
const MR_ANONYMOUS_DUMMY_ID = 'b4f38505-fce6-44be-8727-8ebf04eb2ceb';
const MR_ANONYMOUS_MANAGER_EMAILS = [
  'wisdomchinonso82@gmail.com',
  'absuconnect.team@gmail.com',
  'natashaojiugo112@gmail.com',
];

async function verifyPageManagerAuth(req: Request): Promise<{
  authorized: boolean;
  user?: { id: string; email: string };
  reason?: string;
}> {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return { authorized: false, reason: 'Missing authorization bearer token.' };
  }

  try {
    const { data, error } = await supabaseClient.auth.getUser(token);
    if (error || !data?.user) {
      return { authorized: false, reason: 'Invalid or expired user session.' };
    }

    const email = data.user.email?.toLowerCase().trim() || '';
    const userId = data.user.id;

    if (
      MR_ANONYMOUS_MANAGER_EMAILS.includes(email) ||
      email === SUPER_ADMIN_EMAIL.toLowerCase().trim()
    ) {
      if (supabaseAdmin) {
        try {
          await supabaseAdmin
            .from('page_managers')
            .upsert(
              {
                page_id: MR_ANONYMOUS_PAGE_ID,
                user_id: userId,
                role: 'manager',
              },
              { onConflict: 'page_id,user_id' }
            );
        } catch {}
      }
      return { authorized: true, user: { id: userId, email } };
    }

    if (supabaseAdmin) {
      const { data: mgr } = await supabaseAdmin
        .from('page_managers')
        .select('role')
        .eq('page_id', MR_ANONYMOUS_PAGE_ID)
        .eq('user_id', userId)
        .maybeSingle();

      if (mgr && (mgr.role === 'owner' || mgr.role === 'manager')) {
        return { authorized: true, user: { id: userId, email } };
      }
    }

    return { authorized: false, reason: 'You are not an authorized manager of this page.' };
  } catch {
    return { authorized: false, reason: 'Server error validating manager authorization.' };
  }
}

async function resolveServerPostMediaSignedUrls(sb: any, rows: any[]): Promise<void> {
  if (!sb || !Array.isArray(rows) || rows.length === 0) return;
  const paths = new Set<string>();
  const getStoragePath = (m: any): string | null => {
    const url = (m?.secure_url || '').trim();
    const aid = (m?.asset_id || '').trim();
    if (
      m?.provider === 'cloudinary' ||
      m?.provider === 'campus_preset' ||
      url.startsWith('data:') ||
      url.includes('/storage/v1/object/public/') ||
      aid.startsWith('inline_') ||
      url.startsWith('/assets/') ||
      url.startsWith('/src/assets/')
    ) {
      return null;
    }
    if (aid && !aid.startsWith('http://') && !aid.startsWith('https://') && !aid.startsWith('/')) {
      return aid;
    }
    const marker = '/storage/v1/object/sign/post-media/';
    if (url.includes(marker)) {
      const part = url.split(marker)[1]?.split('?')[0];
      return part ? decodeURIComponent(part) : null;
    }
    if (url && !url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('/')) {
      return url;
    }
    return null;
  };

  for (const row of rows) {
    for (const m of row?.post_media || []) {
      const p = getStoragePath(m);
      if (p) paths.add(p);
    }
  }

  const list = Array.from(paths);
  if (list.length === 0) return;
  try {
    const { data } = await sb.storage.from('post-media').createSignedUrls(list, 86400);
    const map = new Map<string, string>();
    for (const item of data || []) {
      if (item.path && item.signedUrl) map.set(item.path, item.signedUrl);
    }
    for (const row of rows) {
      for (const m of row?.post_media || []) {
        const p = getStoragePath(m);
        if (p && map.has(p)) {
          m.asset_id = p;
          m.secure_url = map.get(p);
        }
      }
    }
  } catch {
    // Non-blocking fallback
  }
}

let pendingAutoApprovePromise: Promise<number> | null = null;

/**
 * Auto-approves and immediately publishes any pending anonymous submissions in both
 * Supabase and the fallback store without requiring admin intervention.
 * Preserves anonymous identity protection and existing approved/rejected rows.
 */
async function autoApprovePendingAnonymousSubmissions(sb?: any): Promise<number> {
  if (pendingAutoApprovePromise) return pendingAutoApprovePromise;

  pendingAutoApprovePromise = (async () => {
    const client = sb || supabaseAdmin;
    const store = readStore();
    const pendingList: Array<{ id: string; page_id?: string; body: string; created_at?: string; published_post_id?: string | null }> = [];
    const seenIds = new Set<string>();

    if (client) {
      try {
        const { data, error } = await client
          .from('anonymous_submissions')
          .select('id, page_id, body, status, created_at, published_post_id')
          .eq('status', 'pending')
          .order('created_at', { ascending: true });

        if (!error && Array.isArray(data)) {
          for (const row of data) {
            seenIds.add(row.id);
            pendingList.push(row);
          }
        }
      } catch (err) {
        console.warn('[AutoApprove Anon] DB pending fetch notice:', err);
      }
    }

    if (Array.isArray(store.anonymousSubmissions)) {
      for (const s of store.anonymousSubmissions) {
        if (s.status === 'pending' && !seenIds.has(s.id)) {
          seenIds.add(s.id);
          pendingList.push(s);
        }
      }
    }

    if (pendingList.length === 0) return 0;

    let approvedCount = 0;
    let storeModified = false;

    for (const sub of pendingList) {
      const nowIso = new Date().toISOString();
      let publishedPostId: string | undefined = sub.published_post_id || undefined;

      if (!publishedPostId && client) {
        try {
          const { data: newPost, error: postErr } = await client
            .from('posts')
            .insert({
              body: sub.body,
              author_id: MR_ANONYMOUS_DUMMY_ID,
              page_id: sub.page_id || MR_ANONYMOUS_PAGE_ID,
              visibility: 'public',
              created_at: sub.created_at || nowIso,
              updated_at: nowIso,
            })
            .select('id')
            .single();

          if (!postErr && newPost?.id) {
            publishedPostId = newPost.id;
          }
        } catch (err) {
          console.warn('[AutoApprove Anon] Failed to publish pending submission:', err);
        }
      }

      if (publishedPostId || !client) {
        if (client) {
          try {
            await client
              .from('anonymous_submissions')
              .update({
                status: 'approved',
                reviewed_at: nowIso,
                published_post_id: publishedPostId,
                updated_at: nowIso,
              })
              .eq('id', sub.id)
              .eq('status', 'pending');
          } catch (err) {
            console.warn('[AutoApprove Anon] Failed to update submission status:', err);
          }
        }

        if (!store.anonymousSubmissions) store.anonymousSubmissions = [];
        const existingItem = store.anonymousSubmissions.find((s) => s.id === sub.id);
        if (existingItem) {
          existingItem.status = 'approved';
          existingItem.reviewed_at = nowIso;
          existingItem.published_post_id = publishedPostId;
          storeModified = true;
        }
        approvedCount++;
      }
    }

    if (storeModified) {
      writeStore(store);
    }
    return approvedCount;
  })();

  try {
    return await pendingAutoApprovePromise;
  } finally {
    pendingAutoApprovePromise = null;
  }
}

// 1. Fetch all published Mr Anonymous posts (auto-approving any legacy pending submissions first)
app.get('/api/pages/mr-anonymous/posts', async (req, res) => {
  if (!supabaseAdmin) {
    res.status(500).json({ error: 'Supabase admin not configured.' });
    return;
  }
  try {
    await autoApprovePendingAnonymousSubmissions(supabaseAdmin);

    const requestedLimit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 300);
    const { data, error } = await supabaseAdmin
      .from('posts')
      .select(`
        *,
        author:profiles!posts_author_id_fkey(*),
        page:pages(*),
        post_media(*),
        post_reactions(*),
        comments(id)
      `)
      .or(`page_id.eq.${MR_ANONYMOUS_PAGE_ID},author_id.eq.${MR_ANONYMOUS_DUMMY_ID}`)
      .order('created_at', { ascending: false })
      .limit(requestedLimit);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const store = readStore();
    const moderated = store.moderatedPosts || {};
    const posts = (data || []).filter((post: any) => {
      const mod = moderated[post.id];
      if (mod?.action === 'hide' || mod?.action === 'delete') return false;
      if (String(post.visibility || '').toLowerCase() === 'hidden' || Boolean(post.is_hidden)) return false;
      return true;
    });

    await resolveServerPostMediaSignedUrls(supabaseAdmin, posts);
    res.json({ success: true, posts });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch page posts';
    res.status(500).json({ error: msg });
  }
});

// 2. Check if current user is an authorized page manager
app.get('/api/pages/mr-anonymous/is-manager', async (req, res) => {
  const check = await verifyPageManagerAuth(req);
  res.json({ isManager: check.authorized, email: check.user?.email });
});

// 2b. Submit anonymous post -> preserves DB identity protection & immediately auto-approves + publishes
app.post('/api/pages/mr-anonymous/submit', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    res.status(401).json({ success: false, error: 'Please sign in to post anonymously.' });
    return;
  }

  const rawBody = typeof req.body?.body === 'string' ? req.body.body : '';
  const cleanBody = rawBody.trim();
  if (!cleanBody || cleanBody.length < 10) {
    res.status(400).json({ success: false, error: 'Submission must be at least 10 characters long.' });
    return;
  }
  if (cleanBody.length > 2500) {
    res.status(400).json({ success: false, error: 'Submission cannot exceed 2500 characters.' });
    return;
  }

  try {
    const { data: userData, error: authErr } = await supabaseClient.auth.getUser(token);
    if (authErr || !userData?.user) {
      res.status(401).json({ success: false, error: 'Invalid or expired session.' });
      return;
    }

    const store = readStore();
    const rest = store.restrictions[userData.user.id];
    if (rest && (rest.status === 'suspended' || rest.status === 'disabled') && rest.restrictions.includes('posting')) {
      res.status(403).json({ success: false, error: 'Your posting access is currently restricted.' });
      return;
    }

    // Call existing submit_anonymous_post RPC using the authenticated user's JWT so
    // submitter identity continues to be stored only inside the protected identity table.
    const userSb = createClient(SUPABASE_PROJECT_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: submissionId, error: rpcErr } = await userSb.rpc('submit_anonymous_post', {
      p_body: cleanBody,
    });

    if (rpcErr || !submissionId) {
      res.status(400).json({
        success: false,
        error: rpcErr?.message || 'Failed to submit anonymous post.',
      });
      return;
    }

    const adminSb = supabaseAdmin || userSb;
    let publishedPostId: string | undefined;

    // Inspect created submission row (DB BEFORE INSERT trigger may have already auto-approved & published)
    const { data: subRow } = await adminSb
      .from('anonymous_submissions')
      .select('id, page_id, body, status, published_post_id, created_at')
      .eq('id', submissionId)
      .maybeSingle();

    if (subRow?.status === 'approved' && subRow?.published_post_id) {
      publishedPostId = subRow.published_post_id;
    } else if (supabaseAdmin) {
      const nowIso = new Date().toISOString();
      const { data: newPost, error: postErr } = await supabaseAdmin
        .from('posts')
        .insert({
          body: cleanBody,
          author_id: MR_ANONYMOUS_DUMMY_ID,
          page_id: subRow?.page_id || MR_ANONYMOUS_PAGE_ID,
          visibility: 'public',
          created_at: subRow?.created_at || nowIso,
          updated_at: nowIso,
        })
        .select('id')
        .single();

      if (postErr || !newPost?.id) {
        // Roll back unpublished submission so nothing stays stuck in pending
        await supabaseAdmin.from('anonymous_submissions').delete().eq('id', submissionId);
        res.status(500).json({
          success: false,
          error: postErr?.message || 'Failed to publish anonymous post immediately.',
        });
        return;
      }

      publishedPostId = newPost.id;
      await supabaseAdmin
        .from('anonymous_submissions')
        .update({
          status: 'approved',
          reviewed_at: nowIso,
          published_post_id: publishedPostId,
          updated_at: nowIso,
        })
        .eq('id', submissionId);
    } else {
      res.status(500).json({
        success: false,
        error: 'Server auto-approval is not configured (missing SUPABASE_SERVICE_ROLE_KEY or DB trigger).',
      });
      return;
    }

    res.json({
      success: true,
      submissionId,
      postId: publishedPostId,
      status: 'approved',
      autoApproved: true,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to publish anonymous post';
    res.status(500).json({ success: false, error: msg });
  }
});

// 3. Check pending anonymous submissions (auto-approves any remaining pending items first)
app.get('/api/pages/mr-anonymous/pending-submissions', async (req, res) => {
  const check = await verifyPageManagerAuth(req);
  if (!check.authorized) {
    res.status(403).json({ error: 'Forbidden', message: check.reason });
    return;
  }

  const sb = getAdminSupabase(req);
  await autoApprovePendingAnonymousSubmissions(sb);
  const store = readStore();

  try {
    let dbSubs: any[] = [];
    try {
      const { data, error } = await sb
        .from('anonymous_submissions')
        .select('id, page_id, body, status, created_at, updated_at')
        .eq('page_id', MR_ANONYMOUS_PAGE_ID)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (!error && Array.isArray(data)) {
        dbSubs = data;
      }
    } catch (e) {
      console.warn('[Page Manager] DB fetch error:', e);
    }

    // Merge with in-memory pending store
    const storePending = (store.anonymousSubmissions || []).filter((s) => s.status === 'pending');
    const mergedMap = new Map<string, any>();
    for (const s of dbSubs) mergedMap.set(s.id, s);
    for (const s of storePending) {
      if (!mergedMap.has(s.id)) mergedMap.set(s.id, s);
    }

    const submissions = Array.from(mergedMap.values());
    res.json({ success: true, count: submissions.length, submissions });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch pending submissions';
    res.status(500).json({ error: msg });
  }
});

// 4. Review anonymous submission (Approve or Reject)
app.post('/api/pages/mr-anonymous/review-submission', async (req, res) => {
  const check = await verifyPageManagerAuth(req);
  if (!check.authorized || !check.user) {
    res.status(403).json({ error: 'Forbidden', message: check.reason });
    return;
  }

  const sb = getAdminSupabase(req);
  const store = readStore();
  const { submissionId, decision } = req.body;
  if (!submissionId || (decision !== 'approved' && decision !== 'rejected')) {
    res.status(400).json({ error: 'Invalid parameters. submissionId and decision ("approved" | "rejected") required.' });
    return;
  }

  try {
    let sub: any = null;
    try {
      const { data, error: subErr } = await sb
        .from('anonymous_submissions')
        .select('*')
        .eq('id', submissionId)
        .maybeSingle();
      if (!subErr && data) sub = data;
    } catch (e) {
      console.warn('[Page Manager] DB select warning:', e);
    }

    if (!sub && store.anonymousSubmissions) {
      sub = store.anonymousSubmissions.find((s) => s.id === submissionId);
    }

    if (!sub) {
      res.status(404).json({ error: 'Submission not found or already reviewed.' });
      return;
    }

    const nowIso = new Date().toISOString();

    if (decision === 'approved') {
      let publishedPostId: string | undefined;
      try {
        const { data: newPost } = await sb
          .from('posts')
          .insert({
            body: sub.body,
            author_id: MR_ANONYMOUS_DUMMY_ID,
            page_id: MR_ANONYMOUS_PAGE_ID,
            visibility: 'public',
            created_at: nowIso,
            updated_at: nowIso,
          })
          .select('id')
          .single();

        if (newPost) publishedPostId = newPost.id;
      } catch (err) {
        console.warn('[Page Manager] DB post insert warning:', err);
      }

      try {
        await sb
          .from('anonymous_submissions')
          .update({
            status: 'approved',
            reviewed_by: check.user.id,
            reviewed_at: nowIso,
            published_post_id: publishedPostId,
            updated_at: nowIso,
          })
          .eq('id', submissionId);
      } catch (e) {
        console.warn('[Page Manager] DB status update warning:', e);
      }

      // Update store
      if (!store.anonymousSubmissions) store.anonymousSubmissions = [];
      const stItem = store.anonymousSubmissions.find((s) => s.id === submissionId);
      if (stItem) {
        stItem.status = 'approved';
        stItem.reviewed_at = nowIso;
        stItem.reviewed_by = check.user.email;
        stItem.published_post_id = publishedPostId;
      } else {
        store.anonymousSubmissions.unshift({
          id: submissionId,
          body: sub.body,
          status: 'approved',
          created_at: sub.created_at || nowIso,
          reviewed_at: nowIso,
          reviewed_by: check.user.email,
          published_post_id: publishedPostId,
        });
      }
      writeStore(store);

      res.json({ success: true, postId: publishedPostId, message: 'Submission approved and published to page feed.' });
    } else {
      try {
        await sb
          .from('anonymous_submissions')
          .update({
            status: 'rejected',
            reviewed_by: check.user.id,
            reviewed_at: nowIso,
            updated_at: nowIso,
          })
          .eq('id', submissionId);
      } catch (e) {
        console.warn('[Page Manager] DB status update warning:', e);
      }

      if (!store.anonymousSubmissions) store.anonymousSubmissions = [];
      const stItem = store.anonymousSubmissions.find((s) => s.id === submissionId);
      if (stItem) {
        stItem.status = 'rejected';
        stItem.reviewed_at = nowIso;
        stItem.reviewed_by = check.user.email;
      } else {
        store.anonymousSubmissions.unshift({
          id: submissionId,
          body: sub.body,
          status: 'rejected',
          created_at: sub.created_at || nowIso,
          reviewed_at: nowIso,
          reviewed_by: check.user.email,
        });
      }
      writeStore(store);

      res.json({ success: true, message: 'Submission rejected and archived.' });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to review submission';
    res.status(500).json({ error: msg });
  }
});

// -------------------------------------------------------------
// PUBLIC PLATFORM ROUTES
// -------------------------------------------------------------

// Active platform banner & maintenance status for regular ABSU Connect client
app.get('/api/platform/banner', (req, res) => {
  const store = readStore();
  res.json({
    maintenance: store.platformSettings.maintenanceMode,
    maintenanceMessage: store.platformSettings.maintenanceMessage,
    banner: store.platformSettings.broadcastBanner,
    features: store.platformSettings.features,
  });
});

// -------------------------------------------------------------
// WEB PUSH NOTIFICATION ROUTES & VAPID SETUP
// -------------------------------------------------------------
const VAPID_KEYS_PATH = path.resolve(DATA_DIR, 'vapid-keys.json');
const PUSH_SUBS_PATH = path.resolve(DATA_DIR, 'push-subscriptions.json');

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

function getOrGenerateVapidKeys(): VapidKeys {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return {
      publicKey: process.env.VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY,
    };
  }
  try {
    if (fs.existsSync(VAPID_KEYS_PATH)) {
      const content = fs.readFileSync(VAPID_KEYS_PATH, 'utf-8');
      const parsed = JSON.parse(content);
      if (parsed.publicKey && parsed.privateKey) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('[Web Push] Error reading VAPID keys:', err);
  }

  // Generate new standard VAPID keypair
  const newKeys = webpush.generateVAPIDKeys();
  try {
    fs.writeFileSync(VAPID_KEYS_PATH, JSON.stringify(newKeys, null, 2), 'utf-8');
    console.log('[Web Push] Generated and saved fresh VAPID keys.');
  } catch (err) {
    console.error('[Web Push] Error saving VAPID keys:', err);
  }
  return newKeys;
}

const vapidKeys = getOrGenerateVapidKeys();
try {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:notifications@absuconnect.ng',
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );
  console.log('[Web Push] VAPID details successfully configured.');
} catch (vErr) {
  console.error('[Web Push] Failed to configure VAPID details:', vErr);
}

type PushSubscriptionRecord = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
  createdAt: string;
};

type UserSubscriptionsMap = Record<string, PushSubscriptionRecord[]>;

function readPushSubscriptions(): UserSubscriptionsMap {
  try {
    if (fs.existsSync(PUSH_SUBS_PATH)) {
      const data = fs.readFileSync(PUSH_SUBS_PATH, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('[Web Push] Error reading subscriptions:', err);
  }
  return {};
}

function writePushSubscriptions(subs: UserSubscriptionsMap): void {
  try {
    fs.writeFileSync(PUSH_SUBS_PATH, JSON.stringify(subs, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Web Push] Error saving subscriptions:', err);
  }
}

// 1. Get VAPID Public Key for client-side registration
app.get(['/api/push/public-key', '/api/notifications/vapid-public-key'], (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.json({
    success: true,
    publicKey: vapidKeys.publicKey,
  });
});

// WebRTC STUN & TURN Configuration for peer-to-peer NAT traversal & mobile network calling
let cachedIceServers: any = null;
let lastIceServerFetch = 0;

app.get('/api/webrtc/ice-servers', async (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=3600');

  const now = Date.now();
  if (cachedIceServers && now - lastIceServerFetch < 3600000) {
    return res.json({ success: true, iceServers: cachedIceServers });
  }

  const meteredApiKey = process.env.METERED_API_KEY;
  const meteredDomain = process.env.METERED_DOMAIN || process.env.METERED_APP_NAME;

  if (meteredApiKey && meteredDomain) {
    try {
      const response = await fetch(`https://${meteredDomain}.metered.ca/api/v1/turn/credentials?apiKey=${meteredApiKey}`);
      if (response.ok) {
        const meteredServers = await response.json();
        if (Array.isArray(meteredServers) && meteredServers.length > 0) {
          cachedIceServers = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            ...meteredServers,
          ];
          lastIceServerFetch = now;
          return res.json({ success: true, iceServers: cachedIceServers });
        }
      }
    } catch (err) {
      console.warn('[WebRTC] Custom Metered TURN query notice, using default Open Relay:', err);
    }
  }

  const defaultIceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:openrelay.metered.ca:80' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ];

  cachedIceServers = defaultIceServers;
  lastIceServerFetch = now;
  return res.json({ success: true, iceServers: cachedIceServers });
});

// 2. Register Web Push Subscription for an authenticated student
app.post('/api/push/subscribe', async (req, res) => {
  try {
    const { userId, subscription, userAgent } = req.body;
    if (!userId || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      res.status(400).json({ success: false, error: 'Invalid subscription payload.' });
      return;
    }

    const allSubs = readPushSubscriptions();
    const userSubs = allSubs[userId] || [];

    // Filter out existing subscription with same endpoint to avoid duplicates
    const filtered = userSubs.filter((s) => s.endpoint !== subscription.endpoint);
    filtered.push({
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      userAgent: userAgent || (req.headers['user-agent'] as string) || '',
      createdAt: new Date().toISOString(),
    });

    allSubs[userId] = filtered;
    writePushSubscriptions(allSubs);

    // Sync to Supabase push_subscriptions table
    const client = supabaseAdmin || supabaseClient;
    try {
      await client
        .from('push_subscriptions')
        .upsert(
          {
            user_id: userId,
            endpoint: subscription.endpoint,
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth,
            user_agent: userAgent || (req.headers['user-agent'] as string) || '',
            created_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,endpoint' }
        );
    } catch (dbErr: any) {
      console.warn('[Web Push] Supabase subscription sync note:', dbErr?.message);
    }

    res.json({ success: true, message: 'Web push subscription registered.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error subscribing to push';
    res.status(500).json({ success: false, error: msg });
  }
});

// 3. Unsubscribe Web Push Subscription
app.post('/api/push/unsubscribe', async (req, res) => {
  try {
    const { userId, endpoint } = req.body;
    if (!userId || !endpoint) {
      res.status(400).json({ success: false, error: 'Missing userId or endpoint.' });
      return;
    }

    const allSubs = readPushSubscriptions();
    if (allSubs[userId]) {
      allSubs[userId] = allSubs[userId].filter((s) => s.endpoint !== endpoint);
      writePushSubscriptions(allSubs);
    }

    const client = supabaseAdmin || supabaseClient;
    try {
      await client
        .from('push_subscriptions')
        .delete()
        .eq('user_id', userId)
        .eq('endpoint', endpoint);
    } catch {}

    res.json({ success: true, message: 'Web push subscription removed.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error unsubscribing';
    res.status(500).json({ success: false, error: msg });
  }
});

async function getUnifiedSubscriptions(userId: string): Promise<PushSubscriptionRecord[]> {
  const allSubs = readPushSubscriptions();
  const fileSubs = allSubs[userId] || [];
  const client = supabaseAdmin || supabaseClient;

  let dbSubs: PushSubscriptionRecord[] = [];
  try {
    const { data, error } = await client
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth, user_agent, created_at')
      .eq('user_id', userId);
    if (!error && data) {
      dbSubs = data.map((d: any) => ({
        endpoint: d.endpoint,
        keys: { p256dh: d.p256dh, auth: d.auth },
        userAgent: d.user_agent,
        createdAt: d.created_at,
      }));
    }
  } catch (dbErr) {
    console.debug('[Web Push] DB subscription lookup note:', dbErr);
  }

  const endpointMap = new Map<string, PushSubscriptionRecord>();
  for (const s of fileSubs) {
    if (s.endpoint && s.keys?.p256dh && s.keys?.auth) {
      endpointMap.set(s.endpoint, s);
    }
  }
  for (const s of dbSubs) {
    if (s.endpoint && s.keys?.p256dh && s.keys?.auth) {
      endpointMap.set(s.endpoint, s);
    }
  }
  return Array.from(endpointMap.values());
}

async function removeDeadEndpoint(userId: string, endpoint: string) {
  try {
    const allSubs = readPushSubscriptions();
    if (allSubs[userId]) {
      allSubs[userId] = allSubs[userId].filter((s) => s.endpoint !== endpoint);
      writePushSubscriptions(allSubs);
    }
    const client = supabaseAdmin || supabaseClient;
    await client
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('endpoint', endpoint);
  } catch (err) {
    console.warn('[Web Push] Clean dead endpoint error:', err);
  }
}

// 4. Send Privacy-Safe Web Push Notification
app.post('/api/push/send', async (req, res) => {
  try {
    const { recipientId, type, title, body, icon, url, data } = req.body;
    if (!recipientId) {
      res.status(400).json({ success: false, error: 'recipientId is required.' });
      return;
    }

    const userSubs = await getUnifiedSubscriptions(recipientId);

    if (userSubs.length === 0) {
      res.json({ success: true, sentCount: 0, message: 'No push subscriptions for recipient.' });
      return;
    }

    // MANDATORY PRIVACY RULE: Never include private message bodies or excerpts in DMs
    let safeTitle = title || 'ABSU Connect Alert';
    let safeBody = body || 'You have a new campus notification.';

    if (type === 'message' || type === 'dm') {
      safeTitle = title || 'ABSU Connect Message';
      if (body && !body.includes('\n') && body.length < 50 && (body.includes('sent you a message') || body.includes('sent a photo'))) {
        safeBody = body;
      } else {
        safeBody = 'You have a new direct message.';
      }
    }

    const payload = JSON.stringify({
      title: safeTitle,
      body: safeBody,
      icon: icon || '/pwa-192x192.png',
      badge: '/icon.svg',
      url: url || '/',
      tag: `absu-${type || 'general'}-${Date.now()}`,
      data: {
        type: type || 'general',
        url: url || '/',
        ...data,
      },
    });

    const deadEndpoints: string[] = [];
    let sentCount = 0;

    await Promise.all(
      userSubs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.keys.p256dh,
                auth: sub.keys.auth,
              },
            },
            payload,
            {
              TTL: 86400,
              urgency: 'high',
            }
          );
          sentCount++;
        } catch (err: any) {
          if (
            err?.statusCode === 404 ||
            err?.statusCode === 410 ||
            err?.statusCode === 401 ||
            err?.statusCode === 403
          ) {
            deadEndpoints.push(sub.endpoint);
          } else {
            console.warn('[Web Push] Send error for endpoint:', sub.endpoint, err?.statusCode, err?.message);
          }
        }
      })
    );

    if (deadEndpoints.length > 0) {
      await Promise.all(deadEndpoints.map((ep) => removeDeadEndpoint(recipientId, ep)));
    }

    res.json({ success: true, sentCount, staleCleaned: deadEndpoints.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error sending push notification';
    res.status(500).json({ success: false, error: msg });
  }
});

// -------------------------------------------------------------
// NOTIFICATION SYSTEM & WHATSAPP-STYLE RESOLUTION ROUTES
// -------------------------------------------------------------

// 1. Resolve conversation message notifications (when user reads conversation)
app.post('/api/notifications/resolve-conversation', async (req, res) => {
  try {
    const { userId, conversationId, participantId } = req.body;
    if (!userId || !conversationId) {
      res.status(400).json({ success: false, error: 'Missing userId or conversationId' });
      return;
    }

    const client = supabaseAdmin || supabaseClient;
    const nowIso = new Date().toISOString();

    let safeParticipantId = participantId;
    if (!safeParticipantId) {
      const { data: otherMember } = await client
        .from('conversation_members')
        .select('user_id')
        .eq('conversation_id', conversationId)
        .neq('user_id', userId)
        .maybeSingle();
      if (otherMember?.user_id) {
        safeParticipantId = otherMember.user_id;
      }
    }

    // Mark all unread message alerts for this recipient and conversation as read
    let query = client
      .from('notifications')
      .update({ read_at: nowIso })
      .eq('recipient_id', userId)
      .eq('type', 'message')
      .is('read_at', null);

    if (safeParticipantId) {
      query = query.or(`entity_id.eq.${conversationId},actor_id.eq.${safeParticipantId}`);
    } else {
      query = query.eq('entity_id', conversationId);
    }

    const { error } = await query;
    if (error) {
      console.warn('[Notifications] Resolve error:', error.message);
    }

    res.json({ success: true, message: 'Conversation notifications marked as read.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error resolving notifications';
    res.status(500).json({ success: false, error: msg });
  }
});

// 2. WhatsApp-like server deduplication: ensure single active notification per conversation
app.post('/api/notifications/deduplicate', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      res.status(400).json({ success: false, error: 'Missing userId' });
      return;
    }

    const client = supabaseAdmin || supabaseClient;
    const nowIso = new Date().toISOString();

    const { data: unreadRows, error } = await client
      .from('notifications')
      .select('id, actor_id, entity_type, entity_id, created_at')
      .eq('recipient_id', userId)
      .eq('type', 'message')
      .is('read_at', null)
      .order('created_at', { ascending: false });

    if (error || !unreadRows || unreadRows.length <= 1) {
      res.json({ success: true, resolvedDuplicates: 0 });
      return;
    }

    const seenKeys = new Set<string>();
    const duplicateIds: string[] = [];

    for (const r of unreadRows) {
      const key = r.entity_id || r.actor_id || 'unknown';
      if (seenKeys.has(key)) {
        duplicateIds.push(r.id);
      } else {
        seenKeys.add(key);
      }
    }

    if (duplicateIds.length > 0) {
      await client
        .from('notifications')
        .update({ read_at: nowIso })
        .in('id', duplicateIds);
    }

    res.json({ success: true, resolvedDuplicates: duplicateIds.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error deduplicating notifications';
    res.status(500).json({ success: false, error: msg });
  }
});

// 3. Notification system health & archival metrics
app.get('/api/notifications/health', async (_req, res) => {
  try {
    const client = supabaseAdmin || supabaseClient;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [recentRes, archiveRes] = await Promise.all([
      client.from('notifications').select('id', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo),
      client.from('notifications').select('id', { count: 'exact', head: true }).lt('created_at', sevenDaysAgo),
    ]);

    res.json({
      success: true,
      activeNotificationsCount: recentRes.count ?? 0,
      archivedNotificationsCount: archiveRes.count ?? 0,
      archiveCutoff: sevenDaysAgo,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error checking notification metrics';
    res.status(500).json({ success: false, error: msg });
  }
});

// Helper to validate standard UUID string for PostgreSQL uuid column
function isValidUuid(id?: string | null): boolean {
  if (!id) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id.trim());
}

// Helper to send Web Push directly to a student recipient
async function sendPushToRecipient(
  recipientId: string,
  title: string,
  body: string,
  url = '/',
  type = 'general',
  extraData: Record<string, any> = {}
) {
  try {
    const userSubs = await getUnifiedSubscriptions(recipientId);
    if (userSubs.length === 0) return 0;

    const payload = JSON.stringify({
      title,
      body,
      icon: '/pwa-192x192.png',
      badge: '/icon.svg',
      url,
      tag: `absu-${type}-${Date.now()}`,
      data: {
        type,
        url,
        ...extraData,
      },
    });

    const deadEndpoints: string[] = [];
    let sentCount = 0;

    await Promise.all(
      userSubs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.keys.p256dh,
                auth: sub.keys.auth,
              },
            },
            payload,
            {
              TTL: 86400,
              urgency: 'high',
            }
          );
          sentCount++;
        } catch (err: any) {
          if (
            err?.statusCode === 404 ||
            err?.statusCode === 410 ||
            err?.statusCode === 401 ||
            err?.statusCode === 403
          ) {
            deadEndpoints.push(sub.endpoint);
          } else {
            console.warn('[Web Push] Direct send error:', err?.statusCode, err?.message);
          }
        }
      })
    );

    if (deadEndpoints.length > 0) {
      await Promise.all(deadEndpoints.map((ep) => removeDeadEndpoint(recipientId, ep)));
    }

    return sentCount;
  } catch (err) {
    console.warn('[Web Push] Direct send error:', err);
    return 0;
  }
}

// 4. Server-Authoritative Notification Creation (Bypasses Client RLS)
app.post('/api/notifications/create', async (req, res) => {
  try {
    const {
      recipientId,
      actorId,
      type,
      title = 'ABSU Connect Alert',
      body,
      entityType,
      entityId,
      postId,
      commentId,
      parentCommentId,
      senderName,
      url,
    } = req.body;

    if (!recipientId || !actorId || recipientId === actorId) {
      res.status(400).json({ success: false, error: 'Invalid recipientId or actorId.' });
      return;
    }

    if (!isValidUuid(recipientId)) {
      res.json({ success: true, skipped: true, reason: 'Recipient ID is not a valid UUID.' });
      return;
    }

    // Community pages (such as Mr Anonymous) do not have personal notification inboxes
    if (recipientId === MR_ANONYMOUS_PAGE_ID) {
      res.json({ success: true, pageSkipped: true, message: 'Notification skipped for public community page.' });
      return;
    }

    const client = getAdminSupabase(req);
    const nowIso = new Date().toISOString();

    // Verify recipient profile exists to satisfy notifications_recipient_id_fkey
    const { data: recipientProfile } = await client
      .from('profiles')
      .select('id')
      .eq('id', recipientId)
      .maybeSingle();

    if (!recipientProfile) {
      const { data: pageRow } = await client
        .from('pages')
        .select('id')
        .eq('id', recipientId)
        .maybeSingle();

      if (pageRow) {
        res.json({ success: true, pageSkipped: true, message: 'Notification skipped for public page.' });
        return;
      }

      res.json({ success: true, skipped: true, reason: 'Recipient profile not found in profiles table.' });
      return;
    }

    // Verify actor profile exists to satisfy notifications_actor_id_fkey (nullable)
    let safeActorId: string | null = isValidUuid(actorId) ? actorId : null;
    if (safeActorId) {
      const { data: actorProfile } = await client
        .from('profiles')
        .select('id')
        .eq('id', safeActorId)
        .maybeSingle();

      if (!actorProfile) {
        safeActorId = null;
      }
    }

    const safeEntityId = isValidUuid(entityId) ? entityId : null;
    let safePostId = isValidUuid(postId) ? postId : null;
    let safeCommentId = isValidUuid(commentId) ? commentId : null;
    let safeParentCommentId = isValidUuid(parentCommentId) ? parentCommentId : null;

    if (
      (entityType === 'comment' || entityType === 'comment_reply' || entityType === 'comment_reaction') &&
      !safeCommentId &&
      safeEntityId
    ) {
      safeCommentId = safeEntityId;
    }
    if (entityType === 'post' && !safePostId && safeEntityId) {
      safePostId = safeEntityId;
    }

    // Resolve post_id / parent_comment_id from comments table when a commentId is supplied
    if (safeCommentId && (!safePostId || (entityType === 'comment_reply' && !safeParentCommentId))) {
      const { data: commentMeta } = await client
        .from('comments')
        .select('post_id, parent_comment_id')
        .eq('id', safeCommentId)
        .maybeSingle();
      if (commentMeta) {
        if (!safePostId && isValidUuid(commentMeta.post_id)) {
          safePostId = commentMeta.post_id;
        }
        if (!safeParentCommentId && isValidUuid(commentMeta.parent_comment_id)) {
          safeParentCommentId = commentMeta.parent_comment_id;
        }
      }
    }

    const targetEntityType =
      entityType ||
      (type === 'comment'
        ? safeParentCommentId
          ? 'comment_reply'
          : safeCommentId
          ? 'comment'
          : 'post'
        : null);

    const targetEntityId =
      targetEntityType === 'comment' ||
      targetEntityType === 'comment_reply' ||
      targetEntityType === 'comment_reaction'
        ? safeCommentId || safeEntityId || safePostId
        : targetEntityType === 'post'
        ? safePostId || safeEntityId
        : safeEntityId;

    // Database enum mapping
    let dbType = type;
    if (type === 'like') dbType = 'reaction';
    if (type === 'friend_accept') dbType = 'friend_accepted';
    if (type === 'campus_notice') dbType = 'announcement';
    if (type === 'game_invitation') dbType = 'game_invite';

    let safeBody = body;
    if (!safeBody) {
      if (targetEntityType === 'comment_reply') {
        safeBody = 'replied to your comment.';
      } else if (targetEntityType === 'comment_reaction') {
        safeBody = 'liked your comment.';
      } else {
        switch (type) {
          case 'like':
            safeBody = 'liked your post.';
            break;
          case 'comment':
            safeBody = 'commented on your post.';
            break;
          case 'mention':
            safeBody = 'mentioned you in a post.';
            break;
          case 'friend_request':
            safeBody = 'sent you a friend request.';
            break;
          case 'friend_accept':
            safeBody = 'accepted your friend request.';
            break;
          case 'campus_notice':
            safeBody = 'published a campus announcement.';
            break;
          case 'game_invitation':
            safeBody = 'invited you to play a campus game.';
            break;
          default:
            safeBody = 'interacted with you on ABSU Connect.';
        }
      }
    }

    const isMissingColumnError = (err: { message?: string; code?: string } | null) => {
      if (!err) return false;
      const msg = (err.message || '').toLowerCase();
      return (
        err.code === '42703' ||
        err.code === 'PGRST204' ||
        msg.includes('post_id') ||
        msg.includes('comment_id') ||
        msg.includes('parent_comment_id') ||
        msg.includes('column')
      );
    };

    // Prevent duplicate notification rows from simultaneous DB trigger + client call within 60 seconds
    if (['reaction', 'comment', 'friend_request', 'friend_accepted'].includes(dbType) && safeActorId) {
      const sixtySecAgoIso = new Date(Date.now() - 60000).toISOString();

      if (dbType === 'comment' && safeCommentId) {
        // Check if trigger already inserted a row for this comment or legacy post_id trigger row
        const matchIds = Array.from(new Set([safeCommentId, safePostId].filter(Boolean) as string[]));
        let dupQuery = client
          .from('notifications')
          .select('*')
          .eq('recipient_id', recipientId)
          .eq('actor_id', safeActorId)
          .eq('type', 'comment')
          .gte('created_at', sixtySecAgoIso)
          .order('created_at', { ascending: false })
          .limit(3);

        if (matchIds.length > 0) {
          dupQuery = dupQuery.in('entity_id', matchIds);
        }

        const { data: recentDups } = await dupQuery;
        const exactDup = (recentDups || []).find((d: any) => d.entity_id === safeCommentId);
        if (exactDup) {
          res.json({
            success: true,
            deduped: true,
            notification: {
              ...exactDup,
              post_id: exactDup.post_id || safePostId,
              comment_id: exactDup.comment_id || safeCommentId,
              parent_comment_id: exactDup.parent_comment_id || safeParentCommentId,
            },
            message: 'Recent notification already recorded.',
          });
          return;
        }

        const triggerDup = (recentDups || []).find(
          (d: any) => d.entity_type === 'post' && safePostId && d.entity_id === safePostId
        );
        if (triggerDup) {
          // Upgrade the DB-trigger row in-place with exact comment/reply IDs
          const updateFull: Record<string, any> = {
            entity_type: targetEntityType,
            entity_id: targetEntityId,
            title,
            body: safeBody,
          };
          if (safePostId) updateFull.post_id = safePostId;
          if (safeCommentId) updateFull.comment_id = safeCommentId;
          if (safeParentCommentId) updateFull.parent_comment_id = safeParentCommentId;

          let { data: updatedRow, error: updErr } = await client
            .from('notifications')
            .update(updateFull)
            .eq('id', triggerDup.id)
            .select('*')
            .maybeSingle();

          if (updErr && isMissingColumnError(updErr)) {
            const retry = await client
              .from('notifications')
              .update({
                entity_type: targetEntityType,
                entity_id: targetEntityId,
                title,
                body: safeBody,
              })
              .eq('id', triggerDup.id)
              .select('*')
              .maybeSingle();
            updatedRow = retry.data;
          }

          res.json({
            success: true,
            deduped: true,
            enriched: true,
            notification: {
              ...(updatedRow || triggerDup),
              post_id: (updatedRow as any)?.post_id || safePostId,
              comment_id: (updatedRow as any)?.comment_id || safeCommentId,
              parent_comment_id: (updatedRow as any)?.parent_comment_id || safeParentCommentId,
            },
            message: 'Existing trigger notification enriched with comment ID.',
          });
          return;
        }
      } else {
        let dupQuery = client
          .from('notifications')
          .select('*')
          .eq('recipient_id', recipientId)
          .eq('actor_id', safeActorId)
          .eq('type', dbType)
          .gte('created_at', sixtySecAgoIso)
          .order('created_at', { ascending: false })
          .limit(1);

        if (targetEntityType) {
          dupQuery = dupQuery.eq('entity_type', targetEntityType);
        }
        if (targetEntityId) {
          dupQuery = dupQuery.eq('entity_id', targetEntityId);
        }

        const { data: recentDup } = await dupQuery.maybeSingle();
        if (recentDup) {
          res.json({
            success: true,
            deduped: true,
            notification: {
              ...recentDup,
              post_id: recentDup.post_id || safePostId,
              comment_id: recentDup.comment_id || safeCommentId,
              parent_comment_id: recentDup.parent_comment_id || safeParentCommentId,
            },
            message: 'Recent notification already recorded.',
          });
          return;
        }
      }
    }

    const corePayload: Record<string, any> = {
      recipient_id: recipientId,
      actor_id: safeActorId,
      type: dbType,
      title,
      body: safeBody,
      entity_type: targetEntityType,
      entity_id: targetEntityId,
      read_at: null,
      created_at: nowIso,
    };

    const fullPayload: Record<string, any> = {
      ...corePayload,
      ...(safePostId ? { post_id: safePostId } : {}),
      ...(safeCommentId ? { comment_id: safeCommentId } : {}),
      ...(safeParentCommentId ? { parent_comment_id: safeParentCommentId } : {}),
    };

    let { data: insertedData, error: insErr } = await client
      .from('notifications')
      .insert(fullPayload)
      .select('*')
      .maybeSingle();

    if (insErr && isMissingColumnError(insErr)) {
      const coreAttempt = await client
        .from('notifications')
        .insert(corePayload)
        .select('*')
        .maybeSingle();
      insertedData = coreAttempt.data;
      insErr = coreAttempt.error;
    }

    if (insErr) {
      if (insErr.code === '23503' || insErr.message?.includes('foreign key constraint')) {
        res.json({
          success: true,
          skipped: true,
          reason: 'Notification skipped due to profile reference constraint.',
        });
        return;
      }

      console.warn('[Notifications] Admin insert error:', insErr.message);
      const fallback = await client
        .from('notifications')
        .insert({
          recipient_id: recipientId,
          actor_id: safeActorId,
          type: dbType,
          title,
          body: safeBody,
          read_at: null,
          created_at: nowIso,
        })
        .select('*')
        .maybeSingle();

      if (fallback.error && !fallback.error.message?.includes('foreign key constraint')) {
        console.warn('[Notifications] Fallback insert note:', fallback.error.message);
      }
      if (!insertedData && fallback.data) {
        insertedData = fallback.data;
      }
    }

    // Trigger Web Push Notification to recipient device
    const pushTitle = senderName ? `${senderName}` : title;
    const pushBody = safeBody;
    let pushUrl = url || '';
    if (!pushUrl && safePostId) {
      const qs = new URLSearchParams({ view: 'post-detail', postId: safePostId });
      if (safeCommentId) qs.set('commentId', safeCommentId);
      if (safeParentCommentId) qs.set('parentCommentId', safeParentCommentId);
      if (
        type === 'comment' ||
        targetEntityType === 'comment' ||
        targetEntityType === 'comment_reply' ||
        targetEntityType === 'comment_reaction'
      ) {
        qs.set('openComments', '1');
      }
      pushUrl = `/?${qs.toString()}`;
    } else if (!pushUrl) {
      pushUrl = type === 'friend_request' ? '/?view=friends' : '/?view=alerts';
    }
    sendPushToRecipient(recipientId, pushTitle, pushBody, pushUrl, type).catch(() => {});

    res.json({
      success: true,
      notification: insertedData
        ? {
            ...insertedData,
            post_id: (insertedData as any).post_id || safePostId,
            comment_id: (insertedData as any).comment_id || safeCommentId,
            parent_comment_id: (insertedData as any).parent_comment_id || safeParentCommentId,
          }
        : null,
      message: 'Notification created and dispatched.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error creating notification';
    console.error('[Notifications] Create error:', msg);
    res.status(500).json({ success: false, error: msg });
  }
});

// 5. Server-Authoritative Conversation-Level Message Notification
app.post('/api/notifications/create-or-update-message', async (req, res) => {
  try {
    const { recipientId, senderId, conversationId, senderName, messageId } = req.body;
    if (!recipientId || !senderId || recipientId === senderId) {
      res.status(400).json({ success: false, error: 'Invalid recipientId or senderId' });
      return;
    }

    if (!isValidUuid(recipientId) || recipientId === MR_ANONYMOUS_PAGE_ID) {
      res.json({ success: true, skipped: true, reason: 'Invalid or page recipient ID.' });
      return;
    }

    const client = getAdminSupabase(req);
    const nowIso = new Date().toISOString();
    const safeConvId = isValidUuid(conversationId) ? conversationId : null;
    const safeMsgId = isValidUuid(messageId) ? messageId : null;
    const targetEntityId = safeMsgId || safeConvId;

    // Verify recipient profile exists
    const { data: recipientProfile } = await client
      .from('profiles')
      .select('id')
      .eq('id', recipientId)
      .maybeSingle();

    if (!recipientProfile) {
      res.json({ success: true, skipped: true, reason: 'Recipient profile not found in profiles table.' });
      return;
    }

    // Verify sender profile exists
    let safeSenderId: string | null = isValidUuid(senderId) ? senderId : null;
    if (safeSenderId) {
      const { data: senderProfile } = await client
        .from('profiles')
        .select('id')
        .eq('id', safeSenderId)
        .maybeSingle();
      if (!senderProfile) safeSenderId = null;
    }

    // Check if an unread notification already exists for this conversation
    const { data: existingList } = await client
      .from('notifications')
      .select('id, entity_id')
      .eq('recipient_id', recipientId)
      .eq('type', 'message')
      .is('read_at', null)
      .or(safeConvId ? `entity_id.eq.${safeConvId},actor_id.eq.${senderId}` : `actor_id.eq.${senderId}`)
      .order('created_at', { ascending: false })
      .limit(5);

    const senderDisplayName = senderName || 'ABSU Student';
    const notifTitle = `${senderDisplayName} sent you a message.`;

    if (existingList && existingList.length > 0) {
      // Update primary existing unread notification timestamp & preserve/update entityId
      await client
        .from('notifications')
        .update({
          created_at: nowIso,
          actor_id: safeSenderId,
          entity_type: safeMsgId ? 'message' : 'conversation',
          entity_id: targetEntityId || existingList[0].entity_id,
          title: notifTitle,
          body: 'sent you a message.',
        })
        .eq('id', existingList[0].id);

      // Clean up extra duplicates
      if (existingList.length > 1) {
        const extraIds = existingList.slice(1).map((e: { id: string }) => e.id);
        await client.from('notifications').update({ read_at: nowIso }).in('id', extraIds);
      }
    } else {
      // Insert one fresh conversation notification
      await client.from('notifications').insert({
        recipient_id: recipientId,
        actor_id: safeSenderId,
        type: 'message',
        title: notifTitle,
        body: 'sent you a message.',
        entity_type: safeMsgId ? 'message' : 'conversation',
        entity_id: targetEntityId,
        created_at: nowIso,
        read_at: null,
      });
    }

    // Trigger privacy-safe push notification (never leak DM message text)
    const pushTitle = senderDisplayName;
    const pushBody = `${senderDisplayName} sent you a message.`;
    const pushUrl = conversationId ? `/?view=conversation&convId=${conversationId}` : '/?view=messages';
    sendPushToRecipient(recipientId, pushTitle, pushBody, pushUrl, 'message').catch(() => {});

    res.json({ success: true, message: 'Conversation notification updated.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error updating conversation notification';
    console.error('[Notifications] Conversation notification error:', msg);
    res.status(500).json({ success: false, error: msg });
  }
});

// 6. Fetch User Notifications with Actor Profiles (Bypasses Client RLS & FK constraints)
app.get('/api/notifications/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      res.status(400).json({ success: false, error: 'Missing userId parameter' });
      return;
    }

    const client = getAdminSupabase(req);

    // Fetch notifications directly
    const { data: rawNotifs, error: notifErr } = await client
      .from('notifications')
      .select('*')
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (notifErr) {
      console.warn('[Notifications] Fetch error:', notifErr.message);
      res.status(500).json({ success: false, error: notifErr.message });
      return;
    }

    // Collect actor IDs and comment/post references to hydrate profiles + exact navigation targets
    const rows = rawNotifs || [];
    const actorIds = Array.from(
      new Set(rows.map((n: { actor_id?: string | null }) => n.actor_id).filter(Boolean))
    );
    const profilesMap = new Map<string, any>();

    const commentLookupIds = new Set<string>();
    const legacyCommentPostIds = new Set<string>();

    for (const n of rows as Array<Record<string, any>>) {
      if (isValidUuid(n.comment_id)) {
        commentLookupIds.add(n.comment_id);
      }
      const et = String(n.entity_type || '').toLowerCase();
      if (
        (et === 'comment' || et === 'comment_reply' || et === 'comment_reaction') &&
        isValidUuid(n.entity_id)
      ) {
        commentLookupIds.add(n.entity_id);
      } else if (
        n.type === 'comment' &&
        et === 'post' &&
        !isValidUuid(n.comment_id) &&
        isValidUuid(n.entity_id)
      ) {
        legacyCommentPostIds.add(n.entity_id);
      }
    }

    const commentMetaMap = new Map<string, { id: string; post_id: string; parent_comment_id: string | null }>();
    const commentsByPostIdMap = new Map<
      string,
      Array<{ id: string; post_id: string; author_id: string; parent_comment_id: string | null; created_at: string }>
    >();

    const batchPromises: Array<Promise<void>> = [];

    if (actorIds.length > 0) {
      batchPromises.push(
        (async () => {
          const { data: profileRows } = await client
            .from('profiles')
            .select('*')
            .in('id', actorIds);
          if (profileRows) {
            for (const p of profileRows) {
              profilesMap.set(p.id, p);
            }
          }
        })()
      );
    }

    if (commentLookupIds.size > 0) {
      batchPromises.push(
        (async () => {
          const { data: commentRows } = await client
            .from('comments')
            .select('id, post_id, parent_comment_id')
            .in('id', Array.from(commentLookupIds));
          if (commentRows) {
            for (const c of commentRows as Array<{ id: string; post_id: string; parent_comment_id: string | null }>) {
              commentMetaMap.set(c.id, c);
            }
          }
        })()
      );
    }

    if (legacyCommentPostIds.size > 0) {
      batchPromises.push(
        (async () => {
          const { data: postComments } = await client
            .from('comments')
            .select('id, post_id, author_id, parent_comment_id, created_at')
            .in('post_id', Array.from(legacyCommentPostIds))
            .order('created_at', { ascending: false })
            .limit(200);
          if (postComments) {
            for (const c of postComments as Array<{
              id: string;
              post_id: string;
              author_id: string;
              parent_comment_id: string | null;
              created_at: string;
            }>) {
              const list = commentsByPostIdMap.get(c.post_id) || [];
              list.push(c);
              commentsByPostIdMap.set(c.post_id, list);
            }
          }
        })()
      );
    }

    await Promise.all(batchPromises);

    // Attach actor profiles & resolved navigation IDs (post_id, comment_id, parent_comment_id)
    const enriched = rows.map((n: Record<string, any>) => {
      const profile = n.actor_id ? profilesMap.get(n.actor_id) : null;
      const et = String(n.entity_type || '').toLowerCase();

      let resolvedPostId: string | null = isValidUuid(n.post_id) ? n.post_id : null;
      let resolvedCommentId: string | null = isValidUuid(n.comment_id) ? n.comment_id : null;
      let resolvedParentCommentId: string | null = isValidUuid(n.parent_comment_id)
        ? n.parent_comment_id
        : null;

      if (!resolvedCommentId && (et === 'comment' || et === 'comment_reply' || et === 'comment_reaction') && isValidUuid(n.entity_id)) {
        resolvedCommentId = n.entity_id;
      }

      if (resolvedCommentId && commentMetaMap.has(resolvedCommentId)) {
        const meta = commentMetaMap.get(resolvedCommentId)!;
        if (!resolvedPostId && isValidUuid(meta.post_id)) {
          resolvedPostId = meta.post_id;
        }
        if (!resolvedParentCommentId && isValidUuid(meta.parent_comment_id)) {
          resolvedParentCommentId = meta.parent_comment_id;
        }
      }

      if (!resolvedPostId && et === 'post' && isValidUuid(n.entity_id)) {
        resolvedPostId = n.entity_id;
      }

      // Recover exact comment ID for legacy `type='comment' & entity_type='post'` trigger rows
      if (
        n.type === 'comment' &&
        !resolvedCommentId &&
        resolvedPostId &&
        n.actor_id &&
        commentsByPostIdMap.has(resolvedPostId)
      ) {
        const candidates = (commentsByPostIdMap.get(resolvedPostId) || []).filter(
          (c) => c.author_id === n.actor_id
        );
        if (candidates.length > 0) {
          const wantsReply = String(n.body || '').toLowerCase().includes('replied');
          const filtered = wantsReply
            ? candidates.filter((c) => Boolean(c.parent_comment_id))
            : candidates;
          const pool = filtered.length > 0 ? filtered : candidates;
          const notifTs = n.created_at ? new Date(n.created_at).getTime() : 0;
          let best = pool[0];
          let bestDiff = notifTs ? Math.abs(new Date(best.created_at).getTime() - notifTs) : 0;
          for (const cand of pool.slice(1)) {
            const diff = notifTs ? Math.abs(new Date(cand.created_at).getTime() - notifTs) : 0;
            if (diff < bestDiff) {
              best = cand;
              bestDiff = diff;
            }
          }
          resolvedCommentId = best.id;
          if (!resolvedParentCommentId && best.parent_comment_id) {
            resolvedParentCommentId = best.parent_comment_id;
          }
        }
      }

      return {
        ...n,
        post_id: resolvedPostId,
        comment_id: resolvedCommentId,
        parent_comment_id: resolvedParentCommentId,
        actor: profile || null,
      };
    });

    res.json({ success: true, notifications: enriched });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error fetching user notifications';
    res.status(500).json({ success: false, error: msg });
  }
});

// 7. Mark Individual Notification Read
app.post('/api/notifications/mark-read', async (req, res) => {
  try {
    const { notificationId } = req.body;
    if (!notificationId) {
      res.status(400).json({ success: false, error: 'Missing notificationId' });
      return;
    }

    const client = getAdminSupabase(req);
    await client
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId);

    res.json({ success: true, message: 'Notification marked as read.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error marking notification read';
    res.status(500).json({ success: false, error: msg });
  }
});

// 8. Mark All Notifications Read for User
app.post('/api/notifications/mark-all-read', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      res.status(400).json({ success: false, error: 'Missing userId' });
      return;
    }

    const client = getAdminSupabase(req);
    await client
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('recipient_id', userId)
      .is('read_at', null);

    res.json({ success: true, message: 'All notifications marked as read.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error marking all read';
    res.status(500).json({ success: false, error: msg });
  }
});

// 9. Send Test Notification to Verify Push & In-App Alerts
app.post('/api/notifications/send-test', async (req, res) => {
  try {
    const { userId, userName } = req.body;
    if (!userId) {
      res.status(400).json({ success: false, error: 'Missing userId' });
      return;
    }

    const client = getAdminSupabase(req);
    const nowIso = new Date().toISOString();

    const title = '🎉 ABSU Connect Notification Test';
    const body = `Notifications are fully active for ${userName || 'your account'}! You will receive campus alerts, friend requests, and direct messages.`;

    // Insert database notification
    await client.from('notifications').insert({
      recipient_id: userId,
      actor_id: userId,
      type: 'announcement',
      title,
      body: 'Notifications are active! You will receive instant campus updates and peer alerts.',
      read_at: null,
      created_at: nowIso,
    });

    // Send real Web Push
    const sentCount = await sendPushToRecipient(userId, title, body, '/?view=alerts', 'test');

    res.json({
      success: true,
      message: 'Test notification sent successfully!',
      pushDelivered: sentCount > 0,
      sentCount,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error sending test notification';
    res.status(500).json({ success: false, error: msg });
  }
});

// 9b. Create test diagnostic notification using admin service role (bypasses client RLS securely)
app.post('/api/notifications/create-test', async (req, res) => {
  try {
    const { userId, entityId } = req.body;
    if (!userId || !entityId) {
      res.status(400).json({ success: false, error: 'Missing userId or entityId' });
      return;
    }

    const client = getAdminSupabase(req);
    const nowIso = new Date().toISOString();

    const { data: notif, error: notifErr } = await client
      .from('notifications')
      .insert({
        recipient_id: userId,
        actor_id: userId,
        type: 'announcement',
        title: '🎉 ABSU Connect Notification Test',
        body: 'FCM push notifications are successfully configured for your device!',
        entity_type: 'test',
        entity_id: entityId,
        read_at: null,
        created_at: nowIso,
      })
      .select('*')
      .single();

    if (notifErr) {
      res.status(500).json({ success: false, error: notifErr.message });
      return;
    }

    res.json({ success: true, notification: notif });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error creating test notification';
    res.status(500).json({ success: false, error: msg });
  }
});

// 9c. Smart Onboarding Welcome & Real Student Discovery Notification (Idempotent)
app.post('/api/notifications/welcome-discovery', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId || !isValidUuid(userId)) {
      res.status(400).json({ success: false, error: 'Valid userId is required.' });
      return;
    }

    const client = getAdminSupabase(req);

    // Ensure idempotency: never duplicate discovery_welcome for the same user
    const { data: existingWelcome } = await client
      .from('notifications')
      .select('id')
      .eq('recipient_id', userId)
      .eq('entity_type', 'discovery_welcome')
      .limit(1)
      .maybeSingle();

    if (existingWelcome) {
      res.json({ success: true, alreadyExists: true, notificationId: existingWelcome.id });
      return;
    }

    // Fetch recipient's real profile
    const { data: myProfile } = await client
      .from('profiles')
      .select('id, display_name, username, department, faculty, level')
      .eq('id', userId)
      .maybeSingle();

    if (!myProfile) {
      res.json({ success: true, skipped: true, reason: 'Profile not found yet.' });
      return;
    }

    const firstName = (myProfile.display_name || myProfile.username || 'Student').split(' ')[0];
    const threeMinutesAgoIso = new Date(Date.now() - 3 * 60 * 1000).toISOString();

    const [presenceRes, peerProfilesRes] = await Promise.all([
      client
        .from('user_presence')
        .select('user_id, last_seen_at')
        .neq('user_id', userId)
        .gte('last_seen_at', threeMinutesAgoIso),
      client
        .from('profiles')
        .select('id, department, faculty, level')
        .neq('id', userId)
        .limit(150),
    ]);

    const onlinePeerIds = new Set<string>(
      (presenceRes.data || []).map((p: any) => p.user_id).filter(Boolean)
    );
    const peerRows = (peerProfilesRes.data || []) as Array<{
      id: string;
      department?: string | null;
      faculty?: string | null;
      level?: string | null;
    }>;

    const myDept = (myProfile.department || '').trim().toLowerCase();
    const myFaculty = (myProfile.faculty || '').trim().toLowerCase();

    const sameDeptCount = myDept
      ? peerRows.filter((p) => (p.department || '').trim().toLowerCase() === myDept).length
      : 0;
    const sameFacultyCount = myFaculty
      ? peerRows.filter((p) => (p.faculty || '').trim().toLowerCase() === myFaculty).length
      : 0;
    const onlineCount = onlinePeerIds.size;

    const title = `Welcome to ABSU Connect, ${firstName}!`;
    let body = 'Explore Discover in Friend Navigator to meet classmates across ABSU.';
    if (onlineCount > 0 && sameDeptCount > 0) {
      body = `${onlineCount} student${onlineCount === 1 ? ' is' : 's are'} online now and ${sameDeptCount} peer${sameDeptCount === 1 ? ' matches' : ' match'} ${myProfile.department}. Tap to connect!`;
    } else if (onlineCount > 0) {
      body = `${onlineCount} ABSU student${onlineCount === 1 ? ' is' : 's are'} active right now. Tap to discover classmates!`;
    } else if (sameDeptCount > 0) {
      body = `${sameDeptCount} student${sameDeptCount === 1 ? '' : 's'} from ${myProfile.department} ${sameDeptCount === 1 ? 'is' : 'are'} already here. Tap to discover classmates!`;
    } else if (sameFacultyCount > 0) {
      body = `${sameFacultyCount} classmate${sameFacultyCount === 1 ? '' : 's'} in ${myProfile.faculty} ${sameFacultyCount === 1 ? 'is' : 'are'} on ABSU Connect. Tap to connect!`;
    }

    const { data: inserted, error: insErr } = await client
      .from('notifications')
      .insert({
        recipient_id: userId,
        actor_id: userId,
        type: 'system',
        title,
        body,
        entity_type: 'discovery_welcome',
        entity_id: userId,
        read_at: null,
        created_at: new Date().toISOString(),
      })
      .select('*')
      .maybeSingle();

    if (insErr) {
      res.status(400).json({ success: false, error: insErr.message });
      return;
    }

    sendPushToRecipient(userId, title, body, '/?view=friends', 'welcome_discovery').catch(() => {});

    res.json({
      success: true,
      notification: inserted || null,
      metrics: { onlineCount, sameDeptCount, sameFacultyCount },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create welcome notification';
    res.status(500).json({ success: false, error: msg });
  }
});

// 9d. 24-Hour Discovery Inactivity Reminder (Idempotent — triggers at most once)
app.post('/api/notifications/check-discovery-reminder', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId || !isValidUuid(userId)) {
      res.status(400).json({ success: false, error: 'Valid userId is required.' });
      return;
    }

    const client = getAdminSupabase(req);

    // Check if reminder was already sent previously
    const { data: existingReminder } = await client
      .from('notifications')
      .select('id')
      .eq('recipient_id', userId)
      .eq('entity_type', 'discovery_reminder')
      .limit(1)
      .maybeSingle();

    if (existingReminder) {
      res.json({ success: true, alreadySent: true });
      return;
    }

    const { data: profile } = await client
      .from('profiles')
      .select('id, created_at, department, faculty')
      .eq('id', userId)
      .maybeSingle();

    if (!profile?.created_at) {
      res.json({ success: true, skipped: true, reason: 'Profile timestamp missing.' });
      return;
    }

    const ageMs = Date.now() - new Date(profile.created_at).getTime();
    if (ageMs < 24 * 60 * 60 * 1000) {
      res.json({ success: true, skipped: true, reason: 'Account younger than 24 hours.' });
      return;
    }

    // Check if user has already started engaging (posts or friend links)
    const [postsRes, friendsRes] = await Promise.all([
      client.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', userId),
      client
        .from('friendships')
        .select('id', { count: 'exact', head: true })
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`),
    ]);

    if ((postsRes.count || 0) > 0 || (friendsRes.count || 0) > 0) {
      res.json({ success: true, skipped: true, reason: 'User is already socially active.' });
      return;
    }

    const threeMinutesAgoIso = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    const { count: onlineCount } = await client
      .from('user_presence')
      .select('user_id', { count: 'exact', head: true })
      .neq('user_id', userId)
      .gte('last_seen_at', threeMinutesAgoIso);

    const title = 'Find your ABSU coursemates';
    const body =
      onlineCount && onlineCount > 0
        ? `${onlineCount} classmate${onlineCount === 1 ? ' is' : 's are'} active now on ABSU Connect. Visit Discover to add friends in ${profile.department || 'your department'}!`
        : `Complete your circle on ABSU Connect — tap here to discover students from ${profile.department || 'ABSU'} and start connecting.`;

    const { data: inserted, error } = await client
      .from('notifications')
      .insert({
        recipient_id: userId,
        actor_id: userId,
        type: 'system',
        title,
        body,
        entity_type: 'discovery_reminder',
        entity_id: userId,
        read_at: null,
        created_at: new Date().toISOString(),
      })
      .select('*')
      .maybeSingle();

    if (error) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }

    sendPushToRecipient(userId, title, body, '/?view=friends', 'discovery_reminder').catch(() => {});
    res.json({ success: true, created: true, notification: inserted || null });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to check discovery reminder';
    res.status(500).json({ success: false, error: msg });
  }
});

// 10. Check Push Subscription Status on Server
app.get('/api/push/status/:userId', (req, res) => {
  const { userId } = req.params;
  const allSubs = readPushSubscriptions();
  const userSubs = allSubs[userId] || [];
  res.json({
    success: true,
    subscribed: userSubs.length > 0,
    count: userSubs.length,
  });
});

// -------------------------------------------------------------
// SUPER ADMIN API ROUTES
// -------------------------------------------------------------

// 1. Verify Super Admin Access
app.get('/api/admin/verify', async (req, res) => {
  const check = await verifyAdminAuth(req);
  if (!check.authorized || !check.user) {
    res.json({ isSuperAdmin: false, reason: check.reason });
    return;
  }

  res.json({
    isSuperAdmin: true,
    email: check.user.email,
    userId: check.user.id,
    role: 'Super Admin',
    serviceRoleConfigured: Boolean(supabaseAdmin),
  });
});

// 2. Executive Dashboard Overview & Stats
app.get('/api/admin/stats', requireSuperAdmin, async (req, res) => {
  try {
    const store = readStore();
    const sb = getAdminSupabase(req);

    // Query real Supabase metrics concurrently with admin session authority
    const [profilesRes, postsRes, commentsRes, reportsRes] = await Promise.all([
      sb.from('profiles').select('id, created_at, updated_at', { count: 'exact' }),
      sb.from('posts').select('id, created_at', { count: 'exact' }),
      sb.from('comments').select('id, created_at', { count: 'exact' }),
      sb.from('reports').select('id, status, created_at', { count: 'exact' }),
    ]);

    const totalAccounts = profilesRes.count ?? profilesRes.data?.length ?? 0;
    const totalPosts = postsRes.count ?? postsRes.data?.length ?? 0;
    const totalComments = commentsRes.count ?? commentsRes.data?.length ?? 0;
    const rawReports = reportsRes.data || [];

    // Calculate registration trends
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    let newRegistrationsToday = 0;
    let newRegistrations7d = 0;
    let newRegistrations30d = 0;
    let activeUsersCount = 0;

    if (profilesRes.data) {
      for (const p of profilesRes.data) {
        if (p.created_at) {
          const t = new Date(p.created_at).getTime();
          if (t >= oneDayAgo) newRegistrationsToday++;
          if (t >= sevenDaysAgo) newRegistrations7d++;
          if (t >= thirtyDaysAgo) newRegistrations30d++;
        }
        if (p.updated_at) {
          const ut = new Date(p.updated_at).getTime();
          if (ut >= sevenDaysAgo) activeUsersCount++;
        }
      }
    }

    // Reports Breakdown (merging DB records with server resolutions)
    let pendingReports = 0;
    let underReviewReports = 0;
    let resolvedReports = 0;
    let dismissedReports = 0;

    for (const r of rawReports) {
      const resData = store.reportResolutions[r.id];
      const status = resData?.status || r.status || 'pending';
      if (status === 'pending') pendingReports++;
      else if (status === 'under_review') underReviewReports++;
      else if (status === 'resolved') resolvedReports++;
      else if (status === 'dismissed') dismissedReports++;
    }

    // Restricted accounts count
    const restrictionsList = Object.values(store.restrictions);
    const suspendedCount = restrictionsList.filter((r) => r.status === 'suspended').length;
    const disabledCount = restrictionsList.filter((r) => r.status === 'disabled').length;

    // Auto-approve any remaining pending anonymous submissions before computing stats
    await autoApprovePendingAnonymousSubmissions(sb);

    // Anonymous submissions pending count
    let pendingAnonymousCount = 0;
    try {
      const { count: anonCount } = await sb
        .from('anonymous_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      pendingAnonymousCount = anonCount ?? 0;
    } catch {
      pendingAnonymousCount = (store.anonymousSubmissions || []).filter((s) => s.status === 'pending').length;
    }

    res.json({
      success: true,
      stats: {
        totalAccounts,
        activeUsers: activeUsersCount,
        newRegistrationsToday,
        newRegistrations7d,
        newRegistrations30d,
        totalPosts,
        totalComments,
        reports: {
          total: rawReports.length,
          pending: pendingReports,
          underReview: underReviewReports,
          resolved: resolvedReports,
          dismissed: dismissedReports,
        },
        restrictions: {
          suspended: suspendedCount,
          disabled: disabledCount,
        },
        pendingAnonymousCount,
        auditLogsCount: store.auditLogs.length,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error fetching stats';
    res.status(500).json({ success: false, error: msg });
  }
});

// 3. Search & List Users
app.get('/api/admin/users', requireSuperAdmin, async (req, res) => {
  try {
    const search = ((req.query.search as string) || '').trim().toLowerCase();
    const statusFilter = (req.query.status as string) || 'all'; // all, active, suspended, disabled
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
    const limit = Math.min(50, Math.max(10, parseInt((req.query.limit as string) || '20', 10)));
    const offset = (page - 1) * limit;

    const store = readStore();
    const sb = getAdminSupabase(req);

    // Query profiles from Supabase with admin session authority
    let query = sb.from('profiles').select('*', { count: 'exact' });

    if (search) {
      query = query.or(`display_name.ilike.%${search}%,username.ilike.%${search}%,department.ilike.%${search}%,id.eq.${search}`);
    }

    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data: profiles, count, error } = await query;
    if (error) {
      res.status(500).json({ success: false, error: error.message });
      return;
    }

    // Map each profile with its server-managed restriction status
    const users = (profiles || []).map((p: any) => {
      const rest = store.restrictions[p.id];
      const warningsCount = store.warnings.filter((w) => w.userId === p.id).length;

      let accountStatus: 'active' | 'suspended' | 'disabled' = 'active';
      if (rest) {
        if (rest.status === 'suspended') {
          if (rest.suspendedUntil && new Date(rest.suspendedUntil).getTime() < Date.now()) {
            accountStatus = 'active';
          } else {
            accountStatus = 'suspended';
          }
        } else if (rest.status === 'disabled') {
          accountStatus = 'disabled';
        }
      }

      return {
        id: p.id,
        displayName: p.display_name || 'ABSU Student',
        username: p.username ? `@${p.username}` : '@student',
        avatar: p.avatar_url,
        department: p.department || 'Undergraduate',
        level: p.level || '100 Level',
        campus: p.campus || 'Uturu (Main Campus)',
        bio: p.bio || '',
        createdAt: p.created_at,
        accountStatus,
        restrictionDetails: rest || null,
        warningsCount,
      };
    });

    // Apply status filter in-memory if requested
    const filtered = statusFilter === 'all'
      ? users
      : users.filter((u: any) => u.accountStatus === statusFilter);

    res.json({
      success: true,
      users: filtered,
      totalCount: count ?? filtered.length,
      page,
      limit,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error listing users';
    res.status(500).json({ success: false, error: msg });
  }
});

// 4. Detailed User Record
app.get('/api/admin/users/:id', requireSuperAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const store = readStore();
    const sb = getAdminSupabase(req);

    const [profileRes, postsRes, reportsRes] = await Promise.all([
      sb.from('profiles').select('*').eq('id', userId).maybeSingle(),
      sb.from('posts').select('id, body, created_at, visibility').eq('author_id', userId).order('created_at', { ascending: false }).limit(10),
      sb.from('reports').select('*').eq('target_id', userId),
    ]);

    if (!profileRes.data) {
      res.status(404).json({ success: false, error: 'User profile not found.' });
      return;
    }

    const p = profileRes.data;
    const rest = store.restrictions[userId];
    const warnings = store.warnings.filter((w) => w.userId === userId);

    res.json({
      success: true,
      user: {
        id: p.id,
        displayName: p.display_name || 'ABSU Student',
        username: p.username ? `@${p.username}` : '@student',
        avatar: p.avatar_url,
        department: p.department || 'Undergraduate',
        level: p.level || '100 Level',
        campus: p.campus || 'Uturu (Main Campus)',
        bio: p.bio || '',
        createdAt: p.created_at,
        restriction: rest || null,
        warnings,
        posts: postsRes.data || [],
        reportsAgainstUser: reportsRes.data || [],
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error fetching user';
    res.status(500).json({ success: false, error: msg });
  }
});

// 5. Update Account Status (Disable, Reactivate, Suspend, Unsuspend)
app.post('/api/admin/users/:id/status', requireSuperAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const { action, reason, durationHours, restrictions } = req.body;
    const adminUser = (req as any).adminUser;

    if (!action || !['disable', 'reactivate', 'suspend', 'unsuspend'].includes(action)) {
      res.status(400).json({ success: false, error: 'Invalid action provided.' });
      return;
    }

    const store = readStore();

    if (action === 'disable') {
      store.restrictions[userId] = {
        status: 'disabled',
        restrictionReason: reason || 'Account disabled by Super Admin',
        restrictedAt: new Date().toISOString(),
        restrictedBy: adminUser.email,
        restrictions: ['full'],
      };
      appendAuditLog({
        adminEmail: adminUser.email,
        action: 'USER_DISABLE',
        targetId: userId,
        targetType: 'user',
        details: reason || 'Account disabled',
        outcome: 'success',
      });
    } else if (action === 'suspend') {
      const hours = parseInt(durationHours, 10) || 24;
      const suspendedUntil = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
      store.restrictions[userId] = {
        status: 'suspended',
        suspendedUntil,
        restrictionReason: reason || `Suspended for ${hours} hours`,
        restrictedAt: new Date().toISOString(),
        restrictedBy: adminUser.email,
        restrictions: Array.isArray(restrictions) && restrictions.length > 0 ? restrictions : ['posting', 'messaging'],
      };
      appendAuditLog({
        adminEmail: adminUser.email,
        action: 'USER_SUSPEND',
        targetId: userId,
        targetType: 'user',
        details: `Suspended for ${hours}h: ${reason}`,
        outcome: 'success',
      });
    } else if (action === 'reactivate' || action === 'unsuspend') {
      delete store.restrictions[userId];
      appendAuditLog({
        adminEmail: adminUser.email,
        action: 'USER_REACTIVATE',
        targetId: userId,
        targetType: 'user',
        details: `Restored account access: ${reason || 'Status cleared'}`,
        outcome: 'success',
      });
    }

    writeStore(store);

    res.json({
      success: true,
      message: `Account status successfully updated to ${action}.`,
      currentStatus: store.restrictions[userId] || { status: 'active' },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error updating account status';
    res.status(500).json({ success: false, error: msg });
  }
});

// 6. Send Warning & Notify User
app.post('/api/admin/users/:id/warn', requireSuperAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const { reason, category } = req.body;
    const adminUser = (req as any).adminUser;

    if (!reason || !reason.trim()) {
      res.status(400).json({ success: false, error: 'Warning reason is required.' });
      return;
    }

    const store = readStore();
    const warningId = `warn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    store.warnings.unshift({
      id: warningId,
      userId,
      reason: reason.trim(),
      adminEmail: adminUser.email,
      createdAt: new Date().toISOString(),
    });
    writeStore(store);

    // Also insert real notification into Supabase notifications table
    try {
      await supabaseClient.from('notifications').insert({
        recipient_id: userId,
        type: 'campus_notice',
        title: 'Official Community Warning',
        body: reason.trim(),
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Could not insert notification:', e);
    }

    appendAuditLog({
      adminEmail: adminUser.email,
      action: 'USER_WARN',
      targetId: userId,
      targetType: 'user',
      details: `[${category || 'General'}] ${reason.trim()}`,
      outcome: 'success',
    });

    res.json({
      success: true,
      message: 'Administrative warning successfully recorded and sent to student.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error sending warning';
    res.status(500).json({ success: false, error: msg });
  }
});

// 7. Trigger Password Recovery
app.post('/api/admin/users/:id/password-recovery', requireSuperAdmin, async (req, res) => {
  try {
    const { email } = req.body;
    const adminUser = (req as any).adminUser;

    if (!email || !email.includes('@')) {
      res.status(400).json({ success: false, error: 'Valid user email is required.' });
      return;
    }

    // Trigger standard Supabase password reset email
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${req.protocol}://${req.get('host')}/?view=reset-password`,
    });

    if (error) {
      appendAuditLog({
        adminEmail: adminUser.email,
        action: 'PASSWORD_RECOVERY_TRIGGER',
        targetId: req.params.id,
        targetType: 'user',
        details: `Failed: ${error.message}`,
        outcome: 'failed',
      });
      res.status(400).json({ success: false, error: error.message });
      return;
    }

    appendAuditLog({
      adminEmail: adminUser.email,
      action: 'PASSWORD_RECOVERY_TRIGGER',
      targetId: req.params.id,
      targetType: 'user',
      details: `Password recovery sent to ${email}`,
      outcome: 'success',
    });

    res.json({
      success: true,
      message: `Password reset email successfully sent to ${email}.`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error triggering password recovery';
    res.status(500).json({ success: false, error: msg });
  }
});

// 8. Permanently Delete User Account (Double Confirmed)
app.post('/api/admin/users/:id/delete', requireSuperAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const { confirmationText } = req.body;
    const adminUser = (req as any).adminUser;

    if (!confirmationText || confirmationText.trim().toUpperCase() !== 'DELETE') {
      res.status(400).json({
        success: false,
        error: 'Confirmation text must be explicitly typed as "DELETE".',
      });
      return;
    }

    console.log(`[Admin] Initiating permanent user deletion for ID: ${userId}...`);

    // Clean up all related tables to maintain relational integrity
    await Promise.allSettled([
      supabaseClient.from('post_reactions').delete().eq('user_id', userId),
      supabaseClient.from('comments').delete().eq('author_id', userId),
      supabaseClient.from('post_media').delete().eq('uploader_id', userId),
      supabaseClient.from('posts').delete().eq('author_id', userId),
      supabaseClient.from('friendships').delete().or(`requester_id.eq.${userId},addressee_id.eq.${userId}`),
      supabaseClient.from('messages').delete().eq('sender_id', userId),
      supabaseClient.from('conversation_members').delete().eq('user_id', userId),
      supabaseClient.from('notifications').delete().eq('recipient_id', userId),
      supabaseClient.from('reports').delete().or(`reporter_id.eq.${userId},target_id.eq.${userId}`),
      supabaseClient.from('profiles').delete().eq('id', userId),
    ]);

    // If Supabase Service Role is available, permanently delete from Supabase Auth
    let authDeleted = false;
    if (supabaseAdmin) {
      try {
        const { error: adminAuthErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
        if (!adminAuthErr) authDeleted = true;
      } catch (authErr) {
        console.warn('[Admin] Auth deleteUser error:', authErr);
      }
    }

    // Clean up server restriction store
    const store = readStore();
    delete store.restrictions[userId];
    writeStore(store);

    appendAuditLog({
      adminEmail: adminUser.email,
      action: 'USER_DELETE',
      targetId: userId,
      targetType: 'user',
      details: `Permanent deletion completed. Auth deleted: ${authDeleted}`,
      outcome: 'success',
    });

    res.json({
      success: true,
      message: 'User account and associated application records permanently deleted.',
      authDeleted,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error deleting user';
    res.status(500).json({ success: false, error: msg });
  }
});

// 9. Invitations & Account Access
app.get('/api/admin/invitations', requireSuperAdmin, (req, res) => {
  const store = readStore();
  res.json({ success: true, invitations: store.invitations });
});

app.post('/api/admin/invitations', requireSuperAdmin, async (req, res) => {
  try {
    const { email } = req.body;
    const adminUser = (req as any).adminUser;

    if (!email || !email.includes('@')) {
      res.status(400).json({ success: false, error: 'Valid student email required.' });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const store = readStore();

    // Check if already invited
    const existing = store.invitations.find((inv) => inv.email === cleanEmail);
    if (existing) {
      res.status(400).json({
        success: false,
        error: `An invitation for ${cleanEmail} was already created on ${new Date(existing.invitedAt).toLocaleDateString()}.`,
      });
      return;
    }

    let authInviteSuccess = false;
    let authInviteNotice = '';

    if (supabaseAdmin) {
      try {
        const { error: invErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(cleanEmail);
        if (!invErr) authInviteSuccess = true;
        else authInviteNotice = invErr.message;
      } catch (e: any) {
        authInviteNotice = e?.message || 'Auth invite call failed';
      }
    }

    const newInv = {
      id: `inv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      email: cleanEmail,
      invitedBy: adminUser.email,
      invitedAt: new Date().toISOString(),
      status: 'sent' as const,
    };

    store.invitations.unshift(newInv);
    writeStore(store);

    appendAuditLog({
      adminEmail: adminUser.email,
      action: 'USER_INVITE',
      targetId: cleanEmail,
      targetType: 'invitation',
      details: authInviteSuccess ? 'Invited via Supabase Auth Admin' : 'Recorded in campus invitation registry',
      outcome: 'success',
    });

    res.json({
      success: true,
      message: `Invitation successfully created for ${cleanEmail}.`,
      invitation: newInv,
      authInviteNotice: authInviteNotice || undefined,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error creating invitation';
    res.status(500).json({ success: false, error: msg });
  }
});

app.post('/api/admin/invitations/:id/resend', requireSuperAdmin, async (req, res) => {
  try {
    const invId = req.params.id;
    const store = readStore();
    const inv = store.invitations.find((i) => i.id === invId);

    if (!inv) {
      res.status(404).json({ success: false, error: 'Invitation not found.' });
      return;
    }

    inv.invitedAt = new Date().toISOString();
    writeStore(store);

    appendAuditLog({
      adminEmail: (req as any).adminUser.email,
      action: 'INVITATION_RESEND',
      targetId: inv.email,
      targetType: 'invitation',
      details: `Resent invitation to ${inv.email}`,
      outcome: 'success',
    });

    res.json({ success: true, message: `Invitation resent to ${inv.email}.` });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error resending invitation';
    res.status(500).json({ success: false, error: msg });
  }
});

// 10. Reports & Complaints Management
app.get('/api/admin/reports', requireSuperAdmin, async (req, res) => {
  try {
    const status = (req.query.status as string) || 'all'; // all, pending, under_review, resolved, dismissed
    const store = readStore();
    const sb = getAdminSupabase(req);

    const { data: rawReports, error } = await sb
      .from('reports')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[Admin API] Reports query error:', error.message);
    }

    // Enrich reports with resolution state and reporter/target summaries
    const enriched = await Promise.all(
      (rawReports || []).map(async (r: any) => {
        const resData = store.reportResolutions[r.id];
        const effectiveStatus = resData?.status || r.status || 'pending';

        // Fetch basic info for reporter and target if possible
        let reporterInfo = null;
        let targetInfo = null;

        if (r.reporter_id) {
          const { data: rep } = await sb
            .from('profiles')
            .select('id, display_name, username')
            .eq('id', r.reporter_id)
            .maybeSingle();
          if (rep) reporterInfo = rep;
        }

        if (r.target_type === 'post' && r.target_id) {
          const { data: post } = await sb
            .from('posts')
            .select('id, body, author_id, created_at')
            .eq('id', r.target_id)
            .maybeSingle();
          if (post) targetInfo = post;
        } else if (r.target_type === 'user' && r.target_id) {
          const { data: u } = await sb
            .from('profiles')
            .select('id, display_name, username')
            .eq('id', r.target_id)
            .maybeSingle();
          if (u) targetInfo = u;
        }

        return {
          id: r.id,
          reporterId: r.reporter_id,
          reporter: reporterInfo,
          targetId: r.target_id,
          targetType: r.target_type,
          target: targetInfo,
          reason: r.reason,
          createdAt: r.created_at,
          status: effectiveStatus,
          resolutionNotes: resData?.resolutionNotes,
          actionTaken: resData?.actionTaken,
          resolvedBy: resData?.resolvedBy,
          resolvedAt: resData?.resolvedAt,
        };
      })
    );

    const filtered = status === 'all'
      ? enriched
      : enriched.filter((r) => r.status === status);

    res.json({ success: true, reports: filtered });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error fetching reports';
    res.status(500).json({ success: false, error: msg });
  }
});

app.patch('/api/admin/reports/:id', requireSuperAdmin, async (req, res) => {
  try {
    const reportId = req.params.id;
    const { status, notes, actionTaken } = req.body;
    const adminUser = (req as any).adminUser;
    const sb = getAdminSupabase(req);

    if (!['pending', 'under_review', 'resolved', 'dismissed'].includes(status)) {
      res.status(400).json({ success: false, error: 'Invalid report status.' });
      return;
    }

    const store = readStore();
    store.reportResolutions[reportId] = {
      status,
      resolutionNotes: notes || '',
      actionTaken: actionTaken || 'None',
      resolvedBy: adminUser.email,
      resolvedAt: new Date().toISOString(),
    };
    writeStore(store);

    // Update in Supabase reports table if possible
    try {
      await sb
        .from('reports')
        .update({ status })
        .eq('id', reportId);
    } catch (e) {
      console.warn('Could not update reports in DB:', e);
    }

    appendAuditLog({
      adminEmail: adminUser.email,
      action: 'REPORT_RESOLVE',
      targetId: reportId,
      targetType: 'report',
      details: `Status set to ${status}. Action: ${actionTaken || 'None'}. Notes: ${notes || ''}`,
      outcome: 'success',
    });

    res.json({
      success: true,
      message: `Report marked as ${status}.`,
      resolution: store.reportResolutions[reportId],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error updating report';
    res.status(500).json({ success: false, error: msg });
  }
});

// 11. Content Moderation (Browse & Moderate Posts)
app.get('/api/admin/content/posts', requireSuperAdmin, async (req, res) => {
  try {
    const search = ((req.query.search as string) || '').trim().toLowerCase();
    const store = readStore();
    const sb = getAdminSupabase(req);

    let query = sb
      .from('posts')
      .select(`
        *,
        author:profiles!posts_author_id_fkey(*),
        post_media(*)
      `)
      .order('created_at', { ascending: false })
      .limit(50);

    const { data: posts, error } = await query;
    if (error) {
      console.warn('[Admin API] Content posts query error:', error.message);
    }

    await resolveServerPostMediaSignedUrls(sb, posts || []);

    // Attach report counts and hidden flags
    let results = (posts || []).map((post: any) => {
      const mod = store.moderatedPosts?.[post.id];
      const isHidden = (mod?.action === 'hide') || (post.visibility === 'hidden') || Boolean(post.is_hidden);
      const isDeleted = mod?.action === 'delete';
      return {
        id: post.id,
        body: post.body,
        visibility: isHidden ? 'hidden' : post.visibility,
        isHidden,
        isDeleted,
        createdAt: post.created_at,
        author: post.author
          ? {
              id: post.author.id,
              name: post.author.display_name || 'ABSU Student',
              handle: post.author.username ? `@${post.author.username}` : '@student',
              avatar: post.author.avatar_url,
            }
          : { id: post.author_id, name: 'Student', handle: '@student' },
        media: post.post_media || [],
      };
    }).filter((p: any) => !p.isDeleted);

    if (search) {
      results = results.filter((p: any) => p.body?.toLowerCase().includes(search));
    }

    res.json({ success: true, posts: results });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error fetching posts';
    res.status(500).json({ success: false, error: msg });
  }
});

app.post('/api/admin/content/posts/:id/moderate', requireSuperAdmin, async (req, res) => {
  try {
    const postId = req.params.id;
    const { action, reason } = req.body; // hide, restore, delete
    const adminUser = (req as any).adminUser;
    const sb = getAdminSupabase(req);
    const store = readStore();

    if (!['hide', 'restore', 'delete'].includes(action)) {
      res.status(400).json({ success: false, error: 'Invalid moderation action.' });
      return;
    }

    if (!store.moderatedPosts) store.moderatedPosts = {};
    store.moderatedPosts[postId] = {
      action,
      reason: reason || `Post ${action}d by Super Admin`,
      moderatedAt: new Date().toISOString(),
      moderatedBy: adminUser.email,
    };
    writeStore(store);

    if (action === 'hide') {
      try {
        await sb.from('posts').update({ visibility: 'hidden' }).eq('id', postId);
      } catch (err) {
        console.warn('[Admin API] DB hide update warning:', err);
      }
      appendAuditLog({
        adminEmail: adminUser.email,
        action: 'POST_HIDE',
        targetId: postId,
        targetType: 'post',
        details: reason || 'Post hidden from feed',
        outcome: 'success',
      });
      res.json({ success: true, message: 'Post hidden from campus feed.' });
    } else if (action === 'restore') {
      delete store.moderatedPosts[postId];
      writeStore(store);
      try {
        await sb.from('posts').update({ visibility: 'public' }).eq('id', postId);
      } catch (err) {
        console.warn('[Admin API] DB restore update warning:', err);
      }
      appendAuditLog({
        adminEmail: adminUser.email,
        action: 'POST_RESTORE',
        targetId: postId,
        targetType: 'post',
        details: reason || 'Post restored to public visibility',
        outcome: 'success',
      });
      res.json({ success: true, message: 'Post visibility restored.' });
    } else if (action === 'delete') {
      let dbDeleteWarning: string | undefined;
      try {
        const isTestCleanup = typeof reason === 'string' && reason.includes('Clean up automated verification test post');
        if (isTestCleanup) {
          await sb.from('anonymous_submissions').delete().eq('published_post_id', postId);
        } else {
          // Transition to rejected & clear published_post_id to satisfy anonymous_submissions_check before deleting post
          const { error: subUpErr } = await sb
            .from('anonymous_submissions')
            .update({ status: 'rejected', published_post_id: null })
            .eq('published_post_id', postId);
          if (subUpErr) {
            await sb.from('anonymous_submissions').delete().eq('published_post_id', postId);
          }
        }

        await Promise.allSettled([
          sb.from('post_media').delete().eq('post_id', postId),
          sb.from('post_reactions').delete().eq('post_id', postId),
          sb.from('comments').delete().eq('post_id', postId),
        ]);
        const { error: delErr } = await sb.from('posts').delete().eq('id', postId);
        if (delErr) {
          dbDeleteWarning = delErr.message;
          console.warn('[Admin API] DB post delete warning:', delErr.message);
          await sb.from('posts').update({ visibility: 'hidden' }).eq('id', postId);
        }
      } catch (err: unknown) {
        dbDeleteWarning = err instanceof Error ? err.message : 'DB delete error';
        console.warn('[Admin API] DB delete warning:', err);
      }

      appendAuditLog({
        adminEmail: adminUser.email,
        action: 'POST_DELETE',
        targetId: postId,
        targetType: 'post',
        details: reason || 'Post permanently deleted by admin',
        outcome: 'success',
      });
      res.json({ success: true, message: 'Post permanently removed.', warning: dbDeleteWarning });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error moderating post';
    res.status(500).json({ success: false, error: msg });
  }
});

// 12. Announcements Management
app.get('/api/admin/announcements', requireSuperAdmin, (req, res) => {
  const store = readStore();
  res.json({ success: true, announcements: store.announcements });
});

app.post('/api/admin/announcements', requireSuperAdmin, async (req, res) => {
  try {
    const { title, body, isBroadcast, isPinned, publishToFeed } = req.body;
    const adminUser = (req as any).adminUser;

    if (!title?.trim() || !body?.trim()) {
      res.status(400).json({ success: false, error: 'Title and content are required.' });
      return;
    }

    const store = readStore();
    const id = `ann_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const announcement = {
      id,
      title: title.trim(),
      body: body.trim(),
      authorName: 'ABSU Connect Administration',
      createdAt: new Date().toISOString(),
      isBroadcast: Boolean(isBroadcast),
      isPinned: Boolean(isPinned),
    };

    store.announcements.unshift(announcement);

    // If marked as broadcast banner, update broadcast setting
    if (isBroadcast) {
      store.platformSettings.broadcastBanner = {
        active: true,
        text: `📢 ${title.trim()}: ${body.trim().slice(0, 100)}`,
        type: 'info',
      };
    }

    // Publish to feed as a real campus post
    if (publishToFeed !== false) {
      try {
        const sb = getAdminSupabase(req);
        await sb.from('posts').insert({
          author_id: adminUser.id,
          body: `📢 OFFICIAL ABSU CONNECT ANNOUNCEMENT:\n\n${title.trim().toUpperCase()}\n\n${body.trim()}\n\n#announcement #campus`,
          visibility: 'campus',
          created_at: new Date().toISOString(),
        });
      } catch (e) {
        console.warn('Could not publish announcement to posts:', e);
      }
    }

    writeStore(store);

    appendAuditLog({
      adminEmail: adminUser.email,
      action: 'ANNOUNCEMENT_PUBLISH',
      targetId: id,
      targetType: 'announcement',
      details: `Published "${title.trim()}" (broadcast=${isBroadcast})`,
      outcome: 'success',
    });

    res.json({ success: true, announcement });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error creating announcement';
    res.status(500).json({ success: false, error: msg });
  }
});

app.delete('/api/admin/announcements/:id', requireSuperAdmin, (req, res) => {
  const store = readStore();
  store.announcements = store.announcements.filter((a) => a.id !== req.params.id);
  writeStore(store);
  appendAuditLog({
    adminEmail: (req as any).adminUser.email,
    action: 'ANNOUNCEMENT_DELETE',
    targetId: req.params.id,
    targetType: 'announcement',
    outcome: 'success',
  });
  res.json({ success: true, message: 'Announcement deleted.' });
});

// 13. Anonymous Posts Moderation & Batch Approval
app.get('/api/admin/anonymous/submissions', requireSuperAdmin, async (req, res) => {
  try {
    const sb = getAdminSupabase(req);
    await autoApprovePendingAnonymousSubmissions(sb);
    const store = readStore();
    const statusFilter = ((req.query.status as string) || 'all').toLowerCase();

    let dbSubs: any[] = [];
    try {
      let query = sb
        .from('anonymous_submissions')
        .select('id, page_id, body, status, created_at, updated_at, reviewed_at, published_post_id')
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        dbSubs = data;
      }
    } catch (e) {
      console.warn('[Admin API] DB fetch submissions error:', e);
    }

    const storeSubs = store.anonymousSubmissions || [];
    const mergedMap = new Map<string, any>();

    for (const s of dbSubs) {
      mergedMap.set(s.id, s);
    }

    for (const s of storeSubs) {
      if (statusFilter === 'all' || s.status === statusFilter) {
        mergedMap.set(s.id, { ...(mergedMap.get(s.id) || {}), ...s });
      }
    }

    const allList = Array.from(mergedMap.values()).sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );

    const pendingCount = allList.filter((s) => s.status === 'pending').length;
    const approvedCount = allList.filter((s) => s.status === 'approved').length;
    const rejectedCount = allList.filter((s) => s.status === 'rejected').length;

    res.json({
      success: true,
      submissions: allList,
      totalCount: allList.length,
      pendingCount,
      approvedCount,
      rejectedCount,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error fetching anonymous submissions';
    res.status(500).json({ success: false, error: msg });
  }
});

app.post('/api/admin/anonymous/review', requireSuperAdmin, async (req, res) => {
  try {
    const sb = getAdminSupabase(req);
    const adminUser = (req as any).adminUser;
    const store = readStore();
    const { submissionId, decision, rejectionReason } = req.body;

    if (!submissionId || !['approved', 'rejected'].includes(decision)) {
      res.status(400).json({ success: false, error: 'submissionId and valid decision ("approved" | "rejected") required.' });
      return;
    }

    const nowIso = new Date().toISOString();
    let subBody = '';

    try {
      const { data: dbSub } = await sb
        .from('anonymous_submissions')
        .select('*')
        .eq('id', submissionId)
        .maybeSingle();
      if (dbSub?.body) subBody = dbSub.body;
    } catch (e) {
      console.warn('[Admin API] DB lookup error:', e);
    }

    if (!subBody && store.anonymousSubmissions) {
      const stSub = store.anonymousSubmissions.find((s) => s.id === submissionId);
      if (stSub) subBody = stSub.body;
    }

    if (!subBody) {
      res.status(404).json({ success: false, error: 'Submission not found.' });
      return;
    }

    let publishedPostId: string | undefined;

    if (decision === 'approved') {
      try {
        const { data: newPost } = await sb
          .from('posts')
          .insert({
            body: subBody,
            author_id: MR_ANONYMOUS_DUMMY_ID,
            page_id: MR_ANONYMOUS_PAGE_ID,
            visibility: 'public',
            created_at: nowIso,
            updated_at: nowIso,
          })
          .select('id')
          .single();

        if (newPost) publishedPostId = newPost.id;
      } catch (err) {
        console.warn('[Admin API] Error publishing post row:', err);
      }

      try {
        await sb
          .from('anonymous_submissions')
          .update({
            status: 'approved',
            reviewed_by: adminUser.id,
            reviewed_at: nowIso,
            published_post_id: publishedPostId,
            updated_at: nowIso,
          })
          .eq('id', submissionId);
      } catch (e) {
        console.warn('[Admin API] Error updating submission DB row:', e);
      }

      appendAuditLog({
        adminEmail: adminUser.email,
        action: 'ANONYMOUS_POST_APPROVE',
        targetId: submissionId,
        targetType: 'anonymous_submission',
        details: 'Approved and published anonymous post to Mr Anonymous feed',
        outcome: 'success',
      });
    } else {
      try {
        await sb
          .from('anonymous_submissions')
          .update({
            status: 'rejected',
            reviewed_by: adminUser.id,
            reviewed_at: nowIso,
            updated_at: nowIso,
          })
          .eq('id', submissionId);
      } catch (e) {
        console.warn('[Admin API] Error updating submission DB row to rejected:', e);
      }

      appendAuditLog({
        adminEmail: adminUser.email,
        action: 'ANONYMOUS_POST_REJECT',
        targetId: submissionId,
        targetType: 'anonymous_submission',
        details: rejectionReason || 'Rejected anonymous post submission',
        outcome: 'success',
      });
    }

    if (!store.anonymousSubmissions) store.anonymousSubmissions = [];
    const existing = store.anonymousSubmissions.find((s) => s.id === submissionId);
    if (existing) {
      existing.status = decision;
      existing.reviewed_at = nowIso;
      existing.reviewed_by = adminUser.email;
      if (publishedPostId) existing.published_post_id = publishedPostId;
    } else {
      store.anonymousSubmissions.unshift({
        id: submissionId,
        body: subBody,
        status: decision,
        created_at: nowIso,
        reviewed_at: nowIso,
        reviewed_by: adminUser.email,
        published_post_id: publishedPostId,
      });
    }
    writeStore(store);

    res.json({
      success: true,
      message: decision === 'approved' ? 'Submission approved and published to Mr Anonymous!' : 'Submission rejected and archived.',
      postId: publishedPostId,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error reviewing submission';
    res.status(500).json({ success: false, error: msg });
  }
});

// Batch Approve All Pending Anonymous Submissions
app.post('/api/admin/anonymous/approve-all', requireSuperAdmin, async (req, res) => {
  try {
    const sb = getAdminSupabase(req);
    const adminUser = (req as any).adminUser;
    const store = readStore();

    let pendingSubs: Array<{ id: string; body: string; page_id?: string; created_at?: string }> = [];

    try {
      const { data, error } = await sb
        .from('anonymous_submissions')
        .select('id, page_id, body, status, created_at')
        .eq('status', 'pending');
      if (!error && Array.isArray(data)) {
        pendingSubs = data;
      }
    } catch (e) {
      console.warn('[Admin API] DB fetch pending warning:', e);
    }

    if (Array.isArray(store.anonymousSubmissions)) {
      for (const s of store.anonymousSubmissions) {
        if (s.status === 'pending' && !pendingSubs.some((p: any) => p.id === s.id)) {
          pendingSubs.push(s);
        }
      }
    }

    if (pendingSubs.length === 0) {
      res.json({ success: true, count: 0, message: 'No pending anonymous submissions to approve.' });
      return;
    }

    const nowIso = new Date().toISOString();
    let approvedCount = 0;

    for (const sub of pendingSubs) {
      let publishedPostId: string | undefined;
      try {
        const { data: newPost } = await sb
          .from('posts')
          .insert({
            body: sub.body,
            author_id: MR_ANONYMOUS_DUMMY_ID,
            page_id: MR_ANONYMOUS_PAGE_ID,
            visibility: 'public',
            created_at: nowIso,
            updated_at: nowIso,
          })
          .select('id')
          .single();

        if (newPost) publishedPostId = newPost.id;
      } catch (err) {
        console.warn('[Admin API] Error batch inserting approved post:', err);
      }

      try {
        await sb
          .from('anonymous_submissions')
          .update({
            status: 'approved',
            reviewed_by: adminUser.id,
            reviewed_at: nowIso,
            published_post_id: publishedPostId,
            updated_at: nowIso,
          })
          .eq('id', sub.id);
      } catch (err) {
        console.warn('[Admin API] Error batch updating submission row:', err);
      }

      if (!store.anonymousSubmissions) store.anonymousSubmissions = [];
      const storeItem = store.anonymousSubmissions.find((s) => s.id === sub.id);
      if (storeItem) {
        storeItem.status = 'approved';
        storeItem.reviewed_at = nowIso;
        storeItem.reviewed_by = adminUser.email;
        storeItem.published_post_id = publishedPostId;
      } else {
        store.anonymousSubmissions.unshift({
          id: sub.id,
          body: sub.body,
          status: 'approved',
          created_at: sub.created_at || nowIso,
          reviewed_at: nowIso,
          reviewed_by: adminUser.email,
          published_post_id: publishedPostId,
        });
      }

      approvedCount++;
    }

    writeStore(store);

    appendAuditLog({
      adminEmail: adminUser.email,
      action: 'ANONYMOUS_POSTS_APPROVE_ALL',
      targetType: 'anonymous_submissions',
      details: `Batch approved and published all ${approvedCount} pending anonymous submissions`,
      outcome: 'success',
    });

    res.json({
      success: true,
      count: approvedCount,
      message: `Approved and published all ${approvedCount} pending anonymous submissions!`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error approving all anonymous submissions';
    res.status(500).json({ success: false, error: msg });
  }
});

// 14. System Status & Connectivity Check
app.get('/api/admin/system/status', requireSuperAdmin, async (req, res) => {
  const tStart = Date.now();
  let dbOk = false;
  let dbLatency = 0;
  let storagePostMediaOk = false;
  let storageChatOk = false;
  const sb = getAdminSupabase(req);

  try {
    const { error: pErr } = await sb.from('profiles').select('id').limit(1);
    dbLatency = Date.now() - tStart;
    dbOk = !pErr;
  } catch {
    dbOk = false;
  }

  try {
    const { error: smErr } = await sb.storage.from('post-media').list('', { limit: 1 });
    storagePostMediaOk = !smErr;
  } catch {
    storagePostMediaOk = false;
  }

  try {
    const { error: scErr } = await sb.storage.from('chat-attachments').list('', { limit: 1 });
    storageChatOk = !scErr;
  } catch {
    storageChatOk = false;
  }

  const store = readStore();

  res.json({
    success: true,
    status: {
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      database: {
        healthy: dbOk,
        latencyMs: dbLatency,
        endpoint: SUPABASE_PROJECT_URL,
      },
      storage: {
        healthy: storagePostMediaOk && storageChatOk,
        buckets: {
          'post-media': storagePostMediaOk ? 'accessible' : 'error',
          'chat-attachments': storageChatOk ? 'accessible' : 'error',
        },
      },
      auth: {
        healthy: true,
        superAdminConfigured: SUPER_ADMIN_EMAIL,
        authorizedAdmins: AUTHORIZED_SUPER_ADMIN_EMAILS,
        serviceRoleKeyConfigured: Boolean(supabaseAdmin),
      },
      environment: {
        nodeVersion: process.version,
        memoryUsageMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
      },
      moderation: {
        moderatedPostsCount: Object.keys(store.moderatedPosts || {}).length,
        restrictionsCount: Object.keys(store.restrictions || {}).length,
      },
    },
  });
});

// 14. Audit Logs (Append-Only)
app.get('/api/admin/audit-logs', requireSuperAdmin, (req, res) => {
  const store = readStore();
  const limit = Math.min(100, parseInt((req.query.limit as string) || '50', 10));
  res.json({
    success: true,
    logs: store.auditLogs.slice(0, limit),
    total: store.auditLogs.length,
  });
});

// 15. Platform Settings
app.get('/api/admin/settings', requireSuperAdmin, (req, res) => {
  const store = readStore();
  res.json({ success: true, settings: store.platformSettings });
});

app.post('/api/admin/settings', requireSuperAdmin, (req, res) => {
  try {
    const store = readStore();
    const { maintenanceMode, maintenanceMessage, broadcastBanner, features } = req.body;
    const adminUser = (req as any).adminUser;

    if (maintenanceMode !== undefined) store.platformSettings.maintenanceMode = Boolean(maintenanceMode);
    if (maintenanceMessage !== undefined) store.platformSettings.maintenanceMessage = String(maintenanceMessage);
    if (broadcastBanner !== undefined) store.platformSettings.broadcastBanner = broadcastBanner;
    if (features !== undefined) store.platformSettings.features = { ...store.platformSettings.features, ...features };

    writeStore(store);

    appendAuditLog({
      adminEmail: adminUser.email,
      action: 'SYSTEM_SETTINGS_UPDATE',
      details: `Updated settings (maintenance=${store.platformSettings.maintenanceMode})`,
      outcome: 'success',
    });

    res.json({ success: true, settings: store.platformSettings });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error updating settings';
    res.status(500).json({ success: false, error: msg });
  }
});

// -------------------------------------------------------------
// PUBLIC CONTENT MODERATION & USER RESTRICTION ENFORCEMENT
// -------------------------------------------------------------

// Active moderated posts feed synchronization
app.get('/api/content/moderated-posts', (_req, res) => {
  const store = readStore();
  res.json({
    success: true,
    moderated: store.moderatedPosts || {},
  });
});

// User session restriction check (for lockout & warning enforcement)
app.get('/api/users/me/restriction', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    res.json({ isRestricted: false });
    return;
  }

  try {
    const { data, error } = await supabaseClient.auth.getUser(token);
    if (error || !data?.user) {
      res.json({ isRestricted: false });
      return;
    }

    const store = readStore();
    const rest = store.restrictions[data.user.id];
    if (rest) {
      if (rest.status === 'suspended' && rest.suspendedUntil && new Date(rest.suspendedUntil).getTime() < Date.now()) {
        // Auto-expired suspension
        delete store.restrictions[data.user.id];
        writeStore(store);
        res.json({ isRestricted: false });
        return;
      }
      res.json({ isRestricted: true, restriction: rest });
      return;
    }
    res.json({ isRestricted: false });
  } catch {
    res.json({ isRestricted: false });
  }
});

// -------------------------------------------------------------
// SERVER-AUTHORITATIVE POSTS FEED & PRIVACY RESOLUTION
// Ensures previous posts (public, campus, friends, community, anonymous)
// load reliably for both new and existing users while strictly enforcing
// friends-only privacy, private community membership, blocks, and moderation.
// -------------------------------------------------------------

async function resolveOptionalAuthUser(req: Request): Promise<{ id: string; email?: string } | null> {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  try {
    const { data, error } = await supabaseClient.auth.getUser(token);
    if (error || !data?.user) return null;
    return { id: data.user.id, email: data.user.email || undefined };
  } catch {
    return null;
  }
}

interface ViewerSocialContext {
  friendIds: Set<string>;
  blockedIds: Set<string>;
  memberCommunityIds: Set<string>;
  savedPostIds: Set<string>;
}

async function getViewerSocialContext(sb: any, viewerId: string | null): Promise<ViewerSocialContext> {
  const ctx: ViewerSocialContext = {
    friendIds: new Set<string>(),
    blockedIds: new Set<string>(),
    memberCommunityIds: new Set<string>(),
    savedPostIds: new Set<string>(),
  };
  if (!sb || !viewerId) return ctx;

  const [friendsRes, blocksRes, membershipsRes, savedRes] = await Promise.allSettled([
    sb
      .from('friendships')
      .select('requester_id, addressee_id, status')
      .or(`requester_id.eq.${viewerId},addressee_id.eq.${viewerId}`)
      .eq('status', 'accepted'),
    sb
      .from('user_blocks')
      .select('blocker_id, blocked_id')
      .or(`blocker_id.eq.${viewerId},blocked_id.eq.${viewerId}`),
    sb
      .from('community_members')
      .select('*')
      .eq('user_id', viewerId),
    sb
      .from('saved_posts')
      .select('post_id')
      .eq('user_id', viewerId),
  ]);

  if (friendsRes.status === 'fulfilled' && !friendsRes.value.error && Array.isArray(friendsRes.value.data)) {
    for (const f of friendsRes.value.data) {
      if (f.requester_id === viewerId && f.addressee_id) ctx.friendIds.add(f.addressee_id);
      else if (f.addressee_id === viewerId && f.requester_id) ctx.friendIds.add(f.requester_id);
    }
  }

  if (blocksRes.status === 'fulfilled' && !blocksRes.value.error && Array.isArray(blocksRes.value.data)) {
    for (const b of blocksRes.value.data) {
      if (b.blocker_id === viewerId && b.blocked_id) ctx.blockedIds.add(b.blocked_id);
      if (b.blocked_id === viewerId && b.blocker_id) ctx.blockedIds.add(b.blocker_id);
    }
  }

  if (membershipsRes.status === 'fulfilled' && !membershipsRes.value.error && Array.isArray(membershipsRes.value.data)) {
    for (const m of membershipsRes.value.data) {
      const mStatus = String(m.status || m.membership_status || 'active').toLowerCase();
      if (m.community_id && (mStatus === 'active' || mStatus === 'approved')) {
        ctx.memberCommunityIds.add(m.community_id);
      }
    }
  }

  if (savedRes.status === 'fulfilled' && !savedRes.value.error && Array.isArray(savedRes.value.data)) {
    for (const s of savedRes.value.data) {
      if (s.post_id) ctx.savedPostIds.add(s.post_id);
    }
  }

  return ctx;
}

const POST_RICH_SELECT = `
  *,
  author:profiles!posts_author_id_fkey(*),
  page:pages(*),
  community:communities(*),
  post_media(*),
  post_reactions(*),
  comments(id)
`;

async function queryPostsResilient(
  sb: any,
  applyFilters: (query: any) => any
): Promise<{ rows: any[]; error?: string }> {
  const primaryQuery = applyFilters(sb.from('posts').select(POST_RICH_SELECT));
  const { data, error } = await primaryQuery;
  if (!error) {
    return { rows: data || [] };
  }

  console.warn('[Posts API] Rich select fallback triggered:', error.message);

  // Fallback: query base posts table first, then batch-hydrate related tables safely
  const baseQuery = applyFilters(sb.from('posts').select('*'));
  const { data: baseRows, error: baseErr } = await baseQuery;
  if (baseErr) {
    return { rows: [], error: baseErr.message };
  }

  const rows = baseRows || [];
  if (rows.length === 0) return { rows: [] };

  const postIds = Array.from(new Set(rows.map((r: any) => r.id).filter(Boolean)));
  const authorIds = Array.from(new Set(rows.map((r: any) => r.author_id).filter(Boolean)));
  const pageIds = Array.from(new Set(rows.map((r: any) => r.page_id).filter(Boolean)));
  const communityIds = Array.from(new Set(rows.map((r: any) => r.community_id).filter(Boolean)));

  const [authorsRes, pagesRes, commsRes, mediaRes, reactionsRes, commentsRes] = await Promise.allSettled([
    authorIds.length > 0 ? sb.from('profiles').select('*').in('id', authorIds) : Promise.resolve({ data: [] }),
    pageIds.length > 0 ? sb.from('pages').select('*').in('id', pageIds) : Promise.resolve({ data: [] }),
    communityIds.length > 0 ? sb.from('communities').select('*').in('id', communityIds) : Promise.resolve({ data: [] }),
    postIds.length > 0 ? sb.from('post_media').select('*').in('post_id', postIds) : Promise.resolve({ data: [] }),
    postIds.length > 0 ? sb.from('post_reactions').select('*').in('post_id', postIds) : Promise.resolve({ data: [] }),
    postIds.length > 0 ? sb.from('comments').select('id, post_id').in('post_id', postIds) : Promise.resolve({ data: [] }),
  ]);

  const authorMap = new Map<string, any>();
  if (authorsRes.status === 'fulfilled' && Array.isArray((authorsRes.value as any).data)) {
    for (const a of (authorsRes.value as any).data) authorMap.set(a.id, a);
  }
  const pageMap = new Map<string, any>();
  if (pagesRes.status === 'fulfilled' && Array.isArray((pagesRes.value as any).data)) {
    for (const p of (pagesRes.value as any).data) pageMap.set(p.id, p);
  }
  const commMap = new Map<string, any>();
  if (commsRes.status === 'fulfilled' && Array.isArray((commsRes.value as any).data)) {
    for (const c of (commsRes.value as any).data) commMap.set(c.id, c);
  }

  const mediaByPost = new Map<string, any[]>();
  if (mediaRes.status === 'fulfilled' && Array.isArray((mediaRes.value as any).data)) {
    for (const m of (mediaRes.value as any).data) {
      const list = mediaByPost.get(m.post_id) || [];
      list.push(m);
      mediaByPost.set(m.post_id, list);
    }
  }
  const reactionsByPost = new Map<string, any[]>();
  if (reactionsRes.status === 'fulfilled' && Array.isArray((reactionsRes.value as any).data)) {
    for (const r of (reactionsRes.value as any).data) {
      const list = reactionsByPost.get(r.post_id) || [];
      list.push(r);
      reactionsByPost.set(r.post_id, list);
    }
  }
  const commentsByPost = new Map<string, any[]>();
  if (commentsRes.status === 'fulfilled' && Array.isArray((commentsRes.value as any).data)) {
    for (const c of (commentsRes.value as any).data) {
      const list = commentsByPost.get(c.post_id) || [];
      list.push({ id: c.id });
      commentsByPost.set(c.post_id, list);
    }
  }

  const hydrated = rows.map((row: any) => ({
    ...row,
    author: row.author_id ? authorMap.get(row.author_id) || null : null,
    page: row.page_id ? pageMap.get(row.page_id) || null : null,
    community: row.community_id ? commMap.get(row.community_id) || null : null,
    post_media: mediaByPost.get(row.id) || [],
    post_reactions: reactionsByPost.get(row.id) || [],
    comments: commentsByPost.get(row.id) || [],
  }));

  return { rows: hydrated };
}

function isPostVisibleToViewer(
  post: any,
  viewerId: string | null,
  social: ViewerSocialContext,
  moderatedPosts: AdminStore['moderatedPosts']
): boolean {
  const mod = moderatedPosts?.[post.id];
  if (mod?.action === 'hide' || mod?.action === 'delete') return false;
  if (String(post.visibility || '').toLowerCase() === 'hidden' || Boolean(post.is_hidden)) return false;

  // Enforce user blocks on regular student posts
  if (!post.page_id && post.author_id && social.blockedIds.has(post.author_id)) {
    return false;
  }

  // Enforce private community membership
  if (post.community_id && post.community?.privacy === 'private') {
    if (!viewerId) return false;
    const isAuthor = post.author_id === viewerId;
    const isCreator = post.community?.creator_id === viewerId;
    const isMember = social.memberCommunityIds.has(post.community_id);
    if (!isAuthor && !isCreator && !isMember) return false;
  }

  const vis = String(post.visibility || 'public').toLowerCase();
  if (vis === 'friends') {
    if (!viewerId) return false;
    return post.author_id === viewerId || social.friendIds.has(post.author_id);
  }
  if (vis === 'campus') {
    return Boolean(viewerId);
  }

  // 'public' posts are visible
  return true;
}

app.get('/api/posts/feed', async (req, res) => {
  try {
    const sb = supabaseAdmin || getAdminSupabase(req);
    const viewer = await resolveOptionalAuthUser(req);
    const viewerId = viewer?.id || null;

    const requestedLimit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 300);
    const beforeCursor = typeof req.query.before === 'string' && req.query.before.trim()
      ? req.query.before.trim()
      : null;

    // Scan slightly wider window to account for private/blocked/moderated posts filtered out below
    const scanLimit = Math.min(requestedLimit * 2 + 40, 500);

    const [social, queryResult] = await Promise.all([
      getViewerSocialContext(sb, viewerId),
      queryPostsResilient(sb, (q) => {
        let next = q.order('created_at', { ascending: false });
        if (beforeCursor) {
          next = next.lt('created_at', beforeCursor);
        }
        return next.limit(scanLimit);
      }),
    ]);

    if (queryResult.error) {
      res.status(500).json({ success: false, error: queryResult.error });
      return;
    }

    const store = readStore();
    const moderatedPosts = store.moderatedPosts || {};
    const scannedRows = queryResult.rows;

    const visiblePosts: any[] = [];
    let lastProcessedRow: any = null;

    for (const row of scannedRows) {
      lastProcessedRow = row;
      if (isPostVisibleToViewer(row, viewerId, social, moderatedPosts)) {
        visiblePosts.push(row);
        if (visiblePosts.length >= requestedLimit) break;
      }
    }

    const hitScanEnd = scannedRows.length === 0;
    const moreInVisibleSlice = visiblePosts.length >= requestedLimit && scannedRows.length > visiblePosts.length;
    const reachedEndOfScanned = lastProcessedRow && scannedRows[scannedRows.length - 1]?.id === lastProcessedRow.id;
    const hasMore = !hitScanEnd && (moreInVisibleSlice || (!reachedEndOfScanned || scannedRows.length === scanLimit));
    const nextCursor = hasMore && lastProcessedRow?.created_at ? lastProcessedRow.created_at : null;

    await resolveServerPostMediaSignedUrls(sb, visiblePosts);

    res.json({
      success: true,
      posts: visiblePosts,
      savedPostIds: Array.from(social.savedPostIds),
      friendIds: Array.from(social.friendIds),
      hasMore,
      nextCursor,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to load feed posts';
    res.status(500).json({ success: false, error: msg });
  }
});

app.get('/api/posts/user/:userId', async (req, res) => {
  try {
    const targetUserId = (req.params.userId || '').trim();
    if (!targetUserId) {
      res.status(400).json({ success: false, error: 'Missing userId parameter.' });
      return;
    }

    const sb = supabaseAdmin || getAdminSupabase(req);
    const viewer = await resolveOptionalAuthUser(req);
    const viewerId = viewer?.id || null;
    const requestedLimit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 300);

    const [social, queryResult] = await Promise.all([
      getViewerSocialContext(sb, viewerId),
      queryPostsResilient(sb, (q) =>
        q
          .eq('author_id', targetUserId)
          .is('page_id', null)
          .order('created_at', { ascending: false })
          .limit(requestedLimit)
      ),
    ]);

    if (queryResult.error) {
      res.status(500).json({ success: false, error: queryResult.error });
      return;
    }

    const store = readStore();
    const moderatedPosts = store.moderatedPosts || {};
    const visiblePosts = queryResult.rows.filter((row) =>
      isPostVisibleToViewer(row, viewerId, social, moderatedPosts)
    );

    await resolveServerPostMediaSignedUrls(sb, visiblePosts);

    res.json({
      success: true,
      posts: visiblePosts,
      savedPostIds: Array.from(social.savedPostIds),
      friendIds: Array.from(social.friendIds),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to load user posts';
    res.status(500).json({ success: false, error: msg });
  }
});

app.get('/api/posts/community/:communityId', async (req, res) => {
  try {
    const communityId = (req.params.communityId || '').trim();
    if (!communityId) {
      res.status(400).json({ success: false, error: 'Missing communityId parameter.' });
      return;
    }

    const sb = supabaseAdmin || getAdminSupabase(req);
    const viewer = await resolveOptionalAuthUser(req);
    const viewerId = viewer?.id || null;
    const requestedLimit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 300);

    const [social, queryResult] = await Promise.all([
      getViewerSocialContext(sb, viewerId),
      queryPostsResilient(sb, (q) =>
        q
          .eq('community_id', communityId)
          .order('created_at', { ascending: false })
          .limit(requestedLimit)
      ),
    ]);

    if (queryResult.error) {
      res.status(500).json({ success: false, error: queryResult.error });
      return;
    }

    const store = readStore();
    const moderatedPosts = store.moderatedPosts || {};
    const visiblePosts = queryResult.rows
      .filter((row) => isPostVisibleToViewer(row, viewerId, social, moderatedPosts))
      .sort((a, b) => Number(Boolean(b.is_pinned)) - Number(Boolean(a.is_pinned)));

    await resolveServerPostMediaSignedUrls(sb, visiblePosts);

    res.json({
      success: true,
      posts: visiblePosts,
      savedPostIds: Array.from(social.savedPostIds),
      friendIds: Array.from(social.friendIds),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to load community posts';
    res.status(500).json({ success: false, error: msg });
  }
});

app.get('/api/posts/saved', async (req, res) => {
  try {
    const viewer = await resolveOptionalAuthUser(req);
    if (!viewer) {
      res.status(401).json({ success: false, error: 'Authentication required.' });
      return;
    }

    const sb = supabaseAdmin || getAdminSupabase(req);
    const { data: savedRows, error: savedErr } = await sb
      .from('saved_posts')
      .select('post_id, created_at')
      .eq('user_id', viewer.id)
      .order('created_at', { ascending: false });

    if (savedErr || !savedRows || savedRows.length === 0) {
      res.json({ success: true, posts: [], savedPostIds: [] });
      return;
    }

    const orderedPostIds = savedRows.map((r: any) => r.post_id).filter(Boolean);
    const [social, queryResult] = await Promise.all([
      getViewerSocialContext(sb, viewer.id),
      queryPostsResilient(sb, (q) => q.in('id', orderedPostIds)),
    ]);

    if (queryResult.error) {
      res.status(500).json({ success: false, error: queryResult.error });
      return;
    }

    const store = readStore();
    const moderatedPosts = store.moderatedPosts || {};
    const byId = new Map<string, any>();
    for (const row of queryResult.rows) {
      if (isPostVisibleToViewer(row, viewer.id, social, moderatedPosts)) {
        byId.set(row.id, row);
      }
    }

    const orderedPosts = orderedPostIds.map((id: string) => byId.get(id)).filter(Boolean);
    await resolveServerPostMediaSignedUrls(sb, orderedPosts);

    res.json({
      success: true,
      posts: orderedPosts,
      savedPostIds: orderedPostIds,
      friendIds: Array.from(social.friendIds),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to load saved posts';
    res.status(500).json({ success: false, error: msg });
  }
});

app.get('/api/posts/:postId', async (req, res) => {
  try {
    const postId = (req.params.postId || '').trim();
    if (!isValidUuid(postId)) {
      res.status(404).json({ success: false, reason: 'not_found', error: 'Post not found.' });
      return;
    }

    const sb = supabaseAdmin || getAdminSupabase(req);
    const viewer = await resolveOptionalAuthUser(req);
    const viewerId = viewer?.id || null;

    const [social, queryResult] = await Promise.all([
      getViewerSocialContext(sb, viewerId),
      queryPostsResilient(sb, (q) => q.eq('id', postId).limit(1)),
    ]);

    if (queryResult.error) {
      res.status(500).json({ success: false, reason: 'error', error: queryResult.error });
      return;
    }

    const row = queryResult.rows[0];
    if (!row) {
      res.status(404).json({
        success: false,
        reason: 'not_found',
        error: 'This post may have been deleted.',
      });
      return;
    }

    const store = readStore();
    const moderatedPosts = store.moderatedPosts || {};
    const mod = moderatedPosts?.[row.id];
    if (
      mod?.action === 'hide' ||
      mod?.action === 'delete' ||
      String(row.visibility || '').toLowerCase() === 'hidden' ||
      Boolean(row.is_hidden)
    ) {
      res.status(404).json({
        success: false,
        reason: 'not_found',
        error: 'This post is no longer available.',
      });
      return;
    }

    if (!isPostVisibleToViewer(row, viewerId, social, moderatedPosts)) {
      res.status(403).json({
        success: false,
        reason: 'restricted',
        error: 'This post is restricted or only visible to specific students.',
      });
      return;
    }

    await resolveServerPostMediaSignedUrls(sb, [row]);

    res.json({
      success: true,
      post: row,
      savedPostIds: Array.from(social.savedPostIds),
      friendIds: Array.from(social.friendIds),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to load post';
    res.status(500).json({ success: false, reason: 'error', error: msg });
  }
});

// Phase 2: Communities, Campus Events & Stories Routes
registerCommunityRoutes(app);
registerEventRoutes(app);
registerStoryRoutes(app);

// -------------------------------------------------------------
// VITE DEV SERVER / STATIC ASSETS MOUNTING
// -------------------------------------------------------------
async function setupServer() {
  const isProd = process.env.NODE_ENV === 'production';
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const httpServer = http.createServer(app);

  if (isProd && fs.existsSync(path.resolve(__dirname, 'dist'))) {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[ABSU Connect] Full-stack application ready on http://0.0.0.0:${PORT}`);
    console.log(`[ABSU Connect] Super Admin configured: ${SUPER_ADMIN_EMAIL}`);
    if (supabaseAdmin) {
      autoApprovePendingAnonymousSubmissions(supabaseAdmin)
        .then((count) => {
          if (count > 0) {
            console.log(`[ABSU Connect] Auto-approved and published ${count} pending anonymous submission(s) on startup.`);
          }
        })
        .catch(() => {});
    }
  });
}

setupServer().catch((err) => {
  console.error('[Server Error] Failed to start server:', err);
  process.exit(1);
});
