begin;
create table public.workspace_state (
  workspace_id text primary key,
  revision integer not null,
  payload text not null,
  updated_at timestamptz not null default now()
);
create table public.message_members (
  user_id text primary key,
  email text unique not null,
  display_name text not null
);
create table public.direct_messages (
  id text primary key,
  sender_id text not null,
  recipient_id text not null,
  body text not null,
  attachment_name text,
  attachment_data text,
  created_at bigint not null
);
create index direct_messages_sender on public.direct_messages (sender_id, created_at);
create index direct_messages_recipient on public.direct_messages (recipient_id, created_at);
alter table public.workspace_state enable row level security;
alter table public.message_members enable row level security;
alter table public.direct_messages enable row level security;
revoke all on table public.workspace_state, public.message_members, public.direct_messages from anon, authenticated;
commit;
