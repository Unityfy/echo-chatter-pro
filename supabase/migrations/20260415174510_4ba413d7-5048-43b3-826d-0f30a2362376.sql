
-- Agent intents table
CREATE TABLE public.agent_intents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  kb_priority TEXT NOT NULL DEFAULT 'intent_first',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(agent_id, name)
);

ALTER TABLE public.agent_intents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view agent intents"
  ON public.agent_intents FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM agents a WHERE a.id = agent_intents.agent_id AND is_team_member(auth.uid(), a.team_id)
  ));

CREATE POLICY "Team admins can create agent intents"
  ON public.agent_intents FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM agents a WHERE a.id = agent_intents.agent_id AND is_team_admin(auth.uid(), a.team_id)
  ));

CREATE POLICY "Team admins can update agent intents"
  ON public.agent_intents FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM agents a WHERE a.id = agent_intents.agent_id AND is_team_admin(auth.uid(), a.team_id)
  ));

CREATE POLICY "Team admins can delete agent intents"
  ON public.agent_intents FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM agents a WHERE a.id = agent_intents.agent_id AND is_team_admin(auth.uid(), a.team_id)
  ));

CREATE TRIGGER update_agent_intents_updated_at
  BEFORE UPDATE ON public.agent_intents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Intent-KB join table
CREATE TABLE public.agent_intent_knowledge_bases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  intent_id UUID NOT NULL REFERENCES public.agent_intents(id) ON DELETE CASCADE,
  knowledge_base_id UUID NOT NULL REFERENCES public.knowledge_bases(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(intent_id, knowledge_base_id)
);

ALTER TABLE public.agent_intent_knowledge_bases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view intent KB links"
  ON public.agent_intent_knowledge_bases FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM agent_intents ai
    JOIN agents a ON a.id = ai.agent_id
    WHERE ai.id = agent_intent_knowledge_bases.intent_id AND is_team_member(auth.uid(), a.team_id)
  ));

CREATE POLICY "Team admins can create intent KB links"
  ON public.agent_intent_knowledge_bases FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM agent_intents ai
    JOIN agents a ON a.id = ai.agent_id
    WHERE ai.id = agent_intent_knowledge_bases.intent_id AND is_team_admin(auth.uid(), a.team_id)
  ));

CREATE POLICY "Team admins can delete intent KB links"
  ON public.agent_intent_knowledge_bases FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM agent_intents ai
    JOIN agents a ON a.id = ai.agent_id
    WHERE ai.id = agent_intent_knowledge_bases.intent_id AND is_team_admin(auth.uid(), a.team_id)
  ));
