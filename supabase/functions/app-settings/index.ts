// GET /functions/v1/app-settings — public app settings
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json, err, getCors } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const pre = getCors(req);
  if (pre) return pre;
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const key = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false },
    });
    const { data, error } = await admin.from('app_settings').select('key,value');
    if (error) return err(error.message, 500);
    const map: Record<string, unknown> = {};
    for (const row of data || []) map[row.key] = row.value;
    return json({ settings: map });
  } catch (e) {
    return err(String(e?.message || e), 500);
  }
});
