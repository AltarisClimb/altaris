-- Video analysis, coach voice notes and the climbing logbook.
--   videos  : one document per clip a climber sends for analysis (athlete_docs),
--             with the coach's time-stamped comments. Sending one is Premium.
--   ascents : the climber's logbook (routes and boulders sent or projected).
--   media   : private Storage bucket holding the clips and voice notes, one
--             folder per climber: "<athlete uuid>/<file>". Same audience as the
--             climber's documents (the climber, their coach, admins).
-- Neither is health data: no consent gate.

alter table public.athlete_docs drop constraint athlete_docs_col_check;
alter table public.athlete_docs add constraint athlete_docs_col_check
  check (col in ('sessions', 'assessments', 'pain', 'prefs', 'routines', 'videos', 'ascents'));

create or replace function public.athlete_write_allowed(athlete uuid, col text, data jsonb) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when auth.uid() is distinct from athlete then true
    else case public.plan_of(athlete)
      when 'expired' then col in ('pain', 'prefs', 'ascents')
      when 'trial' then
        col <> 'videos'
        and (col <> 'assessments' or data ->> 'battery' = 'beginner')
        and (col <> 'sessions' or data ->> 'date' is null
             or (data ->> 'date')::date <= (select (p.trial_ends_at at time zone 'UTC')::date
                                            from public.profiles p where p.id = athlete))
      when 'standard' then col <> 'videos'
      else true end
  end
$$;

drop policy "athlete_docs: create" on public.athlete_docs;
create policy "athlete_docs: create" on public.athlete_docs for insert to authenticated
  with check (public.can_access_athlete(athlete_id)
              and (col in ('sessions', 'prefs', 'routines', 'videos', 'ascents') or public.has_health_consent(athlete_id))
              and public.athlete_write_allowed(athlete_id, col, data));

drop policy "athlete_docs: edit" on public.athlete_docs;
create policy "athlete_docs: edit" on public.athlete_docs for update to authenticated
  using (public.can_access_athlete(athlete_id))
  with check (public.can_access_athlete(athlete_id)
              and (col in ('sessions', 'prefs', 'routines', 'videos', 'ascents') or public.has_health_consent(athlete_id))
              and public.athlete_write_allowed(athlete_id, col, data));

-- ---------- Storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 157286400,
        array['video/mp4', 'video/quicktime', 'video/webm', 'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg'])
on conflict (id) do nothing;

-- Climber a media file belongs to (first folder of its path), or null.
create function public.media_athlete(path text) returns uuid
language sql immutable set search_path = '' as $$
  select case when split_part(path, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(path, '/', 1)::uuid end
$$;

-- Uploading: staff for their climbers (voice notes); the climber themselves on Premium.
create function public.media_upload_allowed(athlete uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select athlete is not null and public.can_access_athlete(athlete)
     and (auth.uid() is distinct from athlete or public.plan_of(athlete) = 'premium')
$$;

create policy "media: read" on storage.objects for select to authenticated
  using (bucket_id = 'media' and public.can_access_athlete(public.media_athlete(name)));
create policy "media: upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.media_upload_allowed(public.media_athlete(name)));
create policy "media: delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (owner = auth.uid() or public.is_admin())
         and public.can_access_athlete(public.media_athlete(name)));
