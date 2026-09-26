-- Who is online: live presence (Supabase Realtime) plus a "last seen" time.
-- Visibility follows the existing rules: a climber sees their coach, a coach
-- sees their climbers, admins see everyone.

-- Last activity, written by the user's own app every few minutes. Readable by
-- whoever can already read the profile (profiles RLS); only the owner updates it.
alter table public.profiles add column last_seen_at timestamptz;

-- Live presence runs on private Realtime channels named presence:athlete:<uuid>,
-- one per climber: the climber, their coach and admins may join (read and track).
-- Realtime Authorization reads these policies; skipped where Realtime is absent
-- (e.g. the local test database).
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'realtime' and table_name = 'messages') then
    execute $p$
      create policy "altaris presence: read" on realtime.messages for select to authenticated
      using (
        realtime.messages.extension = 'presence'
        and case when (select realtime.topic()) ~ '^presence:athlete:[0-9a-f-]{36}$'
                 then public.can_access_athlete(substr((select realtime.topic()), 18)::uuid)
                 else false end
      )
    $p$;
    execute $p$
      create policy "altaris presence: track" on realtime.messages for insert to authenticated
      with check (
        realtime.messages.extension = 'presence'
        and case when (select realtime.topic()) ~ '^presence:athlete:[0-9a-f-]{36}$'
                 then public.can_access_athlete(substr((select realtime.topic()), 18)::uuid)
                 else false end
      )
    $p$;
  end if;
end $$;
