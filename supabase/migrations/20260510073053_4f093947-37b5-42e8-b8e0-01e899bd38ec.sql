INSERT INTO public.phone_numbers (team_id, agent_id, phone_number, provider, status)
VALUES ('0742f31b-148f-4894-b8c1-92bab1cb2ace', 'a00a8b11-ea1d-4e43-8979-53a0bdcf7e78', '+16623663791', 'twilio', 'active')
ON CONFLICT DO NOTHING;