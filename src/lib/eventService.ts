import { supabase } from './supabase.ts';
import type { CampusEvent, CreateEventInput, EventResponse, EventParticipant } from '../types/events.ts';
import { safeStorage } from '../utils/safeStorage.ts';
import { uploadEventFlyerToStorage } from './storageService.ts';

function purgeLegacyLocalEventCache() {
  try {
    safeStorage.removeItem('absu_local_events');
    safeStorage.removeItem('absu_local_event_responses');
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

function mapEventRow(
  row: any,
  profile?: any,
  userResponse?: string | null,
  isSaved = false,
  currentUserId?: string
): CampusEvent {
  return {
    id: row.id,
    title: row.title || 'ABSU Campus Event',
    description: row.description || '',
    category: row.category || 'Academic',
    organizerId: row.organizer_id,
    organizerName:
      profile?.display_name || profile?.username || row.organizer_name || 'ABSU Organizer',
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
    userResponse:
      userResponse === 'interested' || userResponse === 'going' ? userResponse : null,
    isSaved,
    isOrganizer: Boolean(currentUserId && row.organizer_id === currentUserId),
  };
}

async function recalculateEventCountsDirect(eventId: string): Promise<{
  interestedCount: number;
  goingCount: number;
}> {
  const [interestedRes, goingRes] = await Promise.all([
    supabase
      .from('event_participants')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('response', 'interested'),
    supabase
      .from('event_participants')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('response', 'going'),
  ]);

  const interestedCount = interestedRes.count || 0;
  const goingCount = goingRes.count || 0;

  await supabase
    .from('campus_events')
    .update({ interested_count: interestedCount, going_count: goingCount })
    .eq('id', eventId);

  return { interestedCount, goingCount };
}

export async function fetchCampusEvents(params?: {
  category?: string;
  search?: string;
  tab?: 'all' | 'today' | 'saved' | 'my';
  userId?: string;
}): Promise<CampusEvent[]> {
  purgeLegacyLocalEventCache();
  try {
    const qs = new URLSearchParams();
    if (params?.userId) qs.set('userId', params.userId);
    if (params?.category) qs.set('category', params.category);
    if (params?.search) qs.set('search', params.search);
    if (params?.tab) qs.set('tab', params.tab);

    const headers = await getAuthHeaders(false);
    const res = await fetch(`/api/events?${qs.toString()}`, { headers }).catch(() => null);
    const json = res?.ok ? await parseApiJson(res) : null;
    if (json?.success && Array.isArray(json.events)) {
      return json.events;
    }
  } catch {
    // fallback below
  }

  try {
    let query = supabase
      .from('campus_events')
      .select('*')
      .neq('status', 'draft')
      .order('start_time', { ascending: true });

    if (params?.category && params.category !== 'All') {
      query = query.eq('category', params.category);
    }

    const { data: rows, error } = await query.limit(100);
    if (error || !rows) return [];

    const organizerIds = Array.from(
      new Set(rows.map((e: any) => e.organizer_id).filter(Boolean))
    );
    const profileMap = new Map<string, any>();

    if (organizerIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, username, avatar_url')
        .in('id', organizerIds);
      for (const p of profiles || []) profileMap.set(p.id, p);
    }

    const responseMap = new Map<string, string>();
    const savedSet = new Set<string>();

    if (params?.userId && rows.length > 0) {
      const [partRes, savedRes] = await Promise.all([
        supabase
          .from('event_participants')
          .select('event_id, response')
          .eq('user_id', params.userId),
        supabase
          .from('saved_events')
          .select('event_id')
          .eq('user_id', params.userId),
      ]);
      for (const p of partRes.data || []) responseMap.set(p.event_id, p.response);
      for (const s of savedRes.data || []) savedSet.add(s.event_id);
    }

    let mapped = rows.map((row: any) =>
      mapEventRow(
        row,
        profileMap.get(row.organizer_id),
        responseMap.get(row.id) || null,
        savedSet.has(row.id),
        params?.userId
      )
    );

    if (params?.search) {
      const search = params.search.trim().toLowerCase();
      if (search) {
        mapped = mapped.filter(
          (ev) =>
            ev.title.toLowerCase().includes(search) ||
            ev.description.toLowerCase().includes(search) ||
            ev.venue.toLowerCase().includes(search)
        );
      }
    }

    if (params?.tab === 'today') {
      const today = new Date().toISOString().slice(0, 10);
      mapped = mapped.filter((ev) => (ev.startTime || '').slice(0, 10) === today);
    } else if (params?.tab === 'saved') {
      mapped = mapped.filter((ev) => ev.isSaved);
    } else if (params?.tab === 'my' && params?.userId) {
      mapped = mapped.filter(
        (ev) => ev.userResponse !== null || ev.organizerId === params.userId
      );
    }

    return mapped;
  } catch {
    return [];
  }
}

export async function fetchEventById(
  eventId: string,
  userId?: string
): Promise<CampusEvent | null> {
  purgeLegacyLocalEventCache();
  if (!eventId) return null;
  try {
    const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    const headers = await getAuthHeaders(false);
    const res = await fetch(`/api/events/${encodeURIComponent(eventId)}${qs}`, { headers }).catch(
      () => null
    );
    const json = res?.ok ? await parseApiJson(res) : null;
    if (json?.success && json.event) return json.event;
  } catch {
    // fallback below
  }

  try {
    const { data: row, error } = await supabase
      .from('campus_events')
      .select('*')
      .eq('id', eventId)
      .maybeSingle();

    if (error || !row) return null;

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, display_name, username, avatar_url')
      .eq('id', row.organizer_id)
      .maybeSingle();

    let userResponse: string | null = null;
    let isSaved = false;
    if (userId) {
      const [partRes, savedRes] = await Promise.all([
        supabase
          .from('event_participants')
          .select('response')
          .eq('event_id', eventId)
          .eq('user_id', userId)
          .maybeSingle(),
        supabase
          .from('saved_events')
          .select('id')
          .eq('event_id', eventId)
          .eq('user_id', userId)
          .maybeSingle(),
      ]);
      userResponse = partRes.data?.response || null;
      isSaved = Boolean(savedRes.data);
    }

    return mapEventRow(row, profile, userResponse, isSaved, userId);
  } catch {
    return null;
  }
}

export async function createCampusEvent(
  input: CreateEventInput,
  organizerId: string,
  posterFile?: File
): Promise<{ success: boolean; event?: CampusEvent; error?: string }> {
  try {
    let posterUrl = input.posterUrl;
    if (posterFile) {
      const upRes = await uploadEventFlyerToStorage(organizerId, posterFile);
      if (!upRes.success || !upRes.url) {
        return { success: false, error: upRes.error || 'Failed to upload event flyer.' };
      }
      posterUrl = upRes.url;
    }

    const headers = await getAuthHeaders(true);
    const res = await fetch('/api/events', {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...input, posterUrl, organizerId }),
    }).catch(() => null);

    const json = await parseApiJson(res);
    if (res && json) {
      if (res.ok && json.success && json.event) {
        return { success: true, event: json.event };
      }
      if (res.status !== 404 && json.error) {
        return { success: false, error: json.error };
      }
    }

    // Direct Supabase fallback
    const { data: created, error } = await supabase
      .from('campus_events')
      .insert({
        title: String(input.title || '').trim(),
        description: String(input.description || '').trim(),
        category: input.category || 'Academic',
        organizer_id: organizerId,
        venue: String(input.venue || '').trim(),
        campus: input.campus || 'Uturu (Main Campus)',
        start_time: input.startTime,
        end_time: input.endTime || null,
        poster_url: posterUrl || null,
        status: 'published',
        visibility: (input as any).visibility === 'campus_only' ? 'campus_only' : 'public',
        registration_link: input.registrationLink || null,
        is_online: Boolean((input as any).isOnline),
        online_url: (input as any).onlineUrl || null,
        capacity_limit: (input as any).capacityLimit ? Number((input as any).capacityLimit) : null,
        community_id: (input as any).communityId || null,
        interested_count: 0,
        going_count: 1,
      })
      .select('*')
      .single();

    if (error || !created) {
      return { success: false, error: error?.message || 'Failed to publish campus event.' };
    }

    await supabase.from('event_participants').upsert(
      {
        event_id: created.id,
        user_id: organizerId,
        response: 'going',
      },
      { onConflict: 'event_id,user_id' }
    );

    return {
      success: true,
      event: mapEventRow(created, null, 'going', false, organizerId),
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to create event.',
    };
  }
}

