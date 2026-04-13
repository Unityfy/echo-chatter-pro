
-- Create agent status enum
CREATE TYPE public.agent_status AS ENUM ('active', 'draft', 'paused', 'archived');

-- Create agents table
CREATE TABLE public.agents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  status agent_status NOT NULL DEFAULT 'draft',
  type TEXT DEFAULT 'custom',
  language TEXT DEFAULT 'English',
  voice TEXT DEFAULT 'Nova',
  model TEXT DEFAULT 'GPT-4.1',
  prompt TEXT DEFAULT '',
  welcome_mode TEXT DEFAULT 'user_first',
  welcome_message TEXT DEFAULT '',
  calls INTEGER DEFAULT 0,
  success_rate NUMERIC(5,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create agent_configs table for section-based JSON configs
CREATE TABLE public.agent_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(agent_id, section)
);

-- Enable RLS
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_configs ENABLE ROW LEVEL SECURITY;

-- Agents RLS policies
CREATE POLICY "Team members can view agents"
  ON public.agents FOR SELECT
  TO authenticated
  USING (is_team_member(auth.uid(), team_id));

CREATE POLICY "Team admins can create agents"
  ON public.agents FOR INSERT
  TO authenticated
  WITH CHECK (is_team_admin(auth.uid(), team_id));

CREATE POLICY "Team admins can update agents"
  ON public.agents FOR UPDATE
  TO authenticated
  USING (is_team_admin(auth.uid(), team_id));

CREATE POLICY "Team admins can delete agents"
  ON public.agents FOR DELETE
  TO authenticated
  USING (is_team_admin(auth.uid(), team_id));

-- Agent configs RLS policies (access through parent agent's team)
CREATE POLICY "Team members can view agent configs"
  ON public.agent_configs FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.agents a
    WHERE a.id = agent_id AND is_team_member(auth.uid(), a.team_id)
  ));

CREATE POLICY "Team admins can manage agent configs"
  ON public.agent_configs FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.agents a
    WHERE a.id = agent_id AND is_team_admin(auth.uid(), a.team_id)
  ));

CREATE POLICY "Team admins can update agent configs"
  ON public.agent_configs FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.agents a
    WHERE a.id = agent_id AND is_team_admin(auth.uid(), a.team_id)
  ));

CREATE POLICY "Team admins can delete agent configs"
  ON public.agent_configs FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.agents a
    WHERE a.id = agent_id AND is_team_admin(auth.uid(), a.team_id)
  ));

-- Triggers for updated_at
CREATE TRIGGER update_agents_updated_at
  BEFORE UPDATE ON public.agents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_agent_configs_updated_at
  BEFORE UPDATE ON public.agent_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX idx_agents_team_id ON public.agents(team_id);
CREATE INDEX idx_agents_status ON public.agents(status);
CREATE INDEX idx_agent_configs_agent_id ON public.agent_configs(agent_id);
