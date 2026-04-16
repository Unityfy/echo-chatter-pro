-- Enable pgcrypto for encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Table to store user-provided Exotel account credentials (encrypted)
CREATE TABLE public.exotel_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  account_sid text NOT NULL,
  subdomain text NOT NULL DEFAULT 'api.exotel.com',
  -- Encrypted blobs (bytea) produced by pgp_sym_encrypt with server-side key
  api_key_encrypted bytea NOT NULL,
  api_token_encrypted bytea NOT NULL,
  status text NOT NULL DEFAULT 'connected',
  last_validated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, account_sid)
);

ALTER TABLE public.exotel_accounts ENABLE ROW LEVEL SECURITY;

-- Members can see that an account is connected (metadata only — encrypted columns
-- are bytea blobs and useless without the server-side key).
CREATE POLICY "Team members can view exotel accounts"
ON public.exotel_accounts FOR SELECT TO authenticated
USING (is_team_member(auth.uid(), team_id));

CREATE POLICY "Team admins can insert exotel accounts"
ON public.exotel_accounts FOR INSERT TO authenticated
WITH CHECK (is_team_admin(auth.uid(), team_id) AND auth.uid() = created_by);

CREATE POLICY "Team admins can update exotel accounts"
ON public.exotel_accounts FOR UPDATE TO authenticated
USING (is_team_admin(auth.uid(), team_id));

CREATE POLICY "Team admins can delete exotel accounts"
ON public.exotel_accounts FOR DELETE TO authenticated
USING (is_team_admin(auth.uid(), team_id));

CREATE TRIGGER update_exotel_accounts_updated_at
BEFORE UPDATE ON public.exotel_accounts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add link from phone_numbers to exotel_accounts (nullable for backward compat)
ALTER TABLE public.phone_numbers
  ADD COLUMN IF NOT EXISTS exotel_account_id uuid REFERENCES public.exotel_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_phone_numbers_exotel_account_id
  ON public.phone_numbers(exotel_account_id);