-- Block writes from anon/authenticated on plan_limits (service_role bypasses RLS)
CREATE POLICY "plan_limits_no_insert" ON public.plan_limits
  FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "plan_limits_no_update" ON public.plan_limits
  FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "plan_limits_no_delete" ON public.plan_limits
  FOR DELETE TO anon, authenticated USING (false);

-- Block writes from anon/authenticated on system_events (service_role bypasses RLS)
CREATE POLICY "system_events_no_insert" ON public.system_events
  FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "system_events_no_update" ON public.system_events
  FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "system_events_no_delete" ON public.system_events
  FOR DELETE TO anon, authenticated USING (false);