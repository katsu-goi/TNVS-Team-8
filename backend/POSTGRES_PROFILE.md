# Persistent Database Setup (Local Postgres Profile)

The backend ships with a `local` Spring profile that uses a **persistent PostgreSQL database**
with schema managed by Hibernate (`ddl-auto: update`). Use this when you want room, facility,
reservation, and approval data to survive restarts instead of the in-memory H2 `test` profile.

## Requirements

- PostgreSQL installed and running locally (default `localhost:5432`).
- A database created for the app, e.g. `facilities_db`:
  ```sql
  CREATE DATABASE facilities_db;
  ```

## Run the backend with the local profile

```bash
cd backend
java -jar target/facilities-management-1.0.0.jar --spring.profiles.active=local
```

Connection settings come from environment variables (defaults in parentheses):

| Variable       | Default                                  |
|----------------|------------------------------------------|
| `DB_URL`       | `jdbc:postgresql://localhost:5432/facilities_db` |
| `DB_USERNAME`  | `postgres`                               |
| `DB_PASSWORD`  | `postgres`                               |

Example override:

```bash
$env:DB_URL="jdbc:postgresql://localhost:5432/facilities_db"
$env:DB_USERNAME="myuser"
$env:DB_PASSWORD="secret"
java -jar target/facilities-management-1.0.0.jar --spring.profiles.active=local
```

## What persists

- Facilities and rooms (name, room number, type, floor, building, capacity, operating hours,
  status, hourly rate, amenities).
- Reservations and their approval history (`reservation_approvals`).
- Maintenance schedules (`maintenance_schedules`).

The `local` profile disables Flyway and lets Hibernate create/update tables from the entity
model. If you prefer migration-managed schema, `V5__room_availability_enhancements.sql` in
`src/main/resources/db/migration` contains the room-availability additions; the default profile
(no active profile) uses Flyway against the `DB_URL` database.

## Bootstrap users

On first startup `BootstrapAdmin` creates the seed accounts (idempotent). Passwords are bootstrap
defaults only - rotate them in any non-local environment:

| Email                     | Password  | Role                |
|---------------------------|-----------|---------------------|
| `admin@photonicomega.com` | `<see BootstrapAdmin source>` | ADMIN               |
| `fm@photonicomega.com`    | `<see BootstrapAdmin source>` | FACILITIES_MANAGER  |
| `fo@photonicomega.com`    | `<see BootstrapAdmin source>` | FACILITIES_OFFICER  |

## Profile summary

| Profile  | Database                        | Schema        | Data persists |
|----------|---------------------------------|---------------|---------------|
| `default`| PostgreSQL (Flyway-managed)     | validate      | Yes           |
| `local`  | PostgreSQL (Hibernate-managed)  | update        | Yes           |
| `supabase`| Supabase Postgres               | update        | Yes           |
| `test`   | H2 in-memory                    | create-drop   | No (wiped each restart) |
