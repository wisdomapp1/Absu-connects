import { supabase } from './supabase.ts';
import type { Page, AnonymousSubmission, PageCategory, PageApplication } from '../types/pages.ts';
import type { Post } from '../types/index.ts';
import {
  mapSupabasePostToFrontend,
  resolvePostMediaUrlsOnRows,
  SupabasePostRow,
} from './postService.ts';

// Hardcoded canonical ID for Mr Anonymous from DB inspection
export const MR_ANONYMOUS_SLUG = 'mr-anonymous';
export const MR_ANONYMOUS_PAGE_ID = '0c3240e3-ae39-461d-bd7a-4963859b9bc7';
export const MR_ANONYMOUS_DUMMY_ID = 'b4f38505-fce6-44be-8727-8ebf04eb2ceb';

/**
 * Fetch Mr Anonymous page details with real follower count, published post count, and follow state
 */
export async function fetchMrAnonymousPage(currentUserId?: string): Promise<Page | null> {
  try {
    const { data: pageRow, error: pageErr } = await supabase
      .from('pages')
      .select('*')
      .eq('slug', MR_ANONYMOUS_SLUG)
      .maybeSingle();

    if (pageErr || !pageRow) {
      console.warn('[PageService] fetchMrAnonymousPage error:', pageErr?.message);
      return null;
    }

    // 1. Real follower count from page_followers table
    const { count: followersCount } = await supabase
      .from('page_followers')
      .select('*', { count: 'exact', head: true })
      .eq('page_id', pageRow.id);

    // 2. Real total published post count (historical + approved posts)
    const { count: postsCount } = await supabase
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .or(`page_id.eq.${pageRow.id},author_id.eq.${MR_ANONYMOUS_DUMMY_ID}`);

    // 3. Query if current user follows
    let isFollowing = false;
    if (currentUserId) {
      const { data: followRow } = await supabase
        .from('page_followers')
        .select('page_id')
        .eq('page_id', pageRow.id)
        .eq('user_id', currentUserId)
        .maybeSingle();
      isFollowing = Boolean(followRow);
    }

    return {
      id: pageRow.id,
      slug: pageRow.slug,
      name: pageRow.name,
      description: pageRow.description,
      avatarUrl: pageRow.avatar_url,
      createdBy: pageRow.created_by,
      isActive: pageRow.is_active,
      createdAt: pageRow.created_at,
      updatedAt: pageRow.updated_at,
      followersCount: followersCount ?? 0,
      postsCount: postsCount ?? 0,
      isFollowing,
    };
  } catch (err) {
    console.warn('[PageService] Error fetching Mr Anonymous page:', err);
    return null;
  }
}

/**
 * Follow or unfollow a page with optimistic updates
 */
export async function toggleFollowPage(
  pageId: string,
  userId: string,
  currentlyFollowing: boolean
): Promise<boolean> {
  try {
    if (currentlyFollowing) {
      const { error } = await supabase
        .from('page_followers')
        .delete()
        .eq('page_id', pageId)
        .eq('user_id', userId);
      return !error;
    } else {
      const { error } = await supabase
        .from('page_followers')
        .insert({
          page_id: pageId,
          user_id: userId,
          created_at: new Date().toISOString(),
        });
      return !error;
    }
  } catch (err) {
    console.warn('[PageService] Error toggling page follow:', err);
    return false;
  }
}

async function getAuthToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  } catch {
    return null;
  }
}

async function parseApiJson(res: Response | null): Promise<any | null> {
  if (!res) return null;
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (!ct.includes('application/json')) return null;
  return await res.json().catch(() => null);
}

/**
 * Check if the user is an authorized manager for a page
 */
