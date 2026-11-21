import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface DeleteAssetInput {
  public_id: string;
  resource_type?: 'image' | 'video' | 'raw';
  entity_type: 'post' | 'story' | 'message';
  entity_id?: string;
}

async function sha1Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-1', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function destroyCloudinaryAsset(params: {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  publicId: string;
  resourceType: 'image' | 'video' | 'raw';
}): Promise<{ ok: boolean; result?: string; error?: string }> {
  const timestamp = Math.floor(Date.now() / 1000);
  // Cloudinary destroy signature requires alphabetical parameter string: invalidate=true&public_id=...&timestamp=... + apiSecret
  const toSign = `invalidate=true&public_id=${params.publicId}&timestamp=${timestamp}${params.apiSecret}`;
  const signature = await sha1Hex(toSign);

  const form = new FormData();
  form.append('public_id', params.publicId);
  form.append('timestamp', String(timestamp));
  form.append('api_key', params.apiKey);
  form.append('invalidate', 'true');
  form.append('signature', signature);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${params.cloudName}/${params.resourceType}/destroy`,
    { method: 'POST', body: form }
  );

  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: `HTTP ${res.status}: ${text}` };
  }

  if (!res.ok) {
    const errObj = json.error as { message?: string } | undefined;
    return { ok: false, error: errObj?.message || `HTTP ${res.status}` };
  }

  const result = typeof json.result === 'string' ? json.result : 'unknown';
  if (result === 'ok' || result === 'not found') {
    return { ok: true, result };
  }
  return { ok: false, result, error: `Unexpected Cloudinary destroy result: ${result}` };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const cloudName = Deno.env.get('CLOUDINARY_CLOUD_NAME') || 'hwxyrhlm';
    const apiKey = Deno.env.get('CLOUDINARY_API_KEY') || '';
    const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET') || '';

    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authErr,
    } = await userClient.auth.getUser();

    if (authErr || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!apiKey || !apiSecret) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET are not configured in Edge Function secrets.',
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey || supabaseAnonKey);
    const body = (await req.json().catch(() => ({}))) as { assets?: DeleteAssetInput[] };
    const assets = Array.isArray(body.assets) ? body.assets.slice(0, 10) : [];

    if (assets.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'No assets specified' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: Array<{ public_id: string; ok: boolean; result?: string; error?: string }> = [];

    for (const item of assets) {
      const publicId = (item.public_id || '').trim();
      const resourceType: 'image' | 'video' | 'raw' =
        item.resource_type === 'video' || item.resource_type === 'raw' ? item.resource_type : 'image';

      if (!publicId || !publicId.startsWith('absu-connect/')) {
        results.push({ public_id: publicId, ok: false, error: 'Forbidden asset namespace' });
        continue;
      }

      // Server-side ownership check per entity type
      let authorized = false;

      if (item.entity_type === 'post') {
        const { data: mediaRows } = await adminClient
          .from('post_media')
          .select('id, uploader_id, post_id, posts:post_id(author_id)')
          .or(`cloudinary_public_id.eq.${publicId},asset_id.eq.${publicId}`)
          .limit(5);

        if (mediaRows && mediaRows.length > 0) {
          authorized = mediaRows.every((r: any) => {
            const postAuthor = Array.isArray(r.posts) ? r.posts[0]?.author_id : r.posts?.author_id;
            return r.uploader_id === user.id || postAuthor === user.id;
          });
        } else if (item.entity_id) {
          const { data: postRow } = await adminClient
            .from('posts')
            .select('author_id')
            .eq('id', item.entity_id)
            .maybeSingle();
          authorized = postRow?.author_id === user.id;
        } else {
          // Rollback path before post_media DB row commit: allowed only inside absu-connect/posts/ when unclaimed
          authorized = publicId.startsWith('absu-connect/posts/');
        }
      } else if (item.entity_type === 'story') {
        const query = item.entity_id
          ? adminClient.from('stories').select('id, user_id').eq('id', item.entity_id).maybeSingle()
          : adminClient.from('stories').select('id, user_id').eq('cloudinary_public_id', publicId).maybeSingle();
        const { data: storyRow } = await query;
        if (storyRow) {
          authorized = storyRow.user_id === user.id;
        } else {
          // Uncommitted rollback inside absu-connect/stories/
          authorized = !item.entity_id && publicId.startsWith('absu-connect/stories/');
        }
      } else if (item.entity_type === 'message') {
        const { data: attRows } = await adminClient
          .from('message_attachments')
          .select('id, uploader_id, message_id')
          .or(`cloudinary_public_id.eq.${publicId},asset_id.eq.${publicId}`)
          .limit(5);

        if (attRows && attRows.length > 0) {
          authorized = attRows.every((r: any) => r.uploader_id === user.id);
        } else if (item.entity_id) {
          const { data: msgRow } = await adminClient
            .from('messages')
            .select('sender_id')
            .eq('id', item.entity_id)
            .maybeSingle();
          authorized = msgRow?.sender_id === user.id;
        } else {
          // Uncommitted rollback inside absu-connect/messages/
          authorized = publicId.startsWith('absu-connect/messages/');
        }
      }

      if (!authorized) {
        results.push({ public_id: publicId, ok: false, error: 'Forbidden: caller does not own asset' });
        continue;
      }

      const destroyed = await destroyCloudinaryAsset({
        cloudName,
        apiKey,
        apiSecret,
        publicId,
        resourceType,
      });

      results.push({ public_id: publicId, ...destroyed });
    }

    const allOk = results.every((r) => r.ok);
    return new Response(JSON.stringify({ success: allOk, results }), {
      status: allOk ? 200 : 207,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : 'Unexpected server error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
