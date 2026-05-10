-- Extend agent status enum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'active' AND enumtypid = (SELECT oid FROM pg_type WHERE typname='agent_status')) THEN
    ALTER TYPE public.agent_status ADD VALUE 'active';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'inactive' AND enumtypid = (SELECT oid FROM pg_type WHERE typname='agent_status')) THEN
    ALTER TYPE public.agent_status ADD VALUE 'inactive';
  END IF;
END $$;

-- call_messages
CREATE TABLE IF NOT EXISTS public.call_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system','tool')),
  content TEXT NOT NULL DEFAULT '',
  latency_ms INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.call_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view call messages"
  ON public.call_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.calls c WHERE c.id = call_messages.call_id AND public.is_team_member(auth.uid(), c.team_id)));

CREATE POLICY "Team admins can insert call messages"
  ON public.call_messages FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.calls c WHERE c.id = call_messages.call_id AND public.is_team_admin(auth.uid(), c.team_id)));

CREATE POLICY "Team admins can update call messages"
  ON public.call_messages FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.calls c WHERE c.id = call_messages.call_id AND public.is_team_admin(auth.uid(), c.team_id)));

CREATE POLICY "Team admins can delete call messages"
  ON public.call_messages FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.calls c WHERE c.id = call_messages.call_id AND public.is_team_admin(auth.uid(), c.team_id)));

CREATE INDEX IF NOT EXISTS idx_call_messages_call_id ON public.call_messages(call_id, created_at);

-- integrations
CREATE TABLE IF NOT EXISTS public.integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, type)
);

ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view integrations"
  ON public.integrations FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid(), team_id));

CREATE POLICY "Team admins can create integrations"
  ON public.integrations FOR INSERT TO authenticated
  WITH CHECK (public.is_team_admin(auth.uid(), team_id));

CREATE POLICY "Team admins can update integrations"
  ON public.integrations FOR UPDATE TO authenticated
  USING (public.is_team_admin(auth.uid(), team_id));

CREATE POLICY "Team admins can delete integrations"
  ON public.integrations FOR DELETE TO authenticated
  USING (public.is_team_admin(auth.uid(), team_id));

CREATE TRIGGER trg_integrations_updated_at
  BEFORE UPDATE ON public.integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_calls_team_started ON public.calls(team_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_agent ON public.calls(agent_id);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_team ON public.phone_numbers(team_id);
CREATE INDEX IF NOT EXISTS idx_agents_team ON public.agents(team_id);