export async function checkIsPageManager(pageId: string, userId: string): Promise<boolean> {
  try {
    const token = await getAuthToken();
    if (token) {
      const res = await fetch('/api/pages/mr-anonymous/is-manager', {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);
      const data = res?.ok ? await parseApiJson(res) : null;
      if (data && typeof data.isManager === 'boolean') {
        return data.isManager;
      }
    }

    // Direct database fallback
    const { data, error } = await supabase
      .from('page_managers')
      .select('role')
      .eq('page_id', pageId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) return false;
    return data.role === 'owner' || data.role === 'manager';
  } catch {
    return false;
  }
}

/**
 * Submit anonymous post using the prepared database RPC 'submit_anonymous_post'
 * Keeps submitter identity strictly separated in the protected identity table.
 */
export async function submitAnonymousPost(
  body: string
): Promise<{ success: boolean; submissionId?: string; postId?: string; autoApproved?: boolean; error?: string }> {
  const cleanBody = body.trim();
  if (!cleanBody || cleanBody.length < 10) {
    return { success: false, error: 'Submission must be at least 10 characters long.' };
  }
  if (cleanBody.length > 2500) {
    return { success: false, error: 'Submission cannot exceed 2500 characters.' };
  }

  try {
    const token = await getAuthToken();
    if (!token) {
      return { success: false, error: 'Please sign in before submitting an anonymous post.' };
    }

    // 1. Try Express API endpoint if mounted (must respond with JSON; ignore static HTML 404/200)
    const apiRes = await fetch('/api/pages/mr-anonymous/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ body: cleanBody }),
    }).catch(() => null);

    const apiJson = await parseApiJson(apiRes);
    if (apiRes && apiJson) {
      if (apiRes.ok && apiJson.success) {
        return {
          success: true,
          submissionId: apiJson.submissionId,
          postId: apiJson.postId,
          autoApproved: true,
        };
      }
      if (apiRes.status !== 404 && apiJson.error) {
        return { success: false, error: apiJson.error };
      }
    }

    // 2. Direct Supabase RPC path (requires BEFORE INSERT auto-approve trigger on anonymous_submissions)
    const { data, error } = await supabase.rpc('submit_anonymous_post', {
      p_body: cleanBody,
    });

    if (error) {
      console.warn('[PageService] submit_anonymous_post RPC error:', error.message);
      if (error.message?.toLowerCase().includes('jwt') || error.code === '42501') {
        return {
          success: false,
          error: 'Authentication or database permission prevented submission. Please sign in again and retry.',
        };
      }
      return { success: false, error: error.message || 'Unable to submit anonymous post.' };
    }

    const submissionId = data as string;
    const { data: subRow, error: checkErr } = await supabase
      .from('anonymous_submissions')
      .select('status, published_post_id')
      .eq('id', submissionId)
      .maybeSingle();

    if (checkErr) {
      console.debug('[PageService] post-submit verification note:', checkErr.message);
    }

    if (subRow && subRow.status !== 'approved') {
      return {
        success: false,
        error:
          'Your submission was queued, but automatic database publishing is not active yet. Please apply the 20261119_production_sync_master.sql migration (auto-approve trigger) in Supabase SQL Editor.',
      };
    }

    return {
      success: true,
      submissionId,
      postId: subRow?.published_post_id || undefined,
      autoApproved: true,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error submitting post';
    return { success: false, error: msg };
  }
}

/**
 * Fetch real pending anonymous submissions for moderation
 * Submitter identities are excluded by the database schema.
 */
export async function fetchPendingSubmissions(pageId: string): Promise<AnonymousSubmission[]> {
  try {
    const token = await getAuthToken();
    if (token) {
      const res = await fetch('/api/pages/mr-anonymous/pending-submissions', {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);
      const json = res?.ok ? await parseApiJson(res) : null;
      if (json?.success && Array.isArray(json.submissions)) {
        return json.submissions as AnonymousSubmission[];
      }
    }

    // Fallback: direct Supabase select
    const { data, error } = await supabase
      .from('anonymous_submissions')
      .select('id, page_id, body, status, created_at, updated_at')
      .eq('page_id', pageId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[PageService] fetchPendingSubmissions error:', error.message);
      return [];
    }

    return (data || []) as AnonymousSubmission[];
  } catch (err) {
    console.warn('[PageService] Error fetching pending submissions:', err);
    return [];
  }
}

/**
 * Review an anonymous submission: approve or reject
 * When approved, atomically publishes to the posts table with author Mr Anonymous.
 */
export async function reviewAnonymousSubmission(
  submissionId: string,
  decision: 'approved' | 'rejected'
): Promise<{ success: boolean; postId?: string; error?: string }> {
  try {
    const token = await getAuthToken();
    if (token) {
      const res = await fetch('/api/pages/mr-anonymous/review-submission', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ submissionId, decision }),
      }).catch(() => null);

      const json = await parseApiJson(res);
      if (res && json) {
        if (res.ok && json.success) {
          return {
            success: true,
            postId: json.postId,
          };
        }
        if (res.status !== 404 && json.error) {
          return { success: false, error: json.error };
        }
      }
    }

    // Fallback: direct RPC
    const { data, error } = await supabase.rpc('review_anonymous_submission', {
      p_submission_id: submissionId,
      p_decision: decision,
    });

    if (error) {
      console.warn('[PageService] review_anonymous_submission error:', error.message);
      return { success: false, error: error.message };
    }

    return {
      success: true,
      postId: data as string,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error reviewing submission';
    return { success: false, error: msg };
  }
}

