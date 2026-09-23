-- ============================================================
-- OpenTv — Bootstrap do ADMIN (corrigido para perfis ausentes)
-- ============================================================
-- Passo 1: Garantir que o schema está aplicado (já feito)
-- Passo 2: Criar perfil se não existir, ou atualizar se existir

-- Primeiro, tentar inserir se não existir (para contas criadas antes do schema)
INSERT INTO public.profiles (id, email, full_name, role, status)
SELECT u.id, u.email, COALESCE(u.user_metadata ->> 'full_name', ''), 'admin', 'approved'
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p 
  WHERE p.id = u.id
)
AND email = 'SEU-EMAIL-AQUI';

-- Passo 2: Se já existir um perfil, atualize para admin/approved
UPDATE public.profiles 
SET role = 'admin', status = 'approved'
WHERE email = 'SEU-EMAIL-AQUI';

-- Passo 3: Garantir que o trigger está ativo para futuros usuários
-- (Este passo é opcional se o schema.sql já foi rodado)
-- (Já está no schema.sql, então não precisa ser refeito)