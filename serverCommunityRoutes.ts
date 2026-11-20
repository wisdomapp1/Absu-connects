import { Express, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://aqzolewmhpmrcvkrvchn.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_baaiGcHIsSAThnBLScTG6g_9M_stHmk';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

function createUserClient(req: Request) {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return supabaseAdmin;
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authHeader } },
    });
  }
  return supabaseAdmin;
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 48);
  return `${base || 'community'}-${Date.now().toString(36)}`;
}

function mapCommunityRow(row: any, membership?: any, pendingCount = 0) {
  const rulesList = Array.isArray(row.rules_list)
    ? row.rules_list
    : typeof row.rules === 'string' && row.rules.trim()
    ? row.rules.split('\n').map((s: string) => s.trim()).filter(Boolean)
    : [];

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description || '',
    category: row.category || 'General',
    imageUrl: row.image_url || '',
    coverUrl: row.cover_image_url || '',
    location: row.location || 'Uturu Main Campus',
    privacy: row.privacy === 'private' ? 'private' : 'public',
    creatorId: row.creator_id,
    creatorName: row.creator?.display_name || row.creator?.username || undefined,
    creatorAvatar: row.creator?.avatar_url || undefined,
    rules: row.rules || rulesList.join('\n'),
    rulesList,
    membersCount: Number(row.members_count || 0),
    pendingMembersCount: pendingCount,
    status: row.status || 'active',
    isVerified: Boolean(row.is_verified),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isMember: membership ? (membership.status === 'active' || membership.status === 'approved') : false,
    userRole: membership?.role || undefined,
    membershipStatus: membership?.status || undefined,
  };
}

