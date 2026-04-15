
-- Create similarity search function
CREATE OR REPLACE FUNCTION public.search_knowledge_chunks(
  _query_embedding vector(768),
  _knowledge_base_ids UUID[],
  _match_count INTEGER DEFAULT 5,
  _match_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    kc.id,
    kc.content,
    kc.metadata,
    (1 - (kc.embedding <=> _query_embedding))::float AS similarity
  FROM public.knowledge_chunks kc
  JOIN public.knowledge_sources ks ON ks.id = kc.source_id
  WHERE ks.knowledge_base_id = ANY(_knowledge_base_ids)
    AND kc.embedding IS NOT NULL
    AND (1 - (kc.embedding <=> _query_embedding))::float > _match_threshold
  ORDER BY kc.embedding <=> _query_embedding
  LIMIT _match_count;
$$;
