-- Hash password-reset bearer tokens at rest. Existing still-valid raw tokens
-- continue to work because the API hashes the presented value before lookup.
update public.users
set password_reset_token = encode(
  extensions.digest(convert_to(password_reset_token, 'UTF8'), 'sha256'),
  'hex'
)
where password_reset_token is not null
  and (length(password_reset_token) <> 64 or password_reset_token !~ '^[0-9a-f]{64}$');

comment on column public.users.password_reset_token is
  'SHA-256 digest of the short-lived password reset bearer token; the raw token is never stored.';
