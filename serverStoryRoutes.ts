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

export function registerStoryRoutes(app: Express) {
  // 1. Fetch active stories directly from Supabase with signed media URLs
  app.get('/api/stories', async (req: Request, res: Response) => {
    try {
      const sb = createUserClient(req);
      const currentUserId = req.query.userId as string | undefined;
      const nowIso = new Date().toISOString();

      let storiesData: any[] | null = null;
      let storiesErr: any = null;

      const extRes = await sb
        .from('stories')
        .select(`
          id,
          user_id,
          media_type,
          storage_path,
          media_url,
          provider,
          cloudinary_public_id,
          cloudinary_resource_type,
          duration_seconds,
          thumbnail_url,
          text_content,
          caption,
          background_color,
          font_style,
          deleted_at,
          created_at,
          expires_at
        `)
        .gt('expires_at', nowIso)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });

      if (
        extRes.error &&
        (extRes.error.code === '42703' ||
          extRes.error.code === 'PGRST204' ||
          extRes.error.message?.toLowerCase().includes('schema cache') ||
          extRes.error.message?.toLowerCase().includes('column'))
      ) {
        const coreRes = await sb
          .from('stories')
          .select('id, user_id, media_type, storage_path, text_content, caption, created_at, expires_at')
          .gt('expires_at', nowIso)
          .order('created_at', { ascending: true });
        storiesData = coreRes.data;
        storiesErr = coreRes.error;
      } else {
        storiesData = extRes.data;
        storiesErr = extRes.error;
      }

      if (storiesErr) {
        res.status(500).json({ success: false, error: storiesErr.message });
        return;
      }

      const stories = storiesData || [];
      const userIds = Array.from(new Set(stories.map((s) => s.user_id)));
      const storyIds = stories.map((s) => s.id);
      const profileMap = new Map<string, any>();

      if (userIds.length > 0) {
        const { data: profiles } = await sb
          .from('profiles')
          .select('id, display_name, username, avatar_url, department, level')
          .in('id', userIds);
        if (profiles) {
          for (const p of profiles) profileMap.set(p.id, p);
        }
      }

      // Batch sign private legacy story-media storage paths
      const mediaPaths = Array.from(
        new Set(
          stories
            .map((s) => (s.media_url || s.storage_path || '') as string)
            .filter(
              (ref) =>
                Boolean(ref) &&
                !ref.startsWith('http://') &&
                !ref.startsWith('https://') &&
                !ref.startsWith('data:')
            )
        )
      );

      const signedUrlMap = new Map<string, string>();
      if (mediaPaths.length > 0) {
        try {
          const { data: signedList } = await sb.storage
            .from('story-media')
            .createSignedUrls(mediaPaths, 86400);
          if (signedList) {
            for (const item of signedList) {
              if (item.path && item.signedUrl) {
                signedUrlMap.set(item.path, item.signedUrl);
              }
            }
          }
        } catch (signErr) {
          console.warn('[Stories] Batch sign warning:', signErr);
        }
      }

      const viewedSet = new Set<string>();
      const reactedSet = new Set<string>();

      if (currentUserId && storyIds.length > 0) {
        const [viewsRes, reactionsRes] = await Promise.all([
          sb.from('story_views').select('story_id').in('story_id', storyIds).eq('viewer_id', currentUserId),
          sb.from('story_reactions').select('story_id').in('story_id', storyIds).eq('user_id', currentUserId),
        ]);
        for (const v of viewsRes.data || []) viewedSet.add(v.story_id);
        for (const r of reactionsRes.data || []) reactedSet.add(r.story_id);
      }

      const groupMap = new Map<string, any>();
      for (const story of stories) {
        const author = profileMap.get(story.user_id);
        const displayName = author?.display_name || author?.username || 'ABSU Student';
        const rawRef = story.media_url || story.storage_path || '';
        const resolvedPath =
          story.media_type === 'text'
            ? null
            : rawRef && signedUrlMap.has(rawRef)
            ? signedUrlMap.get(rawRef)
            : rawRef || null;

        const resolvedStory = {
          ...story,
          storage_path: resolvedPath,
          media_url: story.media_url || resolvedPath,
          provider: story.provider || (String(resolvedPath || '').includes('res.cloudinary.com') ? 'cloudinary' : 'supabase'),
          raw_storage_path: story.storage_path,
          has_viewed: viewedSet.has(story.id),
          has_reacted: reactedSet.has(story.id),
          user: {
            id: story.user_id,
            name: displayName,
            avatar_url: author?.avatar_url,
            department: author?.department,
          },
        };

        const uId = story.user_id;
        if (!groupMap.has(uId)) {
          groupMap.set(uId, {
            user_id: uId,
            user_name: displayName,
            user_avatar: author?.avatar_url,
            has_unviewed: false,
            latest_timestamp: story.created_at,
            stories: [],
          });
        }

        const group = groupMap.get(uId)!;
        group.stories.push(resolvedStory);
        if (!resolvedStory.has_viewed && uId !== currentUserId) {
          group.has_unviewed = true;
        }
        if (new Date(story.created_at) > new Date(group.latest_timestamp)) {
          group.latest_timestamp = story.created_at;
        }
      }

      const groups = Array.from(groupMap.values());
      groups.sort((a, b) => {
        if (a.user_id === currentUserId) return -1;
        if (b.user_id === currentUserId) return 1;
        if (a.has_unviewed && !b.has_unviewed) return -1;
        if (!a.has_unviewed && b.has_unviewed) return 1;
        return new Date(b.latest_timestamp).getTime() - new Date(a.latest_timestamp).getTime();
      });

      res.json({ success: true, groups });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch stories';
      res.status(500).json({ success: false, error: msg });
    }
  });

  // 2. Publish a new 24-hour story to Supabase (MPV2 Cloudinary + MPV1 schema compatibility)
  app.post('/api/stories', async (req: Request, res: Response) => {
    try {
      const sb = createUserClient(req);
      const userId = req.body.userId || req.body.user_id;
      const mediaType = req.body.mediaType || req.body.media_type;
      const storagePath = req.body.storagePath || req.body.storage_path;
      const mediaUrl = req.body.mediaUrl || req.body.media_url || storagePath || null;
      const provider = req.body.provider || (String(mediaUrl || '').includes('res.cloudinary.com') ? 'cloudinary' : null);
      const cloudinaryPublicId = req.body.cloudinaryPublicId || req.body.cloudinary_public_id || null;
      const cloudinaryResourceType = req.body.cloudinaryResourceType || req.body.cloudinary_resource_type || null;
      const durationSeconds = req.body.durationSeconds ?? req.body.duration_seconds ?? null;
      const thumbnailUrl = req.body.thumbnailUrl || req.body.thumbnail_url || null;
      const backgroundColor = req.body.backgroundColor || req.body.background_color || null;
      const fontStyle = req.body.fontStyle || req.body.font_style || null;
      const textContent = req.body.textContent || req.body.text_content;
      const caption = req.body.caption;
      const expiresAt =
        req.body.expiresAt ||
        req.body.expires_at ||
        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      if (!userId || !mediaType) {
        res.status(400).json({ success: false, error: 'Missing required parameters (userId and mediaType are required).' });
        return;
      }

      const extendedPayload: Record<string, any> = {
        user_id: userId,
        media_type: mediaType,
        storage_path: mediaUrl || null,
        media_url: mediaUrl || null,
        provider: provider || 'supabase',
        cloudinary_public_id: cloudinaryPublicId,
        cloudinary_resource_type: cloudinaryResourceType,
        duration_seconds: durationSeconds,
        thumbnail_url: thumbnailUrl,
        cleanup_status: cloudinaryPublicId ? 'pending' : 'not_needed',
        text_content: textContent ? String(textContent).trim() : null,
        caption: caption ? String(caption).trim() : null,
        background_color: backgroundColor,
        font_style: fontStyle,
        expires_at: expiresAt,
      };

      let { data, error } = await sb
        .from('stories')
        .insert(extendedPayload)
        .select()
        .single();

      if (
        error &&
        (error.code === '42703' ||
          error.code === 'PGRST204' ||
          error.message?.toLowerCase().includes('schema cache') ||
          error.message?.toLowerCase().includes('column'))
      ) {
        const corePayload: Record<string, any> = {
          user_id: userId,
          media_type: mediaType,
          storage_path: mediaUrl || null,
          text_content: textContent ? String(textContent).trim() : null,
          caption: caption ? String(caption).trim() : null,
          expires_at: expiresAt,
        };
        const retryRes = await sb.from('stories').insert(corePayload).select().single();
        data = retryRes.data;
        error = retryRes.error;
      }

      if (error || !data) {
        res.status(400).json({ success: false, error: error?.message || 'Failed to save story' });
        return;
      }

      let signedUrl = data.media_url || data.storage_path || mediaUrl;
      if (
        signedUrl &&
        data.media_type !== 'text' &&
        !signedUrl.startsWith('http://') &&
        !signedUrl.startsWith('https://') &&
        !signedUrl.startsWith('data:')
      ) {
        try {
          const { data: signRes } = await sb.storage
            .from('story-media')
            .createSignedUrl(signedUrl, 86400);
          if (signRes?.signedUrl) {
            signedUrl = signRes.signedUrl;
          }
        } catch {
          // keep storage path fallback
        }
      }

      res.json({
        success: true,
        story: {
          ...data,
          storage_path: signedUrl,
          media_url: data.media_url || signedUrl,
          provider: data.provider || provider,
          cloudinary_public_id: data.cloudinary_public_id || cloudinaryPublicId,
          cloudinary_resource_type: data.cloudinary_resource_type || cloudinaryResourceType,
          duration_seconds: data.duration_seconds ?? durationSeconds,
          thumbnail_url: data.thumbnail_url ?? thumbnailUrl,
          background_color: data.background_color ?? backgroundColor,
          font_style: data.font_style ?? fontStyle,
          raw_storage_path: data.storage_path,
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create story';
      res.status(500).json({ success: false, error: msg });
    }
  });

  // 3. Record story view
  app.post('/api/stories/:id/view', async (req: Request, res: Response) => {
    try {
      const sb = createUserClient(req);
      const storyId = req.params.id;
      const { viewerId } = req.body;

      if (!storyId || !viewerId) {
        res.status(400).json({ success: false, error: 'storyId and viewerId required.' });
        return;
      }

      const { error } = await sb
        .from('story_views')
        .upsert({ story_id: storyId, viewer_id: viewerId }, { onConflict: 'story_id,viewer_id', ignoreDuplicates: true });

      if (error) {
        res.status(400).json({ success: false, error: error.message });
        return;
      }

      res.json({ success: true });
    } catch {
      res.status(500).json({ success: false, error: 'View record failed' });
    }
  });

  // 4. Toggle reaction (like)
  app.post('/api/stories/:id/reaction', async (req: Request, res: Response) => {
    try {
      const sb = createUserClient(req);
      const storyId = req.params.id;
      const { userId, currentlyLiked } = req.body;

      if (!storyId || !userId) {
        res.status(400).json({ success: false, error: 'storyId and userId required.' });
        return;
      }

      if (currentlyLiked) {
        const { error } = await sb.from('story_reactions').delete().eq('story_id', storyId).eq('user_id', userId);
        if (error) {
          res.status(400).json({ success: false, error: error.message });
          return;
        }
        res.json({ success: true, liked: false });
      } else {
        const { error } = await sb.from('story_reactions').upsert(
          { story_id: storyId, user_id: userId, reaction: 'like' },
          { onConflict: 'story_id,user_id', ignoreDuplicates: true }
        );
        if (error) {
          res.status(400).json({ success: false, error: error.message });
          return;
        }
        res.json({ success: true, liked: true });
      }
    } catch {
      res.status(500).json({ success: false, error: 'Reaction toggle failed' });
    }
  });

  // 5. Story insights
  app.get('/api/stories/:id/insights', async (req: Request, res: Response) => {
    try {
      const sb = createUserClient(req);
      const storyId = req.params.id;

      const [viewsRes, reactionsRes] = await Promise.all([
        sb
          .from('story_views')
          .select(`
            id,
            story_id,
            viewer_id,
            created_at,
            profiles:viewer_id (
              id,
              display_name,
              username,
              avatar_url,
              department,
              level
            )
          `)
          .eq('story_id', storyId)
          .order('created_at', { ascending: false }),
        sb.from('story_reactions').select('id', { count: 'exact', head: true }).eq('story_id', storyId),
      ]);

      const views = (viewsRes.data || []).map((row: any) => ({
        id: row.id,
        story_id: row.story_id,
        viewer_id: row.viewer_id,
        created_at: row.created_at,
        viewer: row.profiles
          ? {
              id: row.profiles.id,
              name: row.profiles.display_name || row.profiles.username || 'ABSU Student',
              avatar_url: row.profiles.avatar_url,
              department: row.profiles.department,
              level: row.profiles.level,
            }
          : undefined,
      }));

      res.json({
        success: true,
        viewsCount: views.length,
        views,
        reactionsCount: reactionsRes.count || 0,
      });
    } catch {
      res.status(500).json({ success: false, error: 'Insights failed' });
    }
  });

  // 6. Delete story
  app.delete('/api/stories/:id', async (req: Request, res: Response) => {
    try {
      const sb = createUserClient(req);
      const storyId = req.params.id;
      const { data: existing } = await sb
        .from('stories')
        .select('storage_path')
        .eq('id', storyId)
        .maybeSingle();

      const { error } = await sb.from('stories').delete().eq('id', storyId);
      if (error) {
        res.status(400).json({ success: false, error: error.message });
        return;
      }

      if (existing?.storage_path && !existing.storage_path.startsWith('http')) {
        await sb.storage.from('story-media').remove([existing.storage_path]).catch(() => {});
      }

      res.json({ success: true });
    } catch {
      res.status(500).json({ success: false, error: 'Deletion failed' });
    }
  });
}