export async function respondToEvent(
  eventId: string,
  userId: string,
  response: EventResponse | null
): Promise<{ success: boolean; interestedCount: number; goingCount: number; error?: string }> {
  try {
    const headers = await getAuthHeaders(true);
    const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/respond`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId, response }),
    }).catch(() => null);

    const json = await parseApiJson(res);
    if (res && json) {
      if (res.ok && json.success) {
        return {
          success: true,
          interestedCount: Number(json.interestedCount || 0),
          goingCount: Number(json.goingCount || 0),
        };
      }
      if (res.status !== 404 && json.error) {
        return { success: false, interestedCount: 0, goingCount: 0, error: json.error };
      }
    }

    // Direct Supabase fallback
    if (!response) {
      const { error } = await supabase
        .from('event_participants')
        .delete()
        .eq('event_id', eventId)
        .eq('user_id', userId);
      if (error) {
        return { success: false, interestedCount: 0, goingCount: 0, error: error.message };
      }
    } else {
      const { error } = await supabase.from('event_participants').upsert(
        {
          event_id: eventId,
          user_id: userId,
          response,
        },
        { onConflict: 'event_id,user_id' }
      );
      if (error) {
        return { success: false, interestedCount: 0, goingCount: 0, error: error.message };
      }
    }

    const counts = await recalculateEventCountsDirect(eventId);
    return { success: true, ...counts };
  } catch (err: unknown) {
    return {
      success: false,
      interestedCount: 0,
      goingCount: 0,
      error: err instanceof Error ? err.message : 'Failed to RSVP.',
    };
  }
}

export async function toggleSaveEvent(
  eventId: string,
  userId: string,
  isSaved: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const headers = await getAuthHeaders(true);
    const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/save`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId, isSaved }),
    }).catch(() => null);

    const json = await parseApiJson(res);
    if (res && json) {
      if (res.ok && json.success) return { success: true };
      if (res.status !== 404 && json.error) return { success: false, error: json.error };
    }

    // Direct Supabase fallback
    if (isSaved) {
      const { error } = await supabase
        .from('saved_events')
        .delete()
        .eq('event_id', eventId)
        .eq('user_id', userId);
      if (error) return { success: false, error: error.message };
    } else {
      const { error } = await supabase
        .from('saved_events')
        .upsert({ event_id: eventId, user_id: userId }, { onConflict: 'event_id,user_id', ignoreDuplicates: true });
      if (error) return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to save event.' };
  }
}

