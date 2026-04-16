-- 1. fallback number on teams
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS fallback_number text;

-- 2. webhook token on exotel_accounts (used to authenticate incoming Exotel webhooks)
ALTER TABLE public.exotel_accounts
  ADD COLUMN IF NOT EXISTS webhook_token text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex');

CREATE UNIQUE INDEX IF NOT EXISTS exotel_accounts_webhook_token_key
  ON public.exotel_accounts(webhook_token);

-- 3. calls table
CREATE TABLE IF NOT EXISTS public.calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  agent_id uuid,
  phone_number_id uuid,
  provider text NOT NULL DEFAULT 'exotel',
  call_sid text,
  direction text NOT NULL DEFAULT 'inbound', -- inbound | outbound
  from_number text,
  to_number text,
  status text NOT NULL DEFAULT 'ringing',     -- ringing | in-progress | completed | failed | no-agent | forwarded
  started_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  recording_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS calls_team_id_idx ON public.calls(team_id);
CREATE INDEX IF NOT EXISTS calls_agent_id_idx ON public.calls(agent_id);
CREATE INDEX IF NOT EXISTS calls_call_sid_idx ON public.calls(call_sid);
CREATE INDEX IF NOT EXISTS calls_started_at_idx ON public.calls(started_at DESC);

ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view calls"
  ON public.calls FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid(), team_id));

CREATE POLICY "Team admins can insert calls"
  ON public.calls FOR INSERT TO authenticated
  WITH CHECK (public.is_team_admin(auth.uid(), team_id));

CREATE POLICY "Team admins can update calls"
  ON public.calls FOR UPDATE TO authenticated
  USING (public.is_team_admin(auth.uid(), team_id));

CREATE POLICY "Team admins can delete calls"
  ON public.calls FOR DELETE TO authenticated
  USING (public.is_team_admin(auth.uid(), team_id));

CREATE TRIGGER calls_set_updated_at
  BEFORE UPDATE ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();