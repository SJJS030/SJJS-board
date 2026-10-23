-- Run the whole file in Supabase SQL Editor. Safe to rerun on the original schema.
begin;

create table if not exists public.memos (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  content text not null check (char_length(content) between 1 and 2000),
  password_hash text not null,
  created_at timestamptz not null default now()
);

alter table public.memos enable row level security;

revoke all on table public.memos from public, anon, authenticated;
revoke all (id, title, content, password_hash, created_at)
on public.memos from public, anon, authenticated;
-- Never expose password_hash. All writes pass through the Next.js server.
grant select (id, title, content, created_at) on public.memos to anon, authenticated;
grant select, insert, delete on table public.memos to service_role;

drop policy if exists "Anyone can read memos" on public.memos;
create policy "Anyone can read memos"
on public.memos
for select
to anon, authenticated
using (true);

drop policy if exists "Anyone can create memos" on public.memos;

create index if not exists memos_created_at_idx
on public.memos (created_at desc);

create table if not exists public.request_rate_limits (
  key text primary key,
  attempts integer not null,
  expires_at timestamptz not null
);
alter table public.request_rate_limits enable row level security;
revoke all on public.request_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.request_rate_limits to service_role;
create index if not exists request_rate_limits_expiry_idx
on public.request_rate_limits (expires_at);

create or replace function public.consume_rate_limit(
  p_key text, p_limit integer, p_window_seconds integer
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_time_value timestamptz := statement_timestamp();
  request_count integer;
begin
  if p_limit < 1 or p_limit > 1000 or p_window_seconds < 1 or p_window_seconds > 86400
     or p_key is null or length(p_key) <> 64 then
    raise exception 'Invalid rate limit parameters';
  end if;

  delete from public.request_rate_limits
  where expires_at < current_time_value - interval '1 day';

  insert into public.request_rate_limits as counters (key, attempts, expires_at)
  values (p_key, 1, current_time_value + make_interval(secs => p_window_seconds))
  on conflict (key) do update set
    attempts = case when counters.expires_at <= current_time_value then 1
                    else least(counters.attempts + 1, p_limit + 1) end,
    expires_at = case when counters.expires_at <= current_time_value
                      then current_time_value + make_interval(secs => p_window_seconds)
                      else counters.expires_at end
  returning attempts into request_count;

  return request_count <= p_limit;
end;
$$;
revoke all on function public.consume_rate_limit(text, integer, integer)
from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;

commit;
