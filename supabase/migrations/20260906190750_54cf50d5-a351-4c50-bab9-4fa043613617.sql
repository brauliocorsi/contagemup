CREATE OR REPLACE FUNCTION public.prevent_profile_role_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Role changes are not permitted via direct profile updates';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_role(p_user_id uuid, p_role text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT public.has_role(uid, 'admin') THEN RAISE EXCEPTION 'Apenas administradores podem alterar perfis'; END IF;
  IF p_role NOT IN ('admin','operator','entregador') THEN RAISE EXCEPTION 'Perfil inválido'; END IF;
  IF p_user_id = uid AND p_role <> 'admin' THEN
    RAISE EXCEPTION 'Não pode retirar o seu próprio acesso de administrador';
  END IF;
  UPDATE public.profiles SET role = p_role, updated_at = now() WHERE user_id = p_user_id;
  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE EXECUTE ON FUNCTION public.set_user_role(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, text) TO authenticated, service_role;