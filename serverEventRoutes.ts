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

function mapEventRow(row: any, profile?: any, userResponse?: string | null, isSaved = false, currentUserId?: string) {
  return {
    id: row.id,
    title: row.title || 'ABSU Campus Event',
    description: row.description || '',
    category: row.category || 'Academic',
    organizerId: row.organizer_id,
    organizerName: profile?.display_name || profile?.username || row.organizer_name || 'ABSU Organizer',
    organizerAvatar: profile?.avatar_url || undefined,
    organizerHandle: profile?.username ? `@${profile.username}` : undefined,
    venue: row.venue || 'ABSU Uturu Campus',
    campus: row.campus || 'Uturu (Main Campus)',
    startTime: row.start_time,
    endTime: row.end_time || undefined,
    posterUrl: row.poster_url || undefined,
    status: row.status || 'published',
    visibility: row.visibility === 'campus_only' ? 'campus_only' : 'public',
    registrationLink: row.registration_link || undefined,
    isOnline: Boolean(row.is_online),
    onlineUrl: row.online_url || undefined,
    capacityLimit: row.capacity_limit || undefined,
    communityId: row.community_id || undefined,
    interestedCount: Number(row.interested_count || 0),
    goingCount: Number(row.going_count || 0),
    viewsCount: Number(row.views_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    userResponse: userResponse === 'interested' || userResponse === 'going' ? userResponse : null,
    isSaved,
    isOrganizer: Boolean(currentUserId && row.organizer_id === currentUserId),
  };
}

async function recalculateEventCounts(sb: any, eventId: string) {
  const [interestedRes, goingRes] = await Promise.all([
    sb
      .from('event_participants')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('response', 'interested'),
    sb
      .from('event_participants')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('response', 'going'),
  ]);

  const interestedCount = interestedRes.count || 0;
  const goingCount = goingRes.count || 0;

  await sb
    .from('campus_events')
    .update({ interested_count: interestedCount, going_count: goingCount })
    .eq('id', eventId);

  return { interestedCount, goingCount };
}

export function registerEventRoutes(app: Express) {
  // 1. List Campus Events
  app.get('/api/events', async (req: Request, res: Response) => {
    try {
      const sb = createUserClient(req);
      const userId = req.query.userId as string | undefined;
      const category = req.query.category as string | undefined;
      const search = (req.query.search as string | undefined)?.trim().toLowerCase();
      const tab = (req.query.tab as string | undefined) || 'all';

      let query = sb
        .from('campus_events')
        .select('*')
        .neq('status', 'draft')
        .order('start_time', { ascending: true });

      if (category && category !== 'All') {
        query = query.eq('category', category);
      }

      const { data: rows, error } = await query.limit(100);
      if (error) {
        res.status(500).json({ success: false, error: error.message });
        return;
      }

      const eventsRows = rows || [];
      const organizerIds = Array.from(new Set(eventsRows.map((e) => e.organizer_id).filter(Boolean)));
      const profileMap = new Map<string, any>();

      if (organizerIds.length > 0) {
        const { data: profiles } = await sb
          .from('profiles')
          .select('id, display_name, username, avatar_url')
          .in('id', organizerIds);
        for (const p of profiles || []) profileMap.set(p.id, p);
      }

      const responseMap = new Map<string, string>();
      const savedSet = new Set<string>();

      if (userId && eventsRows.length > 0) {
        const [partRes, savedRes] = await Promise.all([
          sb.from('event_participants').select('event_id, response').eq('user_id', userId),
          sb.from('saved_events').select('event_id').eq('user_id', userId),
        ]);
        for (const p of partRes.data || []) responseMap.set(p.event_id, p.response);
        for (const s of savedRes.data || []) savedSet.add(s.event_id);
      }

      let mapped = eventsRows.map((row) =>
        mapEventRow(
          row,
          profileMap.get(row.organizer_id),
          responseMap.get(row.id) || null,
          savedSet.has(row.id),
          userId
        )
      );

      if (search) {
        mapped = mapped.filter(
          (ev) =>
            ev.title.toLowerCase().includes(search) ||
            ev.description.toLowerCase().includes(search) ||
            ev.venue.toLowerCase().includes(search)
        );
      }

      if (tab === 'today') {
        const today = new Date().toISOString().slice(0, 10);
        mapped = mapped.filter((ev) => (ev.startTime || '').slice(0, 10) === today);
      } else if (tab === 'saved') {
        mapped = mapped.filter((ev) => ev.isSaved);
      } else if (tab === 'my' && userId) {
        mapped = mapped.filter((ev) => ev.userResponse !== null || ev.organizerId === userId);
      }

      res.json({ success: true, events: mapped });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Failed to fetch events',
      });
    }
  });

  // 2. Organizer Dashboard
  app.get('/api/events/organizer/dashboard', async (req: Request, res: Response) => {
    try {
      const sb = createUserClient(req);
      const organizerId = req.query.organizerId as string | undefined;

      if (!organizerId) {
        res.json({ success: true, totalEvents: 0, totalInterested: 0, totalGoing: 0, events: [] });
        return;
      }

      const { data: rows, error } = await sb
        .from('campus_events')
        .select('*')
        .eq('organizer_id', organizerId)
        .order('created_at', { ascending: false });

      if (error) {
        res.status(500).json({ success: false, error: error.message });
        return;
      }

      const mapped = (rows || []).map((r) => mapEventRow(r, null, null, false, organizerId));
      const totalInterested = mapped.reduce((sum, e) => sum + e.interestedCount, 0);
      const totalGoing = mapped.reduce((sum, e) => sum + e.goingCount, 0);

      res.json({
        success: true,
        totalEvents: mapped.length,
        totalInterested,
        totalGoing,
        events: mapped,
      });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Failed to load organizer dashboard',
      });
    }
  });

  // 3. Event Participants
  app.get('/api/events/:id/participants', async (req: Request, res: Response) => {
    try {
      const sb = createUserClient(req);
      const { id } = req.params;

      const { data: rows, error } = await sb
        .from('event_participants')
        .select('*')
        .eq('event_id', id)
        .order('created_at', { ascending: false });

      if (error) {
        res.status(500).json({ success: false, error: error.message });
        return;
      }

      const userIds = Array.from(new Set((rows || []).map((r) => r.user_id).filter(Boolean)));
      const profileMap = new Map<string, any>();
      if (userIds.length > 0) {
        const { data: profiles } = await sb
          .from('profiles')
          .select('id, display_name, username, avatar_url, department, level')
          .in('id', userIds);
        for (const p of profiles || []) profileMap.set(p.id, p);
      }

      const participants = (rows || []).map((r) => {
        const p = profileMap.get(r.user_id);
        return {
          id: r.id,
          eventId: r.event_id,
          userId: r.user_id,
          name: p?.display_name || p?.username || 'ABSU Student',
          avatar:
            p?.avatar_url ||
            `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(r.user_id)}&backgroundColor=6d45d9&textColor=ffffff`,
          department: p?.department || 'Student',
          level: p?.level || 'Undergraduate',
          response: r.response,
          createdAt: r.created_at,
        };
      });

      res.json({ success: true, participants });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Failed to fetch participants',
      });
    }
  });

  // 4. Single Event Detail
  app.get('/api/events/:id', async (req: Request, res: Response) => {
    try {
      const sb = createUserClient(req);
      const { id } = req.params;
      const userId = req.query.userId as string | undefined;

      const { data: row, error } = await sb
        .from('campus_events')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        res.status(500).json({ success: false, error: error.message });
        return;
      }
      if (!row) {
        res.status(404).json({ success: false, error: 'Event not found' });
        return;
      }

      const { data: profile } = await sb
        .from('profiles')
        .select('id, display_name, username, avatar_url')
        .eq('id', row.organizer_id)
        .maybeSingle();

      let userResponse: string | null = null;
      let isSaved = false;
      if (userId) {
        const [partRes, savedRes] = await Promise.all([
          sb
            .from('event_participants')
            .select('response')
            .eq('event_id', id)
            .eq('user_id', userId)
            .maybeSingle(),
          sb
            .from('saved_events')
            .select('id')
            .eq('event_id', id)
            .eq('user_id', userId)
            .maybeSingle(),
        ]);
        userResponse = partRes.data?.response || null;
        isSaved = Boolean(savedRes.data);
      }

      res.json({
        success: true,
        event: mapEventRow(row, profile, userResponse, isSaved, userId),
      });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Failed to load event',
      });
    }
  });

  // 5. Create Event
  app.post('/api/events', async (req: Request, res: Response) => {
    try {
      const sb = createUserClient(req);
      const {
        title,
        description,
        category = 'Academic',
        venue,
        campus = 'Uturu (Main Campus)',
        startTime,
        endTime,
        posterUrl,
        registrationLink,
        isOnline = false,
        onlineUrl,
        capacityLimit,
        communityId,
        organizerId,
      } = req.body;

      if (!title || !description || !venue || !startTime || !organizerId) {
        res.status(400).json({ success: false, error: 'Missing required event details.' });
        return;
      }

      const { data: created, error } = await sb
        .from('campus_events')
        .insert({
          title: String(title).trim(),
          description: String(description).trim(),
          category,
          organizer_id: organizerId,
          venue: String(venue).trim(),
          campus,
          start_time: startTime,
          end_time: endTime || null,
          poster_url: posterUrl || null,
          status: 'published',
          visibility: 'public',
          registration_link: registrationLink || null,
          is_online: Boolean(isOnline),
          online_url: onlineUrl || null,
          capacity_limit: capacityLimit ? Number(capacityLimit) : null,
          community_id: communityId || null,
          interested_count: 0,
          going_count: 1,
        })
        .select('*')
        .single();

      if (error || !created) {
        res.status(400).json({ success: false, error: error?.message || 'Failed to create event' });
        return;
      }

      await sb.from('event_participants').upsert(
        {
          event_id: created.id,
          user_id: organizerId,
          response: 'going',
        },
        { onConflict: 'event_id,user_id' }
      );

      res.json({
        success: true,
        event: mapEventRow(created, null, 'going', false, organizerId),
      });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Failed to create event',
      });
    }
  });

  // 6. RSVP / Respond to Event
  app.post('/api/events/:id/respond', async (req: Request, res: Response) => {
    try {
      const sb = createUserClient(req);
      const { id } = req.params;
      const { userId, response } = req.body;

      if (!userId) {
        res.status(400).json({ success: false, error: 'userId is required.' });
        return;
      }

      if (!response) {
        await sb.from('event_participants').delete().eq('event_id', id).eq('user_id', userId);
      } else {
        const { error } = await sb.from('event_participants').upsert(
          {
            event_id: id,
            user_id: userId,
            response,
          },
          { onConflict: 'event_id,user_id' }
        );
        if (error) {
          res.status(400).json({ success: false, error: error.message });
          return;
        }
      }

      const counts = await recalculateEventCounts(sb, id);
      res.json({ success: true, ...counts });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Failed to update RSVP',
      });
    }
  });

  // 7. Save / Unsave Event
  app.post('/api/events/:id/save', async (req: Request, res: Response) => {
    try {
      const sb = createUserClient(req);
      const { id } = req.params;
      const { userId, isSaved } = req.body;

      if (!userId) {
        res.status(400).json({ success: false, error: 'userId is required.' });
        return;
      }

      if (isSaved) {
        await sb.from('saved_events').delete().eq('event_id', id).eq('user_id', userId);
      } else {
        await sb.from('saved_events').upsert(
          { event_id: id, user_id: userId },
          { onConflict: 'event_id,user_id', ignoreDuplicates: true }
        );
      }

      res.json({ success: true });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Failed to toggle saved event',
      });
    }
  });

  // 8. Cancel Event
  app.post('/api/events/:id/cancel', async (req: Request, res: Response) => {
    try {
      const sb = createUserClient(req);
      const { id } = req.params;
      const { error } = await sb
        .from('campus_events')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) {
        res.status(400).json({ success: false, error: error.message });
        return;
      }
      res.json({ success: true });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Failed to cancel event',
      });
    }
  });

  // 9. Update Event
  app.put('/api/events/:id', async (req: Request, res: Response) => {
    try {
      const sb = createUserClient(req);
      const { id } = req.params;
      const updates: Record<string, any> = { updated_at: new Date().toISOString() };
      if (req.body.title !== undefined) updates.title = req.body.title;
      if (req.body.description !== undefined) updates.description = req.body.description;
      if (req.body.category !== undefined) updates.category = req.body.category;
      if (req.body.venue !== undefined) updates.venue = req.body.venue;
      if (req.body.campus !== undefined) updates.campus = req.body.campus;
      if (req.body.startTime !== undefined) updates.start_time = req.body.startTime;
      if (req.body.endTime !== undefined) updates.end_time = req.body.endTime;
      if (req.body.posterUrl !== undefined) updates.poster_url = req.body.posterUrl;
      if (req.body.registrationLink !== undefined) updates.registration_link = req.body.registrationLink;

      const { data, error } = await sb
        .from('campus_events')
        .update(updates)
        .eq('id', id)
        .select('*')
        .single();

      if (error || !data) {
        res.status(400).json({ success: false, error: error?.message || 'Failed to update event' });
        return;
      }

      res.json({ success: true, event: mapEventRow(data) });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Failed to update event',
      });
    }
  });

  // 10. Archive single event via explicit ID
  app.delete('/api/events/:id', async (req: Request, res: Response) => {
    try {
      const sb = createUserClient(req);
      const { id } = req.params;
      const { error } = await sb
        .from('campus_events')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) {
        res.status(400).json({ success: false, error: error.message });
        return;
      }
      res.json({ success: true });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Failed to delete event',
      });
    }
  });
}
