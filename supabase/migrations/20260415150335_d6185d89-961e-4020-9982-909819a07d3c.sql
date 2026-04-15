
-- Create storage bucket for knowledge base files
INSERT INTO storage.buckets (id, name, public)
VALUES ('knowledge-files', 'knowledge-files', false);

-- Allow team members to read files (via knowledge_base_id path prefix)
CREATE POLICY "Team members can view knowledge files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'knowledge-files'
  AND EXISTS (
    SELECT 1 FROM public.knowledge_bases kb
    JOIN public.team_members tm ON tm.team_id = kb.team_id
    WHERE tm.user_id = auth.uid()
      AND kb.id::text = (storage.foldername(name))[1]
  )
);

-- Allow team admins to upload files
CREATE POLICY "Team admins can upload knowledge files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'knowledge-files'
  AND EXISTS (
    SELECT 1 FROM public.knowledge_bases kb
    WHERE is_team_admin(auth.uid(), kb.team_id)
      AND kb.id::text = (storage.foldername(name))[1]
  )
);

-- Allow team admins to delete files
CREATE POLICY "Team admins can delete knowledge files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'knowledge-files'
  AND EXISTS (
    SELECT 1 FROM public.knowledge_bases kb
    WHERE is_team_admin(auth.uid(), kb.team_id)
      AND kb.id::text = (storage.foldername(name))[1]
  )
);
