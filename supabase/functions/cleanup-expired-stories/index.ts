import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_CLEANUP_ATTEMPTS = 8;

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
  resourceType: 'image' | 'video';
}): Promise<{ ok: boolean; result?: string; error?: string }> {
  const timestamp = Math.floor(Date.now() / 1000);
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
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const cronSecret = Deno.env.get('CRON_SECRET') || '';
    const cloudName = Deno.env.get('CLOUDINARY_CLOUD_NAME') || 'hwxyrhlm';
    const apiKey = Deno.env.get('CLOUDINARY_API_KEY') || '';
    const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET') || '';

    const authHeader = req.headers.get('Authorization') || '';
    const providedCronSecret = req.headers.get('x-cron-secret') || '';
    const isServiceCaller =
      (serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`) ||
      (cronSecret && providedCronSecret === cronSecret);

    if (!isServiceCaller) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized cleanup trigger' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!supabaseUrl || !serviceRoleKey || !apiKey || !apiSecret) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required server secrets (SUPABASE_SERVICE_ROLE_KEY, CLOUDINARY_API_KEY, or CLOUDINARY_API_SECRET).',
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const nowIso = new Date().toISOString();

    const { data: candidates, error: queryErr } = await admin
      .from('stories')
      .select(
        'id, media_type, cloudinary_public_id, cloudinary_resource_type, cleanup_status, cleanup_attempts, expires_at, deleted_at'
      )
      .not('cloudinary_public_id', 'is', null)
      .in('cleanup_status', ['pending', 'failed'])
      .lt('cleanup_attempts', MAX_CLEANUP_ATTEMPTS)
      .or(`expires_at.lte.${nowIso},deleted_at.not.is.null`)
      .order('expires_at', { ascending: true })
      .limit(50);

    if (queryErr) {
      return new Response(JSON.stringify({ success: false, error: queryErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rows = candidates || [];
    let completed = 0;
    let failed = 0;
    let deadLetter = 0;

    for (const row of rows) {
      const publicId = String(row.cloudinary_public_id || '').trim();
      if (!publicId.startsWith('absu-connect/stories/')) {
        await admin
          .from('stories')
          .update({
            cleanup_status: 'dead_letter',
            last_cleanup_at: nowIso,
            cleanup_error: 'Invalid Cloudinary folder namespace for story asset',
          })
          .eq('id', row.id);
        deadLetter++;
        continue;
      }

      const resourceType: 'image' | 'video' =
        row.cloudinary_resource_type === 'video' || row.media_type === 'video' ? 'video' : 'image';

      const destroyRes = await destroyCloudinaryAsset({
        cloudName,
        apiKey,
        apiSecret,
        publicId,
        resourceType,
      });

      const nextAttempts = (row.cleanup_attempts || 0) + 1;

      if (destroyRes.ok) {
        await admin
          .from('stories')
          .update({
            cleanup_status: 'completed',
            cleanup_attempts: nextAttempts,
            last_cleanup_at: new Date().toISOString(),
            cleanup_error: null,
            deleted_at: row.deleted_at || new Date().toISOString(),
          })
          .eq('id', row.id);
        completed++;
      } else {
        const nextStatus = nextAttempts >= MAX_CLEANUP_ATTEMPTS ? 'dead_letter' : 'failed';
        await admin
          .from('stories')
          .update({
            cleanup_status: nextStatus,
            cleanup_attempts: nextAttempts,
            last_cleanup_at: new Date().toISOString(),
            cleanup_error: destroyRes.error || 'Unknown Cloudinary cleanup error',
          })
          .eq('id', row.id);
        if (nextStatus === 'dead_letter') deadLetter++;
        else failed++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: rows.length,
        completed,
        failed,
        dead_letter: deadLetter,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : 'Unexpected cleanup error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
