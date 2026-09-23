// GET /functions/v1/admin-users — list profiles (admin only)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { json, err, getCors, requireAdmin } from '../_shared/cors.ts';

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

    const { data, error } = await admin
      .from('profiles')
      .select('id,email,full_name,role,created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) return err(error.message, 500);
    return json({ users: data || [] });
  } catch (e) {
    return err(String(e?.message || e), 500);
  }
});
