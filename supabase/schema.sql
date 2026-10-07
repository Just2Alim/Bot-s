-- Run this in the Supabase SQL Editor for the project.
-- Supabase Auth owns user identities; no public users/password table is needed.
create extension if not exists pgcrypto;

create table if not exists public.bots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  telegram_id text not null,
  username text not null,
  bot_name text not null,
  status text not null default 'Подключён',
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, telegram_id)
);

create index if not exists bots_owner_id_idx on public.bots(owner_id);
alter table public.bots enable row level security;
revoke all on public.bots from anon, authenticated;
grant select on public.bots to authenticated;
grant update (config, status, updated_at) on public.bots to authenticated;
drop policy if exists "Users can read their bots" on public.bots;
create policy "Users can read their bots" on public.bots for select to authenticated using (auth.uid() = owner_id);
drop policy if exists "Users can create their bots" on public.bots;
create policy "Users can create their bots" on public.bots for insert to authenticated with check (auth.uid() = owner_id);
drop policy if exists "Users can update their bots" on public.bots;
create policy "Users can update their bots" on public.bots for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists "Users can delete their bots" on public.bots;
create policy "Users can delete their bots" on public.bots for delete to authenticated using (auth.uid() = owner_id);

create table if not exists public.bot_secrets (
  bot_id uuid primary key references public.bots(id) on delete cascade,
  encrypted_token jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.bot_secrets enable row level security;
revoke all on public.bot_secrets from anon, authenticated;

drop function if exists public.create_or_update_bot(text, text, text, jsonb);
create or replace function public.create_or_update_bot(p_owner_id uuid, p_telegram_id text, p_username text, p_bot_name text, p_encrypted_token jsonb)
returns public.bots
language plpgsql
security definer
set search_path = public
as $$
declare saved_bot public.bots;
begin
  if p_owner_id is null then raise exception 'owner is required'; end if;
  insert into public.bots(owner_id, telegram_id, username, bot_name, status)
    values (p_owner_id, p_telegram_id, p_username, p_bot_name, 'Подключён')
    on conflict (owner_id, telegram_id) do update set username = excluded.username, bot_name = excluded.bot_name, updated_at = now()
    returning * into saved_bot;
  insert into public.bot_secrets(bot_id, encrypted_token) values (saved_bot.id, p_encrypted_token)
    on conflict (bot_id) do update set encrypted_token = excluded.encrypted_token, updated_at = now();
  return saved_bot;
end;
$$;
revoke all on function public.create_or_update_bot(uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_or_update_bot(uuid, text, text, text, jsonb) to service_role;

drop function if exists public.get_my_bot_for_runner(uuid);

create or replace function public.get_bot_for_runner(p_bot_id uuid)
returns table(id uuid, owner_id uuid, telegram_id text, username text, bot_name text, status text, config jsonb, encrypted_token jsonb)
language sql
security definer
set search_path = public
as $$
  select b.id, b.owner_id, b.telegram_id, b.username, b.bot_name, b.status, b.config, s.encrypted_token
    from public.bots b join public.bot_secrets s on s.bot_id = b.id where b.id = p_bot_id;
$$;
revoke all on function public.get_bot_for_runner(uuid) from public, anon, authenticated;
grant execute on function public.get_bot_for_runner(uuid) to service_role;

create or replace function public.get_running_bots_for_runner()
returns table(id uuid, owner_id uuid, telegram_id text, username text, bot_name text, status text, config jsonb, encrypted_token jsonb)
language sql
security definer
set search_path = public
as $$
  select b.id, b.owner_id, b.telegram_id, b.username, b.bot_name, b.status, b.config, s.encrypted_token
    from public.bots b join public.bot_secrets s on s.bot_id = b.id
   where b.status = 'Работает на сервере платформы';
$$;
revoke all on function public.get_running_bots_for_runner() from public, anon, authenticated;
grant execute on function public.get_running_bots_for_runner() to service_role;

create or replace function public.update_bot_runner_state(p_bot_id uuid, p_status text, p_config jsonb default null)
returns void
language sql
security definer
set search_path = public
as $$
  update public.bots set status = p_status, config = coalesce(p_config, config), updated_at = now() where id = p_bot_id;
$$;
revoke all on function public.update_bot_runner_state(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.update_bot_runner_state(uuid, text, jsonb) to service_role;

create table if not exists public.ai_usage (
  owner_id uuid not null references auth.users(id) on delete cascade,
  month date not null,
  requests integer not null default 0 check (requests >= 0),
  primary key (owner_id, month)
);
alter table public.ai_usage enable row level security;
drop policy if exists "Users can read own AI usage" on public.ai_usage;
create policy "Users can read own AI usage" on public.ai_usage for select to authenticated using (auth.uid() = owner_id);

revoke all on public.ai_usage from anon, authenticated;

create or replace function public.consume_ai_request(p_limit integer default 20)
returns table(allowed boolean, requests integer, month date)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_month date := date_trunc('month', now())::date;
  current_count integer;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  insert into public.ai_usage(owner_id, month, requests) values (auth.uid(), current_month, 0)
    on conflict (owner_id, month) do nothing;
  select ai_usage.requests into current_count from public.ai_usage
    where owner_id = auth.uid() and ai_usage.month = current_month for update;
  if current_count >= p_limit then
    return query select false, current_count, current_month;
  else
    update public.ai_usage set requests = current_count + 1
      where owner_id = auth.uid() and ai_usage.month = current_month;
    return query select true, current_count + 1, current_month;
  end if;
end;
$$;
revoke all on function public.consume_ai_request(integer) from public, anon;
grant execute on function public.consume_ai_request(integer) to authenticated;