export async function cancelCampusEvent(
  eventId: string,
  organizerId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const headers = await getAuthHeaders(true);
    const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/cancel`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ organizerId }),
    }).catch(() => null);

    const json = await parseApiJson(res);
    if (res && json) {
      if (res.ok && json.success) return { success: true };
      if (res.status !== 404 && json.error) return { success: false, error: json.error };
    }

    const { error } = await supabase
      .from('campus_events')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', eventId)
      .eq('organizer_id', organizerId);

    return error ? { success: false, error: error.message } : { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to cancel event.' };
  }
}

export async function editCampusEvent(
  eventId: string,
  input: Partial<CreateEventInput>,
  organizerId: string
): Promise<{ success: boolean; event?: CampusEvent; error?: string }> {
  try {
    const headers = await getAuthHeaders(true);
    const res = await fetch(`/api/events/${encodeURIComponent(eventId)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ ...input, organizerId }),
    }).catch(() => null);

    const json = await parseApiJson(res);
    if (res && json) {
      if (res.ok && json.success && json.event) {
        return { success: true, event: json.event };
      }
      if (res.status !== 404 && json.error) {
        return { success: false, error: json.error };
      }
    }

    // Direct Supabase fallback
    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (input.title !== undefined) updates.title = input.title;
    if (input.description !== undefined) updates.description = input.description;
    if (input.category !== undefined) updates.category = input.category;
    if (input.venue !== undefined) updates.venue = input.venue;
    if (input.campus !== undefined) updates.campus = input.campus;
    if (input.startTime !== undefined) updates.start_time = input.startTime;
    if (input.endTime !== undefined) updates.end_time = input.endTime;
    if (input.posterUrl !== undefined) updates.poster_url = input.posterUrl;
    if (input.registrationLink !== undefined) updates.registration_link = input.registrationLink;

    const { data, error } = await supabase
      .from('campus_events')
      .update(updates)
      .eq('id', eventId)
      .eq('organizer_id', organizerId)
      .select('*')
      .single();

    if (error || !data) {
      return { success: false, error: error?.message || 'Failed to update event.' };
    }
    return { success: true, event: mapEventRow(data, null, null, false, organizerId) };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update event.' };
  }
}

