ALTER TABLE public.phone_numbers DROP COLUMN IF EXISTS exotel_account_id;
ALTER TABLE public.phone_numbers ALTER COLUMN provider SET DEFAULT 'twilio';
DELETE FROM public.phone_numbers WHERE provider = 'exotel';
DROP TABLE IF EXISTS public.exotel_accounts CASCADE;