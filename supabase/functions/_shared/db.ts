import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@^2.49.1";
import { config } from "./config.ts";

let client: SupabaseClient | null = null;

/**
 * Service-role client (bypasses RLS). MUST only be used server-side inside
 * Edge Functions. Never expose this key to the browser.
 */
export function adminDb(): SupabaseClient {
  if (!client) {
    client = createClient(config.url, config.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: "public" },
    });
  }
  return client;
}