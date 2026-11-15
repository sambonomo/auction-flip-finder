-- Shared Garage (kind 'flip'), AI results (kind 'ai') and tuned model numbers (kind 'tuned').
create table if not exists public.aff_kv (
  kind text not null,
  key text not null,
  by_user text not null default '',
  data jsonb not null default '{}'::jsonb,
  gone boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (kind, key)
);
create index if not exists aff_kv_kind_time on public.aff_kv (kind, updated_at);
alter table public.aff_kv enable row level security;
revoke all on public.aff_kv from anon, authenticated;

create or replace function public.aff_kv_list(p_secret text, p_kind text, p_since double precision default 0) returns setof public.aff_kv
language plpgsql security definer set search_path = '' as $$
begin
  perform public.aff_check(p_secret);
  return query select * from public.aff_kv k where k.kind = p_kind and k.updated_at > to_timestamp(coalesce(p_since, 0) / 1000) order by k.updated_at limit 5000;
end $$;

create or replace function public.aff_kv_put(p_secret text, p_user text, p_kind text, p_rows jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  perform public.aff_check(p_secret);
  insert into public.aff_kv (kind, key, by_user, data, gone, updated_at)
  select p_kind, r->>'key', coalesce(p_user, ''), coalesce(r->'data', '{}'::jsonb), coalesce((r->>'gone')::boolean, false),
         to_timestamp(coalesce((r->>'u')::double precision, extract(epoch from now()) * 1000) / 1000)
  from jsonb_array_elements(p_rows) r
  where coalesce(r->>'key', '') <> ''
  on conflict (kind, key) do update set by_user = excluded.by_user, data = excluded.data, gone = excluded.gone, updated_at = excluded.updated_at
    where excluded.updated_at >= public.aff_kv.updated_at;
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function public.aff_kv_list(text, text, double precision), public.aff_kv_put(text, text, text, jsonb) to anon;
