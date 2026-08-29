import { createClient, SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://dunijfrvfozwlykpkfhy.supabase.co';

const url = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key) : null;

export const supabaseAvailable = supabase !== null;

/** Realtime uses the publishable key; application JWTs use a different issuer/secret. */
export async function setSupabaseRealtimeAuth(_accessToken: string | null): Promise<void> {
  if (!supabase) return;
  await supabase.realtime.setAuth(null);
}
