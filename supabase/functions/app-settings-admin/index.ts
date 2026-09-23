// PATCH /functions/v1/app-settings — admin upsert settings
// Body: { key, value } or { settings: { key: value, ... } }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json, err, getCors, requireAdmin } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const pre = getCors(req);
  if (pre) return pre;
  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    );
    const gate = await requireAdmin(req, admin);
    if (gate instanceof Response) return gate;

    const body = await req.json().catch(() => ({}));
    const rows: { key: string; value: unknown }[] = [];
    if (body.settings && typeof body.settings === 'object') {
      for (const [k, v] of Object.entries(body.settings)) rows.push({ key: k, value: v });
    } else if (body.key) {
      rows.push({ key: String(body.key), value: body.value });
    } else {
      return err('Informe key/value ou settings');
    }

    const payload = rows.map((r) => ({
      key: r.key,
      value: r.value,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await admin.from('app_settings').upsert(payload, { onConflict: 'key' });
    if (error) return err(error.message, 500);
    return json({ ok: true, saved: payload.map((p) => p.key) });
  } catch (e) {
    return err(String(e?.message || e), 500);
  }
});
