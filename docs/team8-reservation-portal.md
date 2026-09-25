# Team 8 Reservation Portal

## Architecture

The portal is available at `/reservation-portal`. It reuses the existing TNVS custom access-token session, but applies a second Team 8 access gate in the browser and in the `reservation-portal` Edge Function. The default allowed domains are `photonicomega.com` and `team8.tnvs`; configure `VITE_TEAM8_ALLOWED_DOMAINS` and `TEAM8_ALLOWED_DOMAINS` as comma-separated values when the deployment domain changes.

The browser calls these Edge Function routes:

- `GET /reservation-portal/facilities`
- `GET /reservation-portal/reservations?date=YYYY-MM-DD`
- `POST /reservation-portal/reservations`

The Edge Function uses the service-role client server-side, validates the caller's Team 8 domain, checks the requested time range, and relies on the database overlap trigger for race-safe booking protection.

## Database objects

Migration `20260907000101_team8_reservation_portal.sql` adds the portal metadata columns to the existing `facilities` table and creates:

- `facility_reservations` for confirmed or pending bookings
- `reservation_invitees` for invitee identity and SHA-256 QR token hashes
- `reservation_email_outbox` for invitation-delivery audit records

Migration `20260916000100_reservation_magic_links.sql` adds a separate SHA-256 magic-link token hash and expiry timestamp. Raw QR and magic-link tokens are never stored in the database. The QR payload is returned only to the reservation response so the current host UI can render a pass, while the magic-link URL is sent to the invitee by the Edge Function.

## Cloud deployment

1. Apply the migration with `supabase db push` against the intended cloud project.
2. Deploy the function with `supabase functions deploy reservation-portal --no-verify-jwt`.
3. Set the Edge Function secrets. `PORTAL_PUBLIC_URL` must be the frontend origin, without `/reservation-portal`; the code also tolerates the old suffix.
   ```bash
   supabase secrets set TEAM8_ALLOWED_DOMAINS=photonicomega.com,team8.tnvs
   supabase secrets set PORTAL_PUBLIC_URL=https://your-frontend.example.com
   supabase secrets set RESEND_API_KEY=re_...
   supabase secrets set RESEND_FROM_EMAIL="Team 8 Facilities <noreply@your-verified-domain.example>"
   supabase secrets set MAGIC_LINK_TTL_HOURS=72
   ```
   `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are optional for local review. Without them, the outbox records `SIMULATED`; with them, the Edge Function sends through Resend and records `SENT` or `FAILED`.
4. Set `VITE_TEAM8_ALLOWED_DOMAINS` in the frontend deployment environment and rebuild the frontend.
5. Open `/reservation-portal/login`, sign in with an approved internal account, create a reservation with an invitee, and open the returned `Open guest pass` link. The link resolves at `/guest-pass/:token` and expires according to `MAGIC_LINK_TTL_HOURS`.

The local preview can render the complete login and portal shell without the cloud function, but booking data will remain unavailable until the migration and function are deployed.
