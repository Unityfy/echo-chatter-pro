
-- 1) plan_limits: only service role may write
DROP POLICY IF EXISTS "Team admins can insert limits" ON public.plan_limits;
DROP POLICY IF EXISTS "Team admins can update limits" ON public.plan_limits;

-- 2) system_events: hide rows with NULL team_id from regular users
DROP POLICY IF EXISTS "Team members view their events" ON public.system_events;
CREATE POLICY "Team members view their events"
  ON public.system_events FOR SELECT TO authenticated
  USING (team_id IS NOT NULL AND public.is_team_member(auth.uid(), team_id));

-- 3) usage_events: explicitly deny writes from authenticated/anon (service role bypasses RLS)
CREATE POLICY "No client inserts on usage_events"
  ON public.usage_events AS RESTRICTIVE FOR INSERT TO authenticated, anon
  WITH CHECK (false);
CREATE POLICY "No client updates on usage_events"
  ON public.usage_events AS RESTRICTIVE FOR UPDATE TO authenticated, anon
  USING (false);
CREATE POLICY "No client deletes on usage_events"
  ON public.usage_events AS RESTRICTIVE FOR DELETE TO authenticated, anon
  USING (false);

-- 4) Lock down SECURITY DEFINER functions: revoke from anon/public; grant only to needed roles
REVOKE ALL ON FUNCTION public.is_team_admin(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_team_admin(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_team_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_team_member(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_team_with_admin(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_team_with_admin(text, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.search_knowledge_chunks(vector, uuid[], integer, double precision) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_knowledge_chunks(vector, uuid[], integer, double precision) TO service_role;

-- Re-assert previously set grants in case of regressions
REVOKE ALL ON FUNCTION public.team_usage_this_month(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_usage_this_month(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.team_within_limits(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_within_limits(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_usage_event(uuid,uuid,uuid,text,numeric,integer,integer,numeric,integer,numeric,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_usage_event(uuid,uuid,uuid,text,numeric,integer,integer,numeric,integer,numeric,jsonb) TO service_role;
