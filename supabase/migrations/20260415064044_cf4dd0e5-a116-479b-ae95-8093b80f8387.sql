
-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector SCHEMA public;

-- Knowledge bases table
CREATE TABLE public.knowledge_bases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.knowledge_bases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members can view knowledge bases" ON public.knowledge_bases FOR SELECT TO authenticated USING (is_team_member(auth.uid(), team_id));
CREATE POLICY "Team admins can create knowledge bases" ON public.knowledge_bases FOR INSERT TO authenticated WITH CHECK (is_team_admin(auth.uid(), team_id));
CREATE POLICY "Team admins can update knowledge bases" ON public.knowledge_bases FOR UPDATE TO authenticated USING (is_team_admin(auth.uid(), team_id));
CREATE POLICY "Team admins can delete knowledge bases" ON public.knowledge_bases FOR DELETE TO authenticated USING (is_team_admin(auth.uid(), team_id));
CREATE TRIGGER update_knowledge_bases_updated_at BEFORE UPDATE ON public.knowledge_bases FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Knowledge sources table
CREATE TABLE public.knowledge_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  knowledge_base_id UUID NOT NULL REFERENCES public.knowledge_bases(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('url', 'file', 'text')),
  source_url TEXT,
  file_name TEXT,
  file_path TEXT,
  content_text TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'error')),
  error_message TEXT,
  chunk_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.knowledge_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members can view knowledge sources" ON public.knowledge_sources FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.knowledge_bases kb WHERE kb.id = knowledge_sources.knowledge_base_id AND is_team_member(auth.uid(), kb.team_id)));
CREATE POLICY "Team admins can create knowledge sources" ON public.knowledge_sources FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.knowledge_bases kb WHERE kb.id = knowledge_sources.knowledge_base_id AND is_team_admin(auth.uid(), kb.team_id)));
CREATE POLICY "Team admins can update knowledge sources" ON public.knowledge_sources FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.knowledge_bases kb WHERE kb.id = knowledge_sources.knowledge_base_id AND is_team_admin(auth.uid(), kb.team_id)));
CREATE POLICY "Team admins can delete knowledge sources" ON public.knowledge_sources FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.knowledge_bases kb WHERE kb.id = knowledge_sources.knowledge_base_id AND is_team_admin(auth.uid(), kb.team_id)));
CREATE TRIGGER update_knowledge_sources_updated_at BEFORE UPDATE ON public.knowledge_sources FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Knowledge chunks with vector embeddings
CREATE TABLE public.knowledge_chunks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_id UUID NOT NULL REFERENCES public.knowledge_sources(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(768),
  chunk_index INTEGER NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members can view knowledge chunks" ON public.knowledge_chunks FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.knowledge_sources ks JOIN public.knowledge_bases kb ON kb.id = ks.knowledge_base_id WHERE ks.id = knowledge_chunks.source_id AND is_team_member(auth.uid(), kb.team_id)));
CREATE POLICY "Team admins can manage knowledge chunks" ON public.knowledge_chunks FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.knowledge_sources ks JOIN public.knowledge_bases kb ON kb.id = ks.knowledge_base_id WHERE ks.id = knowledge_chunks.source_id AND is_team_admin(auth.uid(), kb.team_id)));
CREATE POLICY "Team admins can delete knowledge chunks" ON public.knowledge_chunks FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.knowledge_sources ks JOIN public.knowledge_bases kb ON kb.id = ks.knowledge_base_id WHERE ks.id = knowledge_chunks.source_id AND is_team_admin(auth.uid(), kb.team_id)));

-- Agent-Knowledge Base linking
CREATE TABLE public.agent_knowledge_bases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  knowledge_base_id UUID NOT NULL REFERENCES public.knowledge_bases(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(agent_id, knowledge_base_id)
);
ALTER TABLE public.agent_knowledge_bases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members can view agent knowledge links" ON public.agent_knowledge_bases FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.agents a WHERE a.id = agent_knowledge_bases.agent_id AND is_team_member(auth.uid(), a.team_id)));
CREATE POLICY "Team admins can manage agent knowledge links" ON public.agent_knowledge_bases FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.agents a WHERE a.id = agent_knowledge_bases.agent_id AND is_team_admin(auth.uid(), a.team_id)));
CREATE POLICY "Team admins can delete agent knowledge links" ON public.agent_knowledge_bases FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.agents a WHERE a.id = agent_knowledge_bases.agent_id AND is_team_admin(auth.uid(), a.team_id)));
