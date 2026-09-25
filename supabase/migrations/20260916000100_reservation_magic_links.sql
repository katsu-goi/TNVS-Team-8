alter table public.reservation_invitees
  add column if not exists magic_link_token_hash text,
  add column if not exists magic_link_expires_at timestamptz;

create unique index if not exists reservation_invitees_magic_link_hash_idx
  on public.reservation_invitees (magic_link_token_hash)
  where magic_link_token_hash is not null;

create index if not exists reservation_invitees_magic_link_expiry_idx
  on public.reservation_invitees (magic_link_expires_at)
  where magic_link_expires_at is not null;
