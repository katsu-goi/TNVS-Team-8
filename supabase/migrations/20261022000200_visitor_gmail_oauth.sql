-- Service-only Gmail OAuth connection for visitor transactional email.
-- Client credentials remain Edge Function secrets. Refresh tokens and PKCE
-- verifiers are encrypted by the Edge Function before they reach Postgres.

create table if not exists public.visitor_gmail_oauth_configuration (
  id smallint primary key default 1 check (id = 1),
  provider varchar(20) not null default 'GMAIL' check (provider = 'GMAIL'),
  sender_email text not null default 'hirnamobilitysolutionsinc@gmail.com'
    check (sender_email = 'hirnamobilitysolutionsinc@gmail.com'),
  encrypted_refresh_token text,
  granted_scopes text[] not null default '{}',
  connection_status varchar(20) not null default 'NOT_CONNECTED'
    check (connection_status in ('NOT_CONNECTED', 'CONNECTED', 'ERROR')),
  connected_by uuid references public.users(id),
  connected_at timestamptz,
  disconnected_by uuid references public.users(id),
  disconnected_at timestamptz,
  last_error_code varchar(100),
  last_error_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint visitor_gmail_connected_evidence_check check (
    connection_status <> 'CONNECTED'
    or (encrypted_refresh_token is not null and connected_by is not null and connected_at is not null)
  )
);

insert into public.visitor_gmail_oauth_configuration (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.visitor_gmail_oauth_states (
  state_hash varchar(64) primary key,
  encrypted_code_verifier text not null,
  initiated_by uuid not null references public.users(id) on delete cascade,
  initiated_ip inet,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint visitor_gmail_state_hash_check check (state_hash ~ '^[0-9a-f]{64}$'),
  constraint visitor_gmail_state_expiry_check check (expires_at > created_at)
);

create index if not exists visitor_gmail_oauth_states_expiry_idx
  on public.visitor_gmail_oauth_states(expires_at)
  where consumed_at is null;

alter table public.visitor_email_notifications
  add column if not exists delivery_provider varchar(20)
  check (delivery_provider is null or delivery_provider in ('GMAIL', 'RESEND'));

alter table public.visitor_gmail_oauth_configuration enable row level security;
alter table public.visitor_gmail_oauth_states enable row level security;

revoke all on public.visitor_gmail_oauth_configuration from public, anon, authenticated;
revoke all on public.visitor_gmail_oauth_states from public, anon, authenticated;
grant select, insert, update on public.visitor_gmail_oauth_configuration to service_role;
grant select, insert, update, delete on public.visitor_gmail_oauth_states to service_role;

comment on table public.visitor_gmail_oauth_configuration is
  'Service-only Gmail OAuth connection. The stored refresh token is an AES-GCM envelope; access tokens are never persisted.';
comment on table public.visitor_gmail_oauth_states is
  'Short-lived one-time OAuth CSRF states with encrypted PKCE verifiers. Raw state values are never persisted.';
comment on column public.visitor_email_notifications.delivery_provider is
  'Server-side provider selected for this tracked notification attempt.';