export function registerCommunityRoutes(app: Express) {
  // 1. Fetch Communities
  app.get('/api/communities', async (req: Request, res: Response) => {
    try {
      const sb = createUserClient(req);
      const userId = req.query.userId as string | undefined;
      const category = req.query.category as string | undefined;
      const search = (req.query.search as string | undefined)?.trim().toLowerCase();
      const tab = (req.query.tab as string | undefined) || 'discover';

      let query = sb
        .from('communities')
        .select('*')
        .neq('status', 'archived')
        .order('members_count', { ascending: false })
        .order('created_at', { ascending: false });

      if (category && category !== 'All') {
        query = query.eq('category', category);
      }

      const { data: rows, error } = await query.limit(100);
      if (error) {
        res.status(500).json({ success: false, error: error.message });
        return;
      }

      const communitiesList = rows || [];
      const membershipsMap = new Map<string, any>();

      if (userId && communitiesList.length > 0) {
        const { data: memberships } = await sb
          .from('community_members')
          .select('community_id, role, status')
          .eq('user_id', userId);
        for (const m of memberships || []) {
          membershipsMap.set(m.community_id, m);
        }
      }

      let mapped = communitiesList.map((row) => mapCommunityRow(row, membershipsMap.get(row.id)));

      if (search) {
        mapped = mapped.filter(
          (c) =>
            c.name.toLowerCase().includes(search) ||
            c.description.toLowerCase().includes(search) ||
            c.category.toLowerCase().includes(search)
        );
      }

      if (tab === 'my' && userId) {
        mapped = mapped.filter((c) => c.isMember || c.creatorId === userId);
      } else if (tab === 'managed' && userId) {
        mapped = mapped.filter(
          (c) => c.creatorId === userId || c.userRole === 'owner' || c.userRole === 'admin'
        );
      }

      res.json({ success: true, communities: mapped });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Failed to fetch communities',
      });
    }
  });

  // 2. Fetch Community Members
  app.get('/api/communities/:id/members', async (req: Request, res: Response) => {
    try {
      const sb = createUserClient(req);
      const { id } = req.params;

      const { data: membersRows, error } = await sb
        .from('community_members')
        .select('*')
        .eq('community_id', id)
        .order('joined_at', { ascending: true });

      if (error) {
        res.status(500).json({ success: false, error: error.message });
        return;
      }

      const userIds = Array.from(new Set((membersRows || []).map((m) => m.user_id).filter(Boolean)));
      const profileMap = new Map<string, any>();
      if (userIds.length > 0) {
        const { data: profiles } = await sb
          .from('profiles')
          .select('id, display_name, username, avatar_url, department, level, campus')
          .in('id', userIds);
        for (const p of profiles || []) profileMap.set(p.id, p);
      }

      const members = (membersRows || []).map((m) => {
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

      res.json({ success: true, members });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Failed to fetch members',
      });
    }
  });

  // 3. Fetch Community Posts
  app.get('/api/communities/:id/posts', async (req: Request, res: Response) => {
    try {
      const sb = createUserClient(req);
      const { id } = req.params;

      const { data: rows, error } = await sb
        .from('posts')
        .select(`
          *,
          author:profiles!posts_author_id_fkey(*),
          community:communities(*),
          post_media(*),
          post_reactions(*),
          comments(id)
        `)
        .eq('community_id', id)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        res.status(500).json({ success: false, error: error.message });
        return;
      }

      res.json({ success: true, posts: rows || [] });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Failed to fetch community posts',
      });
    }
  });

  // 4. Fetch Single Community by ID
  app.get('/api/communities/:id', async (req: Request, res: Response) => {
    try {
      const sb = createUserClient(req);
      const { id } = req.params;
      const userId = req.query.userId as string | undefined;

      const { data: row, error } = await sb
        .from('communities')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        res.status(500).json({ success: false, error: error.message });
        return;
      }
      if (!row) {
        res.status(404).json({ success: false, error: 'Community not found' });
        return;
      }

      let membership: any = null;
      if (userId) {
        const { data: mem } = await sb
          .from('community_members')
          .select('role, status')
          .eq('community_id', id)
          .eq('user_id', userId)
          .maybeSingle();
        membership = mem;
      }

      const { count: pendingCount } = await sb
        .from('community_members')
        .select('id', { count: 'exact', head: true })
        .eq('community_id', id)
        .eq('status', 'pending');

      res.json({
        success: true,
        community: mapCommunityRow(row, membership, pendingCount || 0),
      });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Failed to load community',
      });
    }
  });

  // 5. Create Community
  app.post('/api/communities', async (req: Request, res: Response) => {
    try {
      const sb = createUserClient(req);
      const {
        name,
        description,
        category = 'General',
        imageUrl,
        coverUrl,
        location = 'Uturu Main Campus',
        privacy = 'public',
        rules,
        rulesList,
        creatorId,
      } = req.body;

      if (!name || !description || !creatorId) {
        res.status(400).json({ success: false, error: 'Name, description, and creatorId are required.' });
        return;
      }

      const cleanRulesList = Array.isArray(rulesList)
        ? rulesList.map((r: string) => String(r).trim()).filter(Boolean)
        : typeof rules === 'string'
        ? rules.split('\n').map((r: string) => r.trim()).filter(Boolean)
        : [];

      const { data: created, error } = await sb
        .from('communities')
        .insert({
          name: String(name).trim(),
          slug: slugify(String(name)),
          description: String(description).trim(),
          category,
          image_url: imageUrl || null,
          cover_image_url: coverUrl || null,
          location: location || 'Uturu Main Campus',
          privacy: privacy === 'private' ? 'private' : 'public',
          creator_id: creatorId,
          rules: cleanRulesList.join('\n') || null,
          rules_list: cleanRulesList,
          members_count: 1,
          status: 'active',
        })
        .select('*')
        .single();

      if (error || !created) {
        res.status(400).json({ success: false, error: error?.message || 'Failed to create community' });
        return;
      }

      // Add creator as owner in community_members
      await sb.from('community_members').upsert(
        {
          community_id: created.id,
          user_id: creatorId,
          role: 'owner',
          status: 'active',
        },
        { onConflict: 'community_id,user_id', ignoreDuplicates: true }
      );

      res.json({
        success: true,
        community: mapCommunityRow(created, { role: 'owner', status: 'active' }),
      });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Failed to create community',
      });
    }
  });

  // 6. Join Community
  app.post('/api/communities/:id/join', async (req: Request, res: Response) => {
    try {
      const sb = createUserClient(req);
      const { id } = req.params;
      const { userId } = req.body;

      if (!userId) {
        res.status(400).json({ success: false, error: 'userId is required.' });
        return;
      }

      const { data: comm } = await sb
        .from('communities')
        .select('id, privacy, members_count')
        .eq('id', id)
        .maybeSingle();

      if (!comm) {
        res.status(404).json({ success: false, error: 'Community not found.' });
        return;
      }

      const status = comm.privacy === 'private' ? 'pending' : 'active';
      const { error } = await sb.from('community_members').upsert(
        {
          community_id: id,
          user_id: userId,
          role: 'member',
          status,
        },
        { onConflict: 'community_id,user_id' }
      );

      if (error) {
        res.status(400).json({ success: false, error: error.message });
        return;
      }

      if (status === 'active') {
        const { count } = await sb
          .from('community_members')
          .select('id', { count: 'exact', head: true })
          .eq('community_id', id)
          .in('status', ['active', 'approved']);
        await sb
          .from('communities')
          .update({ members_count: count ?? Number(comm.members_count || 0) + 1 })
          .eq('id', id);
      }

      res.json({ success: true, status });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Failed to join community',
      });
    }
  });

  // 7. Leave Community
  app.post('/api/communities/:id/leave', async (req: Request, res: Response) => {
    try {
      const sb = createUserClient(req);
      const { id } = req.params;
      const { userId } = req.body;

      if (!userId) {
        res.status(400).json({ success: false, error: 'userId is required.' });
        return;
      }

      const { error } = await sb
        .from('community_members')
        .delete()
        .eq('community_id', id)
        .eq('user_id', userId);

      if (error) {
        res.status(400).json({ success: false, error: error.message });
        return;
      }

      const { count } = await sb
        .from('community_members')
        .select('id', { count: 'exact', head: true })
        .eq('community_id', id)
        .in('status', ['active', 'approved']);
      await sb.from('communities').update({ members_count: count || 0 }).eq('id', id);

      res.json({ success: true });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Failed to leave community',
      });
    }
  });

  // 8. Manage Membership Request / Role
  app.post('/api/communities/:id/manage-request', async (req: Request, res: Response) => {
    try {
      const sb = createUserClient(req);
      const { id } = req.params;
      const { targetUserId, action, role } = req.body;

      if (!targetUserId || !action) {
        res.status(400).json({ success: false, error: 'targetUserId and action are required.' });
        return;
      }

      if (action === 'approve') {
        await sb
          .from('community_members')
          .update({ status: 'active' })
          .eq('community_id', id)
          .eq('user_id', targetUserId);
      } else if (action === 'reject' || action === 'remove') {
        await sb
          .from('community_members')
          .delete()
          .eq('community_id', id)
          .eq('user_id', targetUserId);
      } else if (action === 'role' && role) {
        await sb
          .from('community_members')
          .update({ role })
          .eq('community_id', id)
          .eq('user_id', targetUserId);
      }

      const { count } = await sb
        .from('community_members')
        .select('id', { count: 'exact', head: true })
        .eq('community_id', id)
        .in('status', ['active', 'approved']);
      await sb.from('communities').update({ members_count: count || 0 }).eq('id', id);

      res.json({ success: true });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Failed to manage request',
      });
    }
  });

  // 9. Pin/Unpin Community Post
  app.post('/api/communities/:id/posts/:postId/pin', async (req: Request, res: Response) => {
    try {
      const sb = createUserClient(req);
      const { id, postId } = req.params;
      const { isPinned } = req.body;

      const { error } = await sb
        .from('posts')
        .update({ is_pinned: Boolean(isPinned) })
        .eq('id', postId)
        .eq('community_id', id);

      if (error) {
        res.status(400).json({ success: false, error: error.message });
        return;
      }

      res.json({ success: true });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Failed to update pin state',
      });
    }
  });

  // 10. Update Community
  app.patch('/api/communities/:id', async (req: Request, res: Response) => {
    try {
      const sb = createUserClient(req);
      const { id } = req.params;
      const updates: Record<string, any> = { updated_at: new Date().toISOString() };
      if (req.body.name !== undefined) updates.name = String(req.body.name).trim();
      if (req.body.description !== undefined) updates.description = String(req.body.description).trim();
      if (req.body.category !== undefined) updates.category = req.body.category;
      if (req.body.imageUrl !== undefined) updates.image_url = req.body.imageUrl;
      if (req.body.coverUrl !== undefined) updates.cover_image_url = req.body.coverUrl;
      if (req.body.location !== undefined) updates.location = req.body.location;
      if (req.body.privacy !== undefined) updates.privacy = req.body.privacy;
      if (req.body.rules !== undefined) updates.rules = req.body.rules;
      if (req.body.rulesList !== undefined) updates.rules_list = req.body.rulesList;

      const { data, error } = await sb
        .from('communities')
        .update(updates)
        .eq('id', id)
        .select('*')
        .single();

      if (error || !data) {
        res.status(400).json({ success: false, error: error?.message || 'Failed to update community' });
        return;
      }

      res.json({ success: true, community: mapCommunityRow(data) });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Failed to update community',
      });
    }
  });

  // 11. Archive/Delete single community (creator-initiated via explicit ID)
  app.delete('/api/communities/:id', async (req: Request, res: Response) => {
    try {
      const sb = createUserClient(req);
      const { id } = req.params;
      const { error } = await sb
        .from('communities')
        .update({ status: 'archived', updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) {
        res.status(400).json({ success: false, error: error.message });
        return;
      }
      res.json({ success: true });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Failed to archive community',
      });
    }
  });
}
