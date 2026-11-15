-- Shared sold-price log for Auction Flip Finder.
-- Tables are closed to the public API (row-level security on, no policies).
-- The website's server reaches them only through the functions below, which check a shared secret.
create table if not exists public.aff_sold (
  key text primary key,
  by_user text not null default '',
  sold numeric not null,
  bought boolean not null default false,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.aff_config (name text primary key, value text not null);
alter table public.aff_sold enable row level security;
alter table public.aff_config enable row level security;
revoke all on public.aff_sold, public.aff_config from anon, authenticated;

create or replace function public.aff_check(p_secret text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_secret is null or not exists (
    select 1 from public.aff_config c where c.name = 'secret_sha256'
      and c.value = encode(sha256(convert_to(p_secret, 'utf8')), 'hex')
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
end $$;

create or replace function public.aff_list(p_secret text) returns setof public.aff_sold
language plpgsql security definer set search_path = '' as $$
begin
  perform public.aff_check(p_secret);
  return query select * from public.aff_sold order by updated_at;
end $$;

create or replace function public.aff_upsert(p_secret text, p_user text, p_rows jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  perform public.aff_check(p_secret);
  insert into public.aff_sold (key, by_user, sold, bought, data, updated_at)
  select r->>'key', coalesce(p_user, ''), (r->>'sold')::numeric, coalesce((r->>'bought')::boolean, false),
         coalesce(r->'data', '{}'::jsonb), to_timestamp(coalesce((r->>'u')::double precision, extract(epoch from now()) * 1000) / 1000)
  from jsonb_array_elements(p_rows) r
  where coalesce(r->>'key', '') <> '' and (r->>'sold')::numeric > 0
  on conflict (key) do update set by_user = excluded.by_user, sold = excluded.sold, bought = excluded.bought,
      data = excluded.data, updated_at = excluded.updated_at
    where excluded.updated_at >= public.aff_sold.updated_at;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.aff_delete(p_secret text, p_key text) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  perform public.aff_check(p_secret);
  delete from public.aff_sold where key = p_key;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.aff_check(text) from public, anon, authenticated;
grant execute on function public.aff_list(text), public.aff_upsert(text, text, jsonb), public.aff_delete(text, text) to anon;