/**
 * Fetch published posts for Mr Anonymous page (Retrieves historical + newly approved posts)
 */
export async function fetchPagePosts(pageId: string, currentUserId?: string): Promise<Post[]> {
  try {
    let postRows: SupabasePostRow[] = [];

    // 1. Try server endpoint when mounted
    const res = await fetch('/api/pages/mr-anonymous/posts').catch(() => null);
    const json = res?.ok ? await parseApiJson(res) : null;
    if (json?.success && Array.isArray(json.posts)) {
      postRows = json.posts as unknown as SupabasePostRow[];
    }

    // 2. If endpoint not reachable, query Supabase directly
    if (postRows.length === 0) {
      const { data, error } = await supabase
        .from('posts')
        .select(`
          *,
          author:profiles!posts_author_id_fkey(*),
          page:pages(*),
          post_media(*),
          post_reactions(*),
          comments(id)
        `)
        .or(`page_id.eq.${pageId},author_id.eq.${MR_ANONYMOUS_DUMMY_ID}`)
        .neq('visibility', 'hidden')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.warn('[PageService] fetchPagePosts direct error:', error.message);
      } else {
        postRows = (data || []) as unknown as SupabasePostRow[];
      }
    }

    await resolvePostMediaUrlsOnRows(postRows);

    return postRows
      .filter((r) => r.visibility !== 'hidden')
      .map((row) => mapSupabasePostToFrontend(row, currentUserId));
  } catch (err) {
    console.warn('[PageService] Error fetching page posts:', err);
    return [];
  }
}

/**
 * Submit an application to create a new campus page
 */
