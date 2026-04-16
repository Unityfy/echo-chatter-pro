
CREATE TABLE public.phone_numbers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  phone_number text NOT NULL,
  provider text NOT NULL DEFAULT 'exotel',
  provider_number_id text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.phone_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view phone numbers"
  ON public.phone_numbers FOR SELECT TO authenticated
  USING (is_team_member(auth.uid(), team_id));

CREATE POLICY "Team admins can create phone numbers"
  ON public.phone_numbers FOR INSERT TO authenticated
  WITH CHECK (is_team_admin(auth.uid(), team_id));

CREATE POLICY "Team admins can update phone numbers"
  ON public.phone_numbers FOR UPDATE TO authenticated
  USING (is_team_admin(auth.uid(), team_id));

CREATE POLICY "Team admins can delete phone numbers"
  ON public.phone_numbers FOR DELETE TO authenticated
  USING (is_team_admin(auth.uid(), team_id));

CREATE TRIGGER update_phone_numbers_updated_at
  BEFORE UPDATE ON public.phone_numbers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
