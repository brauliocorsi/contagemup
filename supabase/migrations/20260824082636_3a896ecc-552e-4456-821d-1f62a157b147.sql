ALTER TABLE public.profiles DISABLE TRIGGER prevent_profile_role_change_trigger;
UPDATE public.profiles SET role = 'admin' WHERE user_id = 'e7583d9a-9b09-4b3b-a588-2494742ce90a';
ALTER TABLE public.profiles ENABLE TRIGGER prevent_profile_role_change_trigger;