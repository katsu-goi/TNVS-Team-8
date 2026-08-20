-- =============================================================
-- Photonic Omega — Realtime RLS policies for the publishable (anon) key
--
-- The browser's Supabase client uses the publishable anon key for
-- `postgres_changes` subscriptions (Realtime) and REST seeding of the
-- live widgets (Live User Activity, Real-time Gateway Logs, sync badge).
--
-- Supabase Realtime delivers CDC events only to roles that have SELECT
-- access to the table. These tables are RLS-enabled and had zero policies,
-- so the anon key could never receive events nor seed data. The tables
-- below are already granted to `anon` and already in the
-- `supabase_realtime` publication — they only lacked SELECT policies.
--
-- Policies are SELECT-only (read-only); anon can never mutate these tables.
-- =============================================================

create policy "anon_select_user_activity_events"
  on public.user_activity_events for select
  to anon using (true);

create policy "anon_select_online_users"
  on public.online_users for select
  to anon using (true);

create policy "anon_select_security_logs"
  on public.security_logs for select
  to anon using (true);

create policy "anon_select_security_alerts"
  on public.security_alerts for select
  to anon using (true);

create policy "anon_select_reservations"
  on public.reservations for select
  to anon using (true);

create policy "anon_select_visitors"
  on public.visitors for select
  to anon using (true);

create policy "anon_select_documents"
  on public.documents for select
  to anon using (true);