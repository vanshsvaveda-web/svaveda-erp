create table if not exists public.workspace_presence (
  workspace_id text not null references public.workspace_state(workspace_id) on delete cascade,
  user_id text not null,
  work_day date not null,
  name text not null,
  section text not null,
  last_seen bigint not null,
  last_ip inet,
  minutes_by_section jsonb not null default '{}'::jsonb,
  primary key (workspace_id, user_id, work_day)
);
alter table public.workspace_presence enable row level security;
revoke all on public.workspace_presence from anon, authenticated;
