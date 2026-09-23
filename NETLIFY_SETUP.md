# Deploy Netlify + Supabase — OpenTv

## 1. Banco (SQL Editor do Supabase)
1. Abra o projeto `figvurwbnocrzoupvtgs` → SQL Editor
2. Cole e rode **`supabase/schema.sql`** (cria `profiles` com `status` + RLS)
3. Crie a conta admin em `login.html` → **Criar conta** (`admin@opentv.app`)
4. SQL Editor:
```sql
UPDATE public.profiles
SET role = 'admin', status = 'approved'
WHERE email = 'admin@opentv.app';
```
5. Faça login de novo e abra `admin.html`

## Aprovação de contas
- Novo cadastro → `status = 'pending'` (não entra no app)
- Admin → **Usuários → Aprovar / Recusar**
- Recusado fica bloqueado no login
- Sem SQL local: se o host `db.*` não resolver, use só o SQL Editor do dashboard

## 2. API Keys
- **anon / publishable** no front (`meta supabase-anon`)
- **service_role / secret**: só no servidor / Edge Functions — **nunca** no repo
- Se a secret foi exposta, **regenere** em Project Settings → API

## 3. Edge Functions (opcional)
```bash
supabase login
supabase link --project-ref figvurwbnocrzoupvtgs
supabase functions deploy app-settings
supabase functions deploy app-settings-admin
supabase functions deploy admin-users
supabase functions deploy admin-set-role
supabase functions deploy xtream
```

## 4. Netlify
1. Repo GitHub `Nasci15k/unitv-web`
2. Publish directory: `.` · Build: vazio · `netlify.toml` já faz SPA redirect
3. Deploy

## 5. URLs locais
- Player: `index.html` (exige conta aprovada)
- Login: `login.html`
- ADM: `admin.html`
