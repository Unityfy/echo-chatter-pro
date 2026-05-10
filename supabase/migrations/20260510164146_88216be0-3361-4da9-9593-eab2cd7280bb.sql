
REVOKE ALL ON FUNCTION public.record_usage_event(uuid,uuid,uuid,text,numeric,integer,integer,numeric,integer,numeric,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.team_usage_this_month(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.team_within_limits(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_usage_this_month(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_within_limits(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_usage_event(uuid,uuid,uuid,text,numeric,integer,integer,numeric,integer,numeric,jsonb) TO service_role;
