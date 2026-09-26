-- Names are stored as « Prénom NOM »: first name as typed, family name in capitals.
-- The app sends first_name / last_name at sign-up; the server applies the rule itself
-- so a sign-up made outside the app follows it too. Accounts created without names
-- (dashboard invites) keep an empty name, as before.

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  first_n text := regexp_replace(btrim(coalesce(new.raw_user_meta_data ->> 'first_name', '')), '\s+', ' ', 'g');
  last_n  text := upper(regexp_replace(btrim(coalesce(new.raw_user_meta_data ->> 'last_name', '')), '\s+', ' ', 'g'));
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email,
          case when first_n <> '' or last_n <> '' then btrim(first_n || ' ' || last_n)
               else coalesce(new.raw_user_meta_data ->> 'full_name', '') end);
  return new;
end $$;
