
-- Usage events (billing)
CREATE TABLE public.usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  call_id uuid,
  agent_id uuid,
  kind text NOT NULL, -- 'call', 'stt', 'tts', 'llm'
  minutes numeric NOT NULL DEFAULT 0,
  llm_prompt_tokens integer NOT NULL DEFAULT 0,
  llm_completion_tokens integer NOT NULL DEFAULT 0,
  stt_seconds numeric NOT NULL DEFAULT 0,
  tts_characters integer NOT NULL DEFAULT 0,
  cost_usd numeric NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_usage_events_team_created ON public.usage_events(team_id, created_at DESC);
CREATE INDEX idx_usage_events_call ON public.usage_events(call_id);
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members can view usage" ON public.usage_events FOR SELECT TO authenticated USING (is_team_member(auth.uid(), team_id));

-- Per-team monthly limits
CREATE TABLE public.plan_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL UNIQUE,
  plan text NOT NULL DEFAULT 'free',
  monthly_minutes_cap integer NOT NULL DEFAULT 60,
  monthly_tokens_cap integer NOT NULL DEFAULT 200000,
  monthly_cost_cap_usd numeric NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members can view limits" ON public.plan_limits FOR SELECT TO authenticated USING (is_team_member(auth.uid(), team_id));
CREATE POLICY "Team admins can update limits" ON public.plan_limits FOR UPDATE TO authenticated USING (is_team_admin(auth.uid(), team_id));
CREATE POLICY "Team admins can insert limits" ON public.plan_limits FOR INSERT TO authenticated WITH CHECK (is_team_admin(auth.uid(), team_id));
CREATE TRIGGER trg_plan_limits_updated BEFORE UPDATE ON public.plan_limits FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- System / error events (monitoring)
CREATE TABLE public.system_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid,
  level text NOT NULL DEFAULT 'info', -- 'info','warn','error'
  source text NOT NULL, -- function/component name
  message text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_system_events_created ON public.system_events(created_at DESC);
CREATE INDEX idx_system_events_team ON public.system_events(team_id, created_at DESC);
ALTER TABLE public.system_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members view their events" ON public.system_events FOR SELECT TO authenticated USING (team_id IS NULL OR is_team_member(auth.uid(), team_id));

-- Provider health snapshot
CREATE TABLE public.provider_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL UNIQUE, -- 'twilio','openai','elevenlabs','lovable_ai'
  status text NOT NULL DEFAULT 'unknown', -- 'ok','degraded','down','unknown'
  latency_ms integer,
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE public.provider_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view provider health" ON public.provider_health FOR SELECT TO authenticated USING (true);

-- Helper: this month's usage aggregate
CREATE OR REPLACE FUNCTION public.team_usage_this_month(_team_id uuid)
RETURNS TABLE (minutes numeric, tokens bigint, stt_seconds numeric, tts_characters bigint, cost_usd numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COALESCE(SUM(minutes),0)::numeric,
    COALESCE(SUM(llm_prompt_tokens + llm_completion_tokens),0)::bigint,
    COALESCE(SUM(stt_seconds),0)::numeric,
    COALESCE(SUM(tts_characters),0)::bigint,
    COALESCE(SUM(cost_usd),0)::numeric
  FROM public.usage_events
  WHERE team_id = _team_id
    AND created_at >= date_trunc('month', now());
$$;

-- Helper: within limits check (true if under all caps OR no limits row)
CREATE OR REPLACE FUNCTION public.team_within_limits(_team_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  l RECORD;
  u RECORD;
BEGIN
  SELECT * INTO l FROM public.plan_limits WHERE team_id = _team_id;
  IF NOT FOUND THEN RETURN true; END IF;
  SELECT * INTO u FROM public.team_usage_this_month(_team_id);
  RETURN (u.minutes < l.monthly_minutes_cap)
     AND (u.tokens < l.monthly_tokens_cap)
     AND (u.cost_usd < l.monthly_cost_cap_usd);
END;
$$;

-- Record usage event (callable from edge functions via service role; safe RPC)
CREATE OR REPLACE FUNCTION public.record_usage_event(
  _team_id uuid, _call_id uuid, _agent_id uuid, _kind text,
  _minutes numeric, _prompt_tokens integer, _completion_tokens integer,
  _stt_seconds numeric, _tts_characters integer, _cost_usd numeric, _metadata jsonb
) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.usage_events
    (team_id, call_id, agent_id, kind, minutes, llm_prompt_tokens, llm_completion_tokens,
     stt_seconds, tts_characters, cost_usd, metadata)
  VALUES
    (_team_id, _call_id, _agent_id, _kind, COALESCE(_minutes,0),
     COALESCE(_prompt_tokens,0), COALESCE(_completion_tokens,0),
     COALESCE(_stt_seconds,0), COALESCE(_tts_characters,0),
     COALESCE(_cost_usd,0), COALESCE(_metadata,'{}'::jsonb))
  RETURNING id;
$$;
