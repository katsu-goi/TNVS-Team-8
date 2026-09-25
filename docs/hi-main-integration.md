# hi build and main integration

The integration preserves the local changes from `main-ui-rbac3-integration`
at `e14392a` and merges main at `fef1ac9`. The original working directory and
its staged/unstaged files are not modified.

The reservation portal, guest links, QR check-in/out, occupancy display,
facility management, and floor-plan pins are retained. Main's navigation,
authorization, and transactional visitor/reservation workflows are retained.
Facility management now uses the application-authenticated Edge API rather
than direct browser database writes. Visitor verify-and-allow uses the
clearance and check-in RPCs.

## Deployment prerequisites

This branch is source integration only; no live database migration or
production deployment was performed.

- The local portal migration's version collided with main's lifecycle
  migration. Its filename is now `20260907000101_team8_reservation_portal.sql`.
  If an existing database already applied the old `20260907000100` portal
  migration, inspect and reconcile its migration history before deployment;
  do not assume main's different migration with that number was applied.
- Apply the included local portal, officer workflow, pin, magic-link, and
  `20260925000200_facility_management_integration.sql` migrations in an
  isolated staging database first. The last migration adds the missing
  floor-plan column/bucket and disables direct browser pin writes.
- Deploy the changed `facilities`, `visitor`, `reservation-portal`, and
  `document-title-suggest` Edge Functions along with main's shared changes.
- Configure the usual frontend API environment and portal email settings.
  Camera scanning, email delivery, and database workflows require staging
  verification with configured services and test accounts.

## Local validation

- TypeScript and Vite production build pass using `--configLoader runner`.
- 52 existing frontend tests and 4 added API integration tests pass.
- Deno checks pass for all four changed Edge Function entry points.
- Three staging account-catalog tests pass.
- Windows Node 26 requires `NODE_OPTIONS=--no-experimental-webstorage` for
  this jsdom test runner. CI uses Node 20.
- Local Java verification encountered a sandbox `AccessDeniedException`
  while closing dependency JARs. GitHub's Java 21 CI is the independent
  backend validation path.