export async function fetchEventParticipants(eventId: string): Promise<EventParticipant[]> {
  try {
    const headers = await getAuthHeaders(false);
    const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/participants`, {
      headers,
    }).catch(() => null);
    const json = res?.ok ? await parseApiJson(res) : null;
    if (json?.success && Array.isArray(json.participants)) {
      return json.participants;
    }
  } catch {
    // fallback below
  }

  try {
    const { data: rows, error } = await supabase
      .from('event_participants')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false });

    if (error || !rows) return [];

    const userIds = Array.from(new Set(rows.map((r: any) => r.user_id).filter(Boolean)));
    const profileMap = new Map<string, any>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, username, avatar_url, department, level')
        .in('id', userIds);
      for (const p of profiles || []) profileMap.set(p.id, p);
    }

    return rows.map((r: any) => {
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
  } catch {
    return [];
  }
}

export async function fetchOrganizerDashboard(organizerId: string): Promise<{
  totalEvents: number;
  totalInterested: number;
  totalGoing: number;
  events: CampusEvent[];
}> {
  if (!organizerId) {
    return { totalEvents: 0, totalInterested: 0, totalGoing: 0, events: [] };
  }
  try {
    const headers = await getAuthHeaders(false);
    const res = await fetch(
      `/api/events/organizer/dashboard?organizerId=${encodeURIComponent(organizerId)}`,
      { headers }
    ).catch(() => null);
    const json = res?.ok ? await parseApiJson(res) : null;
    if (json?.success) {
      return {
        totalEvents: Number(json.totalEvents || 0),
        totalInterested: Number(json.totalInterested || 0),
        totalGoing: Number(json.totalGoing || 0),
        events: json.events || [],
      };
    }
  } catch {
    // fallback below
  }

  try {
    const { data: rows, error } = await supabase
      .from('campus_events')
      .select('*')
      .eq('organizer_id', organizerId)
      .order('created_at', { ascending: false });

    if (error || !rows) {
      return { totalEvents: 0, totalInterested: 0, totalGoing: 0, events: [] };
    }

    const mapped = rows.map((r: any) => mapEventRow(r, null, null, false, organizerId));
    const totalInterested = mapped.reduce((sum, e) => sum + e.interestedCount, 0);
    const totalGoing = mapped.reduce((sum, e) => sum + e.goingCount, 0);

    return {
      totalEvents: mapped.length,
      totalInterested,
      totalGoing,
      events: mapped,
    };
  } catch {
    return { totalEvents: 0, totalInterested: 0, totalGoing: 0, events: [] };
  }
}

export async function deleteCampusEvent(
  eventId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const headers = await getAuthHeaders(true);
    const res = await fetch(`/api/events/${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ userId }),
    }).catch(() => null);

    const json = await parseApiJson(res);
    if (res && json) {
      if (res.ok && json.success) return { success: true };
      if (res.status !== 404 && json.error) return { success: false, error: json.error };
    }

    const { error } = await supabase
      .from('campus_events')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', eventId)
      .eq('organizer_id', userId);

    return error ? { success: false, error: error.message } : { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to archive event.' };
  }
}
