-- AI providers are offline until a server-side connectivity check succeeds.
-- The Edge Function promotes a provider to CONNECTED only after verification.

alter table public.ai_providers
  alter column status set default 'OFFLINE';
