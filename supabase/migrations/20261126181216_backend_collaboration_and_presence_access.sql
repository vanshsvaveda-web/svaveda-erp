-- Backend-only tables: application authorization is enforced by verified session and seat.
create table if not exists public.workspace_notes (
 workspace_id text not null references public.workspace_state(workspace_id) on delete cascade,
 user_id text not null, id text not null, body text not null,
 created_at bigint not null, updated_at bigint not null,
 primary key(workspace_id,user_id,id)
);
alter table public.workspace_notes enable row level security;
revoke all on public.workspace_notes from public,anon,authenticated;
grant select,insert,update on public.workspace_notes to svaveda_app;
create policy notes_backend on public.workspace_notes for all to svaveda_app using(true) with check(true);
grant select,insert,update,delete on public.workspace_presence to svaveda_app;
create policy presence_backend on public.workspace_presence for all to svaveda_app using(true) with check(true);
-- Seed confirmed, active accounts that already have a configured seat, plus the owner.
insert into public.message_members(user_id,email,display_name)
select distinct u.id::text,lower(u.email),coalesce(s.seat->>'name','Vansh')
from public.workspace_state w join auth.users u on u.id::text=w.workspace_id or exists(
 select 1 from jsonb_array_elements(w.payload::jsonb->'seats') x where lower(x->>'email')=lower(u.email))
left join lateral(select seat from jsonb_array_elements(w.payload::jsonb->'seats') seat where lower(seat->>'email')=lower(u.email) limit 1) s on true
where u.deleted_at is null and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now())
on conflict(user_id) do update set email=excluded.email,display_name=excluded.display_name;
