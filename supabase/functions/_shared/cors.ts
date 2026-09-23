// Shared CORS + auth helpers for Supabase Edge Functions
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function err(message: string, status = 400): Response {
  return json({ error: message }, status);
}

export function getCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  return null;
}

export async function requireAdmin(req: Request, supabase: any): Promise<{ user: any } | Response> {
  const auth = req.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return err('Não autenticado', 401);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return err('Sessão inválida', 401);
  const uid = data.user.id;
  const { data: profile, error: perr } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', uid)
    .maybeSingle();
  if (perr) return err('Falha ao verificar perfil', 500);
  if (!profile || profile.role !== 'admin') return err('Acesso negado (admin)', 403);
  return { user: data.user };
}

export async function requireUser(req: Request, supabase: any): Promise<{ user: any } | Response> {
  const auth = req.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return err('Não autenticado', 401);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return err('Sessão inválida', 401);
  return { user: data.user };
}