export async function submitPageApplication(params: {
  applicantId: string;
  name: string;
  category: PageCategory;
  description: string;
  whyCreate: string;
  contactEmail?: string;
  contactPhone?: string;
  location?: string;
  avatarPath?: string;
  coverPath?: string;
}): Promise<{ success: boolean; application?: PageApplication; error?: string }> {
  try {
    const {
      applicantId,
      name,
      category,
      description,
      whyCreate,
      contactEmail,
      contactPhone,
      location,
      avatarPath,
      coverPath,
    } = params;

    if (!name || name.trim().length < 3) {
      return { success: false, error: 'Page name must be at least 3 characters.' };
    }
    if (!description || description.trim().length < 15) {
      return { success: false, error: 'Please provide a clear description (at least 15 characters).' };
    }
    if (!whyCreate || whyCreate.trim().length < 15) {
      return { success: false, error: 'Please explain why you want to create this page (at least 15 characters).' };
    }

    const { data, error } = await supabase
      .from('page_applications')
      .insert({
        applicant_id: applicantId,
        name: name.trim(),
        category,
        description: description.trim(),
        why_create: whyCreate.trim(),
        contact_email: contactEmail?.trim() || null,
        contact_phone: contactPhone?.trim() || null,
        location: location?.trim() || null,
        avatar_path: avatarPath || null,
        cover_path: coverPath || null,
      })
      .select()
      .single();

    if (error) {
      console.warn('[PageService] Error submitting page application:', error.message);
      return { success: false, error: error.message };
    }

    return {
      success: true,
      application: data as PageApplication,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to submit application';
    return { success: false, error: msg };
  }
}

/**
 * Fetch all page applications (for Super Admins)
 */
export async function fetchAllPageApplications(): Promise<PageApplication[]> {
  try {
    const { data, error } = await supabase
      .from('page_applications')
      .select(`
        *,
        applicant:profiles!page_applications_applicant_id_fkey(
          id,
          display_name,
          username,
          avatar_url,
          department
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[PageService] Error fetching all page applications:', error.message);
      return [];
    }

    return (data || []).map((row: any) => ({
      ...row,
      applicant: row.applicant
        ? {
            id: row.applicant.id,
            name: row.applicant.display_name || row.applicant.username || 'ABSU Student',
            avatar_url: row.applicant.avatar_url,
            department: row.applicant.department,
          }
        : undefined,
    }));
  } catch (err) {
    console.error('[PageService] fetchAllPageApplications error:', err);
    return [];
  }
}

/**
 * Review a page application (Approve or Reject via RPC review_page_application)
 */
export async function reviewPageApplication(
  applicationId: string,
  decision: 'approved' | 'rejected',
  notes?: string
): Promise<{ success: boolean; pageId?: string; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('review_page_application', {
      p_application_id: applicationId,
      p_decision: decision,
      ...(notes ? { p_notes: notes } : {}),
    });

    if (error) {
      console.warn('[PageService] review_page_application RPC error:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true, pageId: data as string };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error reviewing page application';
    return { success: false, error: msg };
  }
}

/**
 * Fetch pages managed by the current user
 */
export async function fetchUserManagedPages(userId: string): Promise<Page[]> {
  try {
    const { data: managers, error: mgrErr } = await supabase
      .from('page_managers')
      .select('page_id')
      .eq('user_id', userId);

    if (mgrErr || !managers || managers.length === 0) {
      return [];
    }

    const pageIds = managers.map((m) => m.page_id);
    const { data: pageRows, error: pgsErr } = await supabase
      .from('pages')
      .select('*')
      .in('id', pageIds);

    if (pgsErr || !pageRows) return [];

    return pageRows.map((r: any) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description,
      avatarUrl: r.avatar_url,
      avatar_url: r.avatar_url,
      createdBy: r.created_by,
      isActive: r.is_active,
      category: r.category,
      avatar_path: r.avatar_path,
      cover_path: r.cover_path,
      contact_email: r.contact_email,
      contact_phone: r.contact_phone,
      location: r.location,
      createdAt: r.created_at,
      followersCount: 0,
    }));
  } catch {
    return [];
  }
}

/**
 * Update page details (name, description, contact details, etc.)
 */
export async function updatePageProfile(
  pageId: string,
  updates: Partial<Page>
): Promise<{ success: boolean; error?: string }> {
  try {
    const payload: any = {};
    if (updates.name) payload.name = updates.name.trim();
    if (updates.description !== undefined) payload.description = updates.description?.trim();
    if (updates.category) payload.category = updates.category;
    if (updates.location !== undefined) payload.location = updates.location?.trim();
    if (updates.contact_email !== undefined) payload.contact_email = updates.contact_email?.trim();
    if (updates.contact_phone !== undefined) payload.contact_phone = updates.contact_phone?.trim();
    if (updates.avatar_url) payload.avatar_url = updates.avatar_url;
    if (updates.cover_path !== undefined) payload.cover_path = updates.cover_path;

    const { error } = await supabase
      .from('pages')
      .update(payload)
      .eq('id', pageId);

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update page';
    return { success: false, error: msg };
  }
}

