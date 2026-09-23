// PATCH /functions/v1/admin-users — set role (admin only)
// Body: { userId, role: 'user'|'admin' }
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

    const body = await req.json().catch(() => ({}));
    const userId = String(body.userId || body.id || '');
    const role = String(body.role || '');
    if (!userId) return err('userId obrigatório');
    if (role !== 'user' && role !== 'admin') return err('role deve ser user ou admin');

    const { data, error } = await admin
      .from('profiles')
      .update({ role })
      .eq('id', userId)
      .select('id,email,role')
      .maybeSingle();
    if (error) return err(error.message, 500);
    if (!data) return err('Usuário não encontrado', 404);
    return json({ ok: true, user: data });
  } catch (e) {
    return err(String(e?.message || e), 500);
  }
});
