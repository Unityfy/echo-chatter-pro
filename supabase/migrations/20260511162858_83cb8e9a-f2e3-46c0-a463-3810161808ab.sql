-- Remove duplicate phone_number row so the inbound webhook can resolve +16623663791 unambiguously.
DELETE FROM public.phone_numbers
WHERE id = 'fef3724a-38c2-4fd7-94fd-4d14e3f139c1';

-- Ensure the remaining row is in canonical E.164 + active state, mapped to the active agent.
UPDATE public.phone_numbers
SET phone_number = '+16623663791',
    provider     = 'twilio',
    status       = 'active',
    agent_id     = 'a04a4b07-5164-49dd-bb5c-84241e323918',
    updated_at   = now()
WHERE id = '91fe1912-2db3-4a91-9dd9-acb220520576';

-- Prevent future duplicates of the same number under the same provider.
CREATE UNIQUE INDEX IF NOT EXISTS phone_numbers_provider_number_unique
  ON public.phone_numbers (provider, phone_number);