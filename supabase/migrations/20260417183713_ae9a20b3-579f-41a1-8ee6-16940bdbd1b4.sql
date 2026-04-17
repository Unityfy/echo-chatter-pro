-- Seed a stub Test Agent and assign it to the existing Exotel trial number
DO $$
DECLARE
  v_team_id uuid := '0742f31b-148f-4894-b8c1-92bab1cb2ace';
  v_user_id uuid := '2aede2f9-fa8a-4be6-9e8f-b2aa72764a30';
  v_agent_id uuid;
BEGIN
  -- Reuse existing Test Agent if it already exists
  SELECT id INTO v_agent_id FROM public.agents
  WHERE team_id = v_team_id AND name = 'Test Agent' LIMIT 1;

  IF v_agent_id IS NULL THEN
    INSERT INTO public.agents (
      team_id, created_by, name, description, status, type, language, voice,
      prompt, welcome_mode, welcome_message
    ) VALUES (
      v_team_id, v_user_id, 'Test Agent',
      'Stub agent for end-to-end webhook testing',
      'active', 'custom', 'English', 'Nova',
      'You are a friendly test AI agent. Keep responses short.',
      'agent_first',
      'Hello, this is a test AI agent. How can I help you?'
    ) RETURNING id INTO v_agent_id;
  END IF;

  -- Assign agent to the existing phone number and activate it
  UPDATE public.phone_numbers
  SET agent_id = v_agent_id, status = 'active', updated_at = now()
  WHERE id = '909e0b22-984e-466b-bad8-14ade836667f';
END $$;