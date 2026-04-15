
CREATE OR REPLACE FUNCTION public.create_team_with_admin(_name text, _user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _team_id uuid;
BEGIN
  INSERT INTO public.teams (name, created_by)
  VALUES (_name, _user_id)
  RETURNING id INTO _team_id;

  INSERT INTO public.team_members (team_id, user_id, role)
  VALUES (_team_id, _user_id, 'admin');

  RETURN _team_id;
END;
$$;
