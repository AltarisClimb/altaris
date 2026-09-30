-- Network: declared region, spoken languages, and an opt-in directory.
--
-- The region is declared by the user (no geolocation) and the directory is
-- reciprocal: you only see the people who opted in if you opted in yourself.
-- It exposes a first name + initial, the role, the region and the languages —
-- never the e-mail, the plan or any training or health data.

alter table public.profiles
  add column if not exists region          text,
  add column if not exists languages       text[] not null default '{}',
  add column if not exists directory_optin boolean not null default false;

alter table public.profiles drop constraint if exists profiles_region_len;
alter table public.profiles add constraint profiles_region_len check (region is null or char_length(region) <= 60);
alter table public.profiles drop constraint if exists profiles_languages_len;
alter table public.profiles add constraint profiles_languages_len check (coalesce(array_length(languages, 1), 0) <= 12);

create or replace function public.directory()
returns table (id uuid, name text, role text, region text, languages text[])
language sql stable security definer set search_path = public as $$
  select p.id,
         case when position(' ' in btrim(coalesce(p.full_name, ''))) > 0
              then split_part(btrim(p.full_name), ' ', 1) || ' ' || left(split_part(btrim(p.full_name), ' ', 2), 1) || '.'
              else coalesce(nullif(btrim(p.full_name), ''), '—') end,
         p.role, p.region, p.languages
  from public.profiles p
  where p.directory_optin and p.status = 'active' and p.region is not null
    and p.id <> (select auth.uid())
    and exists (select 1 from public.profiles me
                where me.id = (select auth.uid()) and me.directory_optin and me.status = 'active');
$$;

revoke all on function public.directory() from public, anon;
grant execute on function public.directory() to authenticated;
