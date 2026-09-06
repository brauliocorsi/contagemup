-- 0) Alargar o CHECK de funções para incluir 'master' e 'financeiro'
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('master','admin','financeiro','operator','entregador'));

-- 1) Master é reconhecido em todas as verificações de papel
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id AND (role = _role OR role = 'master')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_finance(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.user_id = _uid AND p.role IN ('master','admin','financeiro'));
$$;

-- 2) Trigger de proteção de função: só permite mudança via set_user_role (que ativa a flag de sessão)
CREATE OR REPLACE FUNCTION public.prevent_profile_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     AND coalesce(current_setting('app.allow_role_change', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Role changes are not permitted via direct profile updates';
  END IF;
  RETURN NEW;
END;
$$;

-- 3) set_user_role: apenas Master pode alterar funções; Master não se pode rebaixar
CREATE OR REPLACE FUNCTION public.set_user_role(p_user_id uuid, p_role text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  v_target_role text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = uid AND role = 'master') THEN
    RAISE EXCEPTION 'Apenas o Master pode alterar funções de utilizadores';
  END IF;
  IF p_role NOT IN ('master','admin','financeiro','operator','entregador') THEN
    RAISE EXCEPTION 'Perfil inválido';
  END IF;
  SELECT role INTO v_target_role FROM public.profiles WHERE user_id = p_user_id;
  IF v_target_role IS NULL THEN RAISE EXCEPTION 'Utilizador não encontrado'; END IF;
  IF p_user_id = uid AND p_role <> 'master' THEN
    RAISE EXCEPTION 'Não pode retirar o seu próprio papel de Master';
  END IF;
  PERFORM set_config('app.allow_role_change', 'on', true);
  UPDATE public.profiles SET role = p_role, updated_at = now() WHERE user_id = p_user_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_user_role(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, text) TO authenticated;

-- 4) Eliminar perfis: apenas Master (a eliminação real do acesso é feita pela função segura no servidor)
CREATE POLICY "Master can delete profiles"
ON public.profiles FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'master'));

-- 5) Braulio Corsi passa a Master
ALTER TABLE public.profiles DISABLE TRIGGER prevent_profile_role_change_trigger;
UPDATE public.profiles SET role = 'master', updated_at = now()
WHERE user_id = 'e7583d9a-9b09-4b3b-a588-2494742ce90a';
ALTER TABLE public.profiles ENABLE TRIGGER prevent_profile_role_change_trigger;