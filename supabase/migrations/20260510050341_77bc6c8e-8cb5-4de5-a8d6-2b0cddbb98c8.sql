
-- 1) Restrict profile visibility
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;

CREATE POLICY "Users can view own profile and teammates"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.team_members me
    JOIN public.team_members other ON other.team_id = me.team_id
    WHERE me.user_id = auth.uid()
      AND other.user_id = profiles.user_id
  )
);

-- 2) Fix knowledge-files storage policies to use storage.objects.name (file path),
--    not knowledge_bases.name. Also add an UPDATE policy for team admins.
DROP POLICY IF EXISTS "Team admins can delete knowledge files" ON storage.objects;
DROP POLICY IF EXISTS "Team admins can upload knowledge files" ON storage.objects;
DROP POLICY IF EXISTS "Team members can view knowledge files" ON storage.objects;
DROP POLICY IF EXISTS "Team admins can update knowledge files" ON storage.objects;

CREATE POLICY "Team admins can upload knowledge files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'knowledge-files'
  AND EXISTS (
    SELECT 1 FROM public.knowledge_bases kb
    WHERE public.is_team_admin(auth.uid(), kb.team_id)
      AND (kb.id)::text = (storage.foldername(storage.objects.name))[1]
  )
);

CREATE POLICY "Team admins can update knowledge files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'knowledge-files'
  AND EXISTS (
    SELECT 1 FROM public.knowledge_bases kb
    WHERE public.is_team_admin(auth.uid(), kb.team_id)
      AND (kb.id)::text = (storage.foldername(storage.objects.name))[1]
  )
)
WITH CHECK (
  bucket_id = 'knowledge-files'
  AND EXISTS (
    SELECT 1 FROM public.knowledge_bases kb
    WHERE public.is_team_admin(auth.uid(), kb.team_id)
      AND (kb.id)::text = (storage.foldername(storage.objects.name))[1]
  )
);

CREATE POLICY "Team admins can delete knowledge files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'knowledge-files'
  AND EXISTS (
    SELECT 1 FROM public.knowledge_bases kb
    WHERE public.is_team_admin(auth.uid(), kb.team_id)
      AND (kb.id)::text = (storage.foldername(storage.objects.name))[1]
  )
);

CREATE POLICY "Team members can view knowledge files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'knowledge-files'
  AND EXISTS (
    SELECT 1 FROM public.knowledge_bases kb
    WHERE public.is_team_member(auth.uid(), kb.team_id)
      AND (kb.id)::text = (storage.foldername(storage.objects.name))[1]
  )
);
