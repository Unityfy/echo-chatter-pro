-- Add +919513886363 to the workspace and link it to the existing Test Agent
DO $$
DECLARE
  v_team_id uuid := '0742f31b-148f-4894-b8c1-92bab1cb2ace';
  v_agent_id uuid;
BEGIN
  SELECT id INTO v_agent_id FROM public.agents
  WHERE team_id = v_team_id AND name = 'Test Agent' LIMIT 1;

  IF NOT EXISTS (
    SELECT 1 FROM public.phone_numbers
    WHERE team_id = v_team_id AND phone_number = '+919513886363'
  ) THEN
    INSERT INTO public.phone_numbers (team_id, phone_number, provider, status, agent_id)
    VALUES (v_team_id, '+919513886363', 'exotel', 'active', v_agent_id);
  ELSE
    UPDATE public.phone_numbers
    SET agent_id = v_agent_id, status = 'active', updated_at = now()
    WHERE team_id = v_team_id AND phone_number = '+919513886363';
  END IF;
END $$;