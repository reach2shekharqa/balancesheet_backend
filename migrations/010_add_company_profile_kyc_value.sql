ALTER TABLE public.company_profiles
    ADD COLUMN IF NOT EXISTS kyc_value TEXT;
