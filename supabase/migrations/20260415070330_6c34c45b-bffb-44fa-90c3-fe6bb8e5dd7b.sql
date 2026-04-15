
-- Add crawl-related columns to knowledge_sources
ALTER TABLE public.knowledge_sources
  ADD COLUMN parent_source_id UUID REFERENCES public.knowledge_sources(id) ON DELETE CASCADE,
  ADD COLUMN crawl_config JSONB DEFAULT '{}',
  ADD COLUMN last_refreshed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN crawl_status TEXT DEFAULT 'idle' CHECK (crawl_status IN ('idle', 'crawling', 'done', 'error')),
  ADD COLUMN discovered_urls_count INTEGER DEFAULT 0;

-- Index for finding child sources
CREATE INDEX idx_knowledge_sources_parent ON public.knowledge_sources(parent_source_id) WHERE parent_source_id IS NOT NULL;

-- Index for finding sources needing refresh
CREATE INDEX idx_knowledge_sources_refresh ON public.knowledge_sources(last_refreshed_at)
  WHERE type = 'url' AND crawl_config->>'auto_refresh' = 'true';
