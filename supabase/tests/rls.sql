\set QUIET on
\pset tuples_only on
\pset format unaligned

create schema t;
grant usage on schema t to authenticated, anon;
create function t.ok(name text, cond boolean) returns text language sql as $$
  select case when cond then 'PASS ' else 'FAIL ' end || name $$;
create function t.err(name text, stmt text) returns text language plpgsql as $$
begin execute stmt; return 'FAIL ' || name || ' (no error)';
exception when others then return 'PASS ' || name || '  [' || sqlerrm || ']'; end $$;
create function t.rows(stmt text) returns int language plpgsql as $$
declare n int; begin execute stmt; get diagnostics n = row_count; return n; end $$;
create function t.as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(uid::text, ''), false) $$;
grant execute on all functions in schema t to authenticated, anon;

-- ids
\set A  '''00000000-0000-0000-0000-00000000000a'''
\set T1 '''00000000-0000-0000-0000-0000000000b1'''
\set T2 '''00000000-0000-0000-0000-0000000000b2'''
\set S1 '''00000000-0000-0000-0000-0000000000c1'''
\set S2 '''00000000-0000-0000-0000-0000000000c2'''

-- fixtures, as postgres (auth.uid() null => guard allows bootstrap)
insert into auth.users (id, email, raw_user_meta_data) values
 (:A,  'admin@x', '{"full_name":"Admin","role":"admin"}'),
 (:T1, 't1@x', '{}'), (:T2, 't2@x', '{}'),
 (:S1, 's1@x', '{}'), (:S2, 's2@x', '{}');
select t.ok('signup trigger creates profiles, all as student (metadata role ignored)',
  (select count(*) from profiles where role = 'student') = 5);
update profiles set role = 'admin'   where id = :A;
update profiles set role = 'teacher' where id in (:T1, :T2);
update profiles set teacher_id = :T1 where id = :S1;
update profiles set teacher_id = :T2 where id = :S2;
-- Plans: S1 is an expired trial (free + assigned exercises only), S2 is premium (messaging).
update profiles set plan = 'trial', trial_ends_at = now() - interval '1 day' where id = :S1;
update profiles set plan = 'premium' where id = :S2;
update exercises set visibility = 'free' where slug = 'fd03';

-- ================= student S1
select t.as(:S1); set role authenticated;
select t.ok('S1 sees own profile + own teacher only', (select count(*) from profiles) = 2
  and exists (select 1 from profiles where id = :T1));
select t.ok('S1 sees only free exercise (nothing assigned yet)', (select count(*) from exercises) = 1);
select t.err('S1 cannot promote self', 'update profiles set role = ''admin'' where id = ' || quote_literal(:S1));
select t.err('S1 cannot change teacher', 'update profiles set teacher_id = ' || quote_literal(:T2) || ' where id = ' || quote_literal(:S1));
select t.ok('S1 can edit own name', t.rows('update profiles set full_name = ''Sam'' where id = ' || quote_literal(:S1)) = 1);
select t.err('S1 cannot create exercise', 'insert into exercises (author_id, title) values (' || quote_literal(:S1) || ', ''{}'')');
select t.err('S1 cannot self-assign', 'insert into assignments (exercise_id, student_id) select id, ' || quote_literal(:S1) || ' from exercises limit 1');
reset role;

-- ================= teacher T1
select t.as(:T1); set role authenticated;
select t.ok('T1 sees self + S1 only', (select count(*) from profiles) = 2
  and exists (select 1 from profiles where id = :S1) and not exists (select 1 from profiles where id = :S2));
select t.ok('T1 sees whole library (116)', (select count(*) from exercises) = 116);
insert into exercises (author_id, visibility, title) values (:T1, 'library', '{"fr":"T1 new"}');
select t.ok('T1 added an exercise to the library', exists (select 1 from exercises where title->>'fr' = 'T1 new'));
select t.err('private visibility no longer exists', 'insert into exercises (author_id, visibility, title) values (' || quote_literal(:T1) || ', ''private'', ''{}'')');
select t.err('T1 cannot publish free content', 'insert into exercises (author_id, visibility, title) values (' || quote_literal(:T1) || ', ''free'', ''{}'')');
select t.err('T1 cannot author as someone else', 'insert into exercises (author_id, title) values (' || quote_literal(:T2) || ', ''{}'')');
select t.ok('T1 cannot flip own exercise to free', t.err('x', 'update exercises set visibility = ''free'' where title->>''fr'' = ''T1 new''') like 'PASS%');
insert into assignments (exercise_id, student_id, assigned_by)
  select id, :S1, :T1 from exercises where title->>'fr' = 'T1 new';
select t.ok('T1 assigned exercise to S1', (select count(*) from assignments) = 1);
select t.err('T1 cannot assign to S2 (not theirs)', 'insert into assignments (exercise_id, student_id, assigned_by) select id, ' || quote_literal(:S2) || ', ' || quote_literal(:T1) || ' from exercises where slug = ''fd02''');
select t.ok('T1 cannot edit library exercise it did not author', t.rows('update exercises set level = ''x'' where slug = ''fd02''') = 0);
select t.ok('T1 cannot grab S2 (not theirs)', t.rows('update profiles set teacher_id = ' || quote_literal(:T1) || ' where id = ' || quote_literal(:S2)) = 0);
select t.ok('T1 cannot unpair own student S1', t.rows('update profiles set teacher_id = null where id = ' || quote_literal(:S1)) = 0);
reset role;

-- ================= student S1 again
select t.as(:S1); set role authenticated;
select t.ok('S1 now sees free + assigned exercise', (select count(*) from exercises) = 2);
select t.ok('S1 sees own assignment', (select count(*) from assignments) = 1);
select t.ok('S1 cannot delete assignment', t.rows('delete from assignments') = 0);
reset role;

-- ================= teacher T2
select t.as(:T2); set role authenticated;
select t.ok('T2 sees T1 library exercise', exists (select 1 from exercises where title->>'fr' = 'T1 new'));
select t.ok('T2 cannot see T1 assignments', (select count(*) from assignments) = 0);
select t.ok('T2 cannot delete T1 exercise', t.rows('delete from exercises where author_id = ' || quote_literal(:T1)) = 0);
reset role;

-- ================= admin
select t.as(:A); set role authenticated;
select t.ok('admin sees all profiles', (select count(*) from profiles) = 5);
select t.ok('admin sees all 117 exercises', (select count(*) from exercises) = 117);
select t.ok('admin re-pairs S2 to T1', t.rows('update profiles set teacher_id = ' || quote_literal(:T1) || ' where id = ' || quote_literal(:S2)) = 1);
select t.err('pairing to a non-teacher is rejected', 'update profiles set teacher_id = ' || quote_literal(:S1) || ' where id = ' || quote_literal(:S2));
select t.err('a teacher cannot have a teacher', 'update profiles set teacher_id = ' || quote_literal(:T1) || ' where id = ' || quote_literal(:T2));
select t.ok('admin can publish free content', t.rows('update exercises set visibility = ''free'' where slug = ''fd02''') = 1);
select t.ok('admin suspends T2', t.rows('update profiles set status = ''suspended'' where id = ' || quote_literal(:T2)) = 1);
reset role;

-- ================= after re-pairing / suspension
select t.as(:T1); set role authenticated;
select t.ok('T1 now sees S2 too', (select count(*) from profiles) = 3);
reset role;
select t.as(:T2); set role authenticated;
select t.ok('suspended T2 loses library access (free only)', (select count(*) from exercises) = 2);
reset role;

-- ================= admin as coach
select t.as(:A); set role authenticated;
select t.ok('a student can be paired to an admin', t.rows('update profiles set teacher_id = ' || quote_literal(:A) || ' where id = ' || quote_literal(:S1)) = 1);
reset role;
select t.as(:S1); set role authenticated;
select t.ok('S1 sees own profile + admin coach', (select count(*) from profiles) = 2);
reset role;

-- ================= athlete documents (training sessions)
-- At this point S1's coach is A (admin), S2's coach is T1, T2 is suspended.
select t.as(:T1); set role authenticated;
select t.ok('T1 plans a session for own student S2', t.rows('insert into athlete_docs (col, id, athlete_id, data) values (''sessions'', ''s-1'', ' || quote_literal(:S2) || ', ''{"title":"Force"}'')') = 1);
select t.err('T1 cannot plan for S1 (not theirs)', 'insert into athlete_docs (col, id, athlete_id, data) values (''sessions'', ''s-2'', ' || quote_literal(:S1) || ', ''{}'')');
select t.err('unknown collection is rejected', 'insert into athlete_docs (col, id, athlete_id, data) values (''threads'', ''x-1'', ' || quote_literal(:S2) || ', ''{}'')');
select t.ok('updated_by is stamped with the writer', (select updated_by from athlete_docs where id = 's-1') = :T1);
reset role;
select t.as(:S2); set role authenticated;
select t.ok('S2 sees the session planned for them', (select count(*) from athlete_docs) = 1);
select t.ok('S2 validates it', t.rows('update athlete_docs set data = data || ''{"status":"done"}'' where id = ''s-1''') = 1);
select t.err('S2 cannot hand it to S1', 'update athlete_docs set athlete_id = ' || quote_literal(:S1) || ' where id = ''s-1''');
reset role;
select t.as(:S1); set role authenticated;
select t.ok('S1 does not see S2 sessions', (select count(*) from athlete_docs) = 0);
reset role;
select t.as(:T2); set role authenticated;
select t.ok('suspended T2 sees no sessions', (select count(*) from athlete_docs) = 0);
reset role;
select t.as(:A); set role authenticated;
select t.ok('admin sees every session', (select count(*) from athlete_docs) = 1);
select t.ok('admin can delete a session', t.rows('delete from athlete_docs where id = ''s-1''') = 1);
reset role;

-- ================= messages
-- Still: S1's coach is A (admin), S2's coach is T1, T2 is suspended.
select t.as(:S2); set role authenticated;
select t.ok('S2 writes to their coach', t.rows('insert into messages (athlete_id, body) values (' || quote_literal(:S2) || ', ''Bonjour coach'')') = 1);
select t.ok('sender is stamped by the server', (select sender_id from messages where body = 'Bonjour coach') = :S2);
select t.err('S2 cannot post in S1 conversation', 'insert into messages (athlete_id, body) values (' || quote_literal(:S1) || ', ''x'')');
select t.ok('S2 posts with a forged sender_id', t.rows('insert into messages (athlete_id, sender_id, body) values (' || quote_literal(:S2) || ', ' || quote_literal(:T1) || ', ''spoof'')') = 1);
select t.ok('  … and the stored sender is S2, not the coach', (select sender_id from messages where body = 'spoof') = :S2);
select t.err('empty message rejected', 'insert into messages (athlete_id, body) values (' || quote_literal(:S2) || ', '''')');
select t.ok('S2 cannot edit a message', t.rows('update messages set body = ''edited''') = 0);
select t.ok('S2 cannot delete a message', t.rows('delete from messages') = 0);
reset role;
select t.as(:T1); set role authenticated;
select t.ok('T1 reads S2 conversation', (select count(*) from messages where athlete_id = :S2) = 2);
select t.ok('T1 replies', t.rows('insert into messages (athlete_id, body) values (' || quote_literal(:S2) || ', ''Salut'')') = 1);
select t.ok('T1 marks S2 conversation read', t.rows('insert into message_reads (athlete_id, user_id, last_read_at) values (' || quote_literal(:S2) || ', ' || quote_literal(:T1) || ', now())') = 1);
select t.err('T1 cannot mark read for someone else', 'insert into message_reads (athlete_id, user_id, last_read_at) values (' || quote_literal(:S2) || ', ' || quote_literal(:S2) || ', now())');
reset role;
select t.as(:S1); set role authenticated;
select t.ok('S1 sees nothing of S2 conversation', (select count(*) from messages) = 0);
select t.ok('S1 does not see T1 read markers', (select count(*) from message_reads) = 0);
reset role;
select t.as(:T2); set role authenticated;
select t.ok('suspended T2 sees no messages', (select count(*) from messages) = 0);
reset role;

-- ================= health data (GDPR art. 9 consent)
-- Still: S1's coach is A (admin), S2's coach is T1.
select t.as(:S2); set role authenticated;
select t.err('no consent: S2 cannot log pain', 'insert into athlete_docs (col, id, athlete_id, data) values (''pain'', ''p-1'', ' || quote_literal(:S2) || ', ''{"eva":3}'')');
select t.ok('S2 gives consent', t.rows('update profiles set health_consent_at = now(), health_consent_version = ''v1'' where id = ' || quote_literal(:S2)) = 1);
select t.ok('with consent: S2 logs pain', t.rows('insert into athlete_docs (col, id, athlete_id, data) values (''pain'', ''p-1'', ' || quote_literal(:S2) || ', ''{"eva":3}'')') = 1);
select t.ok('with consent: S2 saves an assessment', t.rows('insert into athlete_docs (col, id, athlete_id, data) values (''assessments'', ''a-1'', ' || quote_literal(:S2) || ', ''{}'')') = 1);
select t.ok('S2 still has a session doc for later', t.rows('insert into athlete_docs (col, id, athlete_id, data) values (''sessions'', ''s-9'', ' || quote_literal(:S2) || ', ''{}'')') = 1);
reset role;
select t.as(:T1); set role authenticated;
select t.ok('T1 sees S2 pain log', (select count(*) from athlete_docs where col = 'pain' and athlete_id = :S2) = 1);
select t.ok('T1 cannot consent for S2 (row not writable)', t.rows('update profiles set health_consent_at = null where id = ' || quote_literal(:S2)) = 0);
reset role;
select t.as(:A); set role authenticated;
select t.err('admin cannot consent for S1', 'update profiles set health_consent_at = now() where id = ' || quote_literal(:S1));
select t.err('admin cannot write S1 health data without S1 consent', 'insert into athlete_docs (col, id, athlete_id, data) values (''pain'', ''p-2'', ' || quote_literal(:S1) || ', ''{}'')');
reset role;
select t.as(:S2); set role authenticated;
select t.ok('S2 withdraws consent', t.rows('update profiles set health_consent_at = null where id = ' || quote_literal(:S2)) = 1);
reset role;
select t.ok('withdrawal erased S2 health data', (select count(*) from athlete_docs where athlete_id = :S2 and col in ('pain', 'assessments')) = 0);
select t.ok('withdrawal kept S2 sessions', (select count(*) from athlete_docs where athlete_id = :S2 and col = 'sessions') = 1);

-- ================= notifications & calendar feed
select t.as(:S2); set role authenticated;
select t.ok('S2 registers a device', t.rows('insert into push_subscriptions (endpoint, p256dh, auth) values (''https://push.example/s2'', ''k'', ''a'')') = 1);
select t.ok('device is stamped with S2', (select user_id from push_subscriptions where endpoint = 'https://push.example/s2') = :S2);
select t.err('S2 cannot register a device for T1', 'insert into push_subscriptions (endpoint, user_id, p256dh, auth) values (''https://push.example/x'', ' || quote_literal(:T1) || ', ''k'', ''a'')');
select t.ok('S2 gets a calendar token', t.rows('insert into calendar_tokens default values') = 1);
select t.ok('token is long and random', (select length(token) from calendar_tokens) = 64);
select t.ok('S2 sets own time zone', t.rows('update profiles set timezone = ''Europe/Paris'' where id = ' || quote_literal(:S2)) = 1);
reset role;
select t.as(:T1); set role authenticated;
select t.ok('T1 cannot see S2 devices', (select count(*) from push_subscriptions) = 0);
select t.ok('T1 cannot see S2 calendar token', (select count(*) from calendar_tokens) = 0);
select t.ok('T1 cannot read the notification log', (select count(*) from notification_log) = 0);
reset role;

-- ================= names at sign-up (as postgres, like the auth service)
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000d1', 'd1@x', '{"first_name":"  Anne  Marie ","last_name":"le   goff"}'),
  ('00000000-0000-0000-0000-0000000000d2', 'd2@x', '{"full_name":"Old Style"}');
select t.ok('family name in capitals, spaces cleaned', (select full_name from profiles where email = 'd1@x') = 'Anne Marie LE GOFF');
select t.ok('older sign-ups without first/last keep full_name', (select full_name from profiles where email = 'd2@x') = 'Old Style');

-- ================= last seen
select t.as(:S2); set role authenticated;
select t.ok('S2 records own last activity', t.rows('update profiles set last_seen_at = now() where id = ' || quote_literal(:S2)) = 1);
reset role;
select t.as(:T1); set role authenticated;
select t.ok('T1 (coach) sees S2 last activity', (select last_seen_at from profiles where id = :S2) is not null);
select t.ok('T1 cannot write S2 last activity', t.rows('update profiles set last_seen_at = now() where id = ' || quote_literal(:S2)) = 0);
reset role;
select t.as(:S1); set role authenticated;
select t.ok('S1 cannot see S2 at all', (select count(*) from profiles where id = :S2) = 0);
reset role;

-- ================= account deletion
-- Give S2 some data first (as postgres): a session, a message, a device.
insert into athlete_docs (col, id, athlete_id, data) values ('sessions', 's-del', :S2, '{}');
insert into messages (athlete_id, sender_id, body) values (:S2, :S2, 'to be erased');
insert into push_subscriptions (endpoint, user_id, p256dh, auth) values ('https://push.example/del', :S2, 'k', 'a');
select t.as(:T1); set role authenticated;
select t.err('a coach cannot delete an account', 'select public.admin_delete_user(' || quote_literal(:S2) || ')');
reset role;
select t.as(:S1); set role authenticated;
select t.err('a climber cannot delete an account', 'select public.admin_delete_user(' || quote_literal(:S2) || ')');
reset role;
select t.as(:A); set role authenticated;
select t.err('an admin cannot delete themselves', 'select public.admin_delete_user(' || quote_literal(:A) || ')');
select t.ok('admin deletes S2', (select count(*) from (select public.admin_delete_user(:S2)) x) = 1);
reset role;
select t.ok('S2 login is gone', (select count(*) from auth.users where id = :S2) = 0);
select t.ok('S2 profile is gone', (select count(*) from profiles where id = :S2) = 0);
select t.ok('S2 sessions and health data are gone', (select count(*) from athlete_docs where athlete_id = :S2) = 0);
select t.ok('S2 conversation is gone', (select count(*) from messages where athlete_id = :S2) = 0);
select t.ok('S2 devices are gone', (select count(*) from push_subscriptions where user_id = :S2) = 0);
select t.err('anon cannot delete accounts', 'set role anon; select public.admin_delete_user(' || quote_literal(:S1) || ')');
reset role;

-- ================= plans
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', 'trial@x', '{}'),
  ('00000000-0000-0000-0000-0000000000e2', 'std@x', '{}');
select t.ok('a new sign-up starts a 7-day trial',
  (select plan = 'trial' and trial_ends_at > now() + interval '6 days' from profiles where email = 'trial@x'));
select t.as(null);
update profiles set plan = 'standard', trial_ends_at = null where email = 'std@x';

select t.as('00000000-0000-0000-0000-0000000000e1'); set role authenticated;
select t.err('a climber cannot upgrade themselves', 'update profiles set plan = ''premium'' where email = ''trial@x''');
select t.err('a climber cannot extend their trial', 'update profiles set trial_ends_at = now() + interval ''1 year'' where email = ''trial@x''');
select t.ok('trial: sees the library', (select count(*) from exercises) > 100);
update profiles set health_consent_at = now() where email = 'trial@x';
select t.ok('trial: basic test saved', t.rows('insert into athlete_docs (col, id, athlete_id, data) values (''assessments'', ''a-t1'', ''00000000-0000-0000-0000-0000000000e1'', ''{"battery":"beginner"}'')') = 1);
select t.err('trial: full test refused', 'insert into athlete_docs (col, id, athlete_id, data) values (''assessments'', ''a-t2'', ''00000000-0000-0000-0000-0000000000e1'', ''{"battery":"advanced"}'')');
select t.ok('trial: session within the trial week', t.rows('insert into athlete_docs (col, id, athlete_id, data) values (''sessions'', ''s-t1'', ''00000000-0000-0000-0000-0000000000e1'', ' || quote_literal(json_build_object('date', current_date + 3)::text) || ')') = 1);
select t.err('trial: no session after the trial', 'insert into athlete_docs (col, id, athlete_id, data) values (''sessions'', ''s-t2'', ''00000000-0000-0000-0000-0000000000e1'', ' || quote_literal(json_build_object('date', current_date + 20)::text) || ')');
select t.err('trial: no messaging', 'insert into messages (athlete_id, body) values (''00000000-0000-0000-0000-0000000000e1'', ''hi'')');
select t.ok('trial: can ask for a plan', t.rows('insert into plan_requests (plan) values (''premium'')') = 1);
select t.err('trial: cannot ask on behalf of someone else', 'insert into plan_requests (user_id, plan) values (''00000000-0000-0000-0000-0000000000e2'', ''premium'')');
reset role;

select t.as('00000000-0000-0000-0000-0000000000e2'); set role authenticated;
select t.ok('standard: session far ahead allowed', t.rows('insert into athlete_docs (col, id, athlete_id, data) values (''sessions'', ''s-s1'', ''00000000-0000-0000-0000-0000000000e2'', ' || quote_literal(json_build_object('date', current_date + 25)::text) || ')') = 1);
select t.err('standard: no messaging', 'insert into messages (athlete_id, body) values (''00000000-0000-0000-0000-0000000000e2'', ''hi'')');
select t.ok('standard: does not see other requests', (select count(*) from plan_requests) = 0);
reset role;

-- The trial ends.
select t.as(null);
update profiles set trial_ends_at = now() - interval '1 minute' where email = 'trial@x';
select t.as('00000000-0000-0000-0000-0000000000e1'); set role authenticated;
select t.ok('expired: effective plan', public.plan_of('00000000-0000-0000-0000-0000000000e1') = 'expired');
select t.err('expired: cannot validate a session', 'update athlete_docs set data = data || ''{"status":"done"}'' where id = ''s-t1''');
select t.ok('expired: can still report pain', t.rows('insert into athlete_docs (col, id, athlete_id, data) values (''pain'', ''p-t1'', ''00000000-0000-0000-0000-0000000000e1'', ''{"eva":2}'')') = 1);
select t.ok('expired: back to free + assigned exercises', (select count(*) from exercises) < 5);
reset role;

select t.as(:A); set role authenticated;
select t.ok('admin sees plan requests', (select count(*) from plan_requests) = 1);
select t.ok('admin upgrades the climber', t.rows('update profiles set plan = ''premium'', trial_ends_at = null where email = ''trial@x''') = 1);
select t.ok('admin marks the request handled', t.rows('update plan_requests set handled_at = now()') = 1);
reset role;
select t.ok('upgraded: plan is premium again', public.plan_of('00000000-0000-0000-0000-0000000000e1') = 'premium');

-- ================= video calls (premium)
-- Coach T1 with two climbers: C1 premium, C2 standard.
select t.as(null);
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f1', 'c1@x', '{}'), ('00000000-0000-0000-0000-0000000000f2', 'c2@x', '{}');
update profiles set plan = 'premium', teacher_id = :T1 where email = 'c1@x';
update profiles set plan = 'standard', teacher_id = :T1 where email = 'c2@x';

select t.as(:T1); set role authenticated;
select t.ok('coach publishes slots', t.rows('insert into call_slots (starts_at) values
  (date_trunc(''month'', now()) + interval ''1 month 3 days 18 hours''),
  (date_trunc(''month'', now()) + interval ''1 month 10 days 18 hours''),
  (date_trunc(''month'', now()) + interval ''2 months 3 days 18 hours'')') = 3);
select t.err('no slot in the past', 'insert into call_slots (starts_at) values (now() - interval ''1 hour'')');
reset role;
select t.as('00000000-0000-0000-0000-0000000000f2'); set role authenticated;
select t.ok('standard climber sees the coach slots', (select count(*) from call_slots) = 3);
select t.err('standard climber cannot book', 'update call_slots set booked_by = auth.uid() where starts_at = (select min(starts_at) from call_slots)');
reset role;
select t.as('00000000-0000-0000-0000-0000000000f1'); set role authenticated;
select t.ok('premium climber books a slot', t.rows('update call_slots set booked_by = auth.uid() where starts_at = (select min(starts_at) from call_slots)') = 1);
select t.ok('booking time is stamped', (select booked_at is not null from call_slots where booked_by = auth.uid()));
select t.err('only one call per month', 'update call_slots set booked_by = auth.uid() where starts_at = (select min(starts_at) from call_slots where booked_by is null)');
select t.ok('next month is fine', t.rows('update call_slots set booked_by = auth.uid() where starts_at = (select max(starts_at) from call_slots)') = 1);
select t.err('climber cannot move a slot', 'update call_slots set starts_at = starts_at + interval ''1 day'' where booked_by = auth.uid()');
select t.ok('climber cancels a booking more than 24 h ahead', t.rows('update call_slots set booked_by = null where starts_at = (select max(starts_at) from call_slots where booked_by = auth.uid())') = 1);
select t.err('climber cannot publish slots', 'insert into call_slots (starts_at) values (now() + interval ''3 days'')');
reset role;
select t.as('00000000-0000-0000-0000-0000000000f2'); set role authenticated;
select t.ok('others no longer see a booked slot', (select count(*) from call_slots) = 2);
select t.ok('cannot take a booked slot (invisible, nothing updated)', t.rows('update call_slots set booked_by = auth.uid() where booked_by is not null') = 0);
reset role;
select t.as(:S1); set role authenticated;
select t.ok('a climber of another coach sees nothing', (select count(*) from call_slots) = 0);
reset role;
select t.as(:T1); set role authenticated;
select t.ok('coach sees the booking', (select count(*) from call_slots where booked_by is not null) = 1);
select t.ok('coach can remove a slot', t.rows('delete from call_slots where booked_by is null and starts_at = (select max(starts_at) from call_slots)') = 1);
reset role;
select t.as(null);

-- ================= training profile and session templates
-- S1: expired trial, coach A (admin), no health consent. F1: premium, coach T1.
select t.as(:S1); set role authenticated;
select t.ok('expired, no consent: the climber keeps their training profile up to date', t.rows('insert into athlete_docs (col, id, athlete_id, data) values (''prefs'', ''prefs-s1'', ' || quote_literal(:S1) || ', ''{"gradeSport":"7a"}'')') = 1);
select t.err('expired: no new session template', 'insert into athlete_docs (col, id, athlete_id, data) values (''routines'', ''r-s1'', ' || quote_literal(:S1) || ', ''{}'')');
select t.err('cannot write the training profile of someone else', 'insert into athlete_docs (col, id, athlete_id, data) values (''prefs'', ''prefs-x'', ''00000000-0000-0000-0000-0000000000f1'', ''{}'')');
reset role;
select t.as(:T1); set role authenticated;
select t.ok('another coach does not see it', (select count(*) from athlete_docs where col = 'prefs') = 0);
select t.ok('coach saves a template of their own', t.rows('insert into athlete_docs (col, id, athlete_id, data) values (''routines'', ''r-t1'', ' || quote_literal(:T1) || ', ''{"name":"Force"}'')') = 1);
reset role;
select t.as('00000000-0000-0000-0000-0000000000f1'); set role authenticated;
select t.ok('premium climber saves a template', t.rows('insert into athlete_docs (col, id, athlete_id, data) values (''routines'', ''r-f1'', ''00000000-0000-0000-0000-0000000000f1'', ''{"name":"Mardi"}'')') = 1);
select t.ok('a climber only sees their own templates', (select count(*) from athlete_docs where col = 'routines') = 1);
select t.ok('nor the profile of another climber', (select count(*) from athlete_docs where col = 'prefs') = 0);
reset role;
select t.as(:T1); set role authenticated;
select t.ok('the coach sees the templates of their climbers too', (select count(*) from athlete_docs where col = 'routines') = 2);
reset role;
select t.as(:A); set role authenticated;
select t.ok('their coach (here the admin) reads the training profile', (select count(*) from athlete_docs where col = 'prefs' and athlete_id = :S1) = 1);
reset role;
select t.as(null);

-- ================= videos, logbook and media storage
-- F1: premium, coach T1. F2: standard, coach T1. S1: expired trial, coach A.
select t.as('00000000-0000-0000-0000-0000000000f2'); set role authenticated;
select t.err('standard: cannot send a video for analysis', 'insert into athlete_docs (col, id, athlete_id, data) values (''videos'', ''v-f2'', ''00000000-0000-0000-0000-0000000000f2'', ''{}'')');
select t.ok('standard: logs an ascent', t.rows('insert into athlete_docs (col, id, athlete_id, data) values (''ascents'', ''a-f2'', ''00000000-0000-0000-0000-0000000000f2'', ''{"grade":"7a"}'')') = 1);
select t.err('standard: cannot upload a clip', 'insert into storage.objects (bucket_id, name) values (''media'', ''00000000-0000-0000-0000-0000000000f2/clip.mp4'')');
reset role;
select t.as('00000000-0000-0000-0000-0000000000f1'); set role authenticated;
select t.ok('premium: sends a video for analysis', t.rows('insert into athlete_docs (col, id, athlete_id, data) values (''videos'', ''v-f1'', ''00000000-0000-0000-0000-0000000000f1'', ''{"notes":[]}'')') = 1);
select t.ok('premium: uploads the clip into their folder', t.rows('insert into storage.objects (bucket_id, name) values (''media'', ''00000000-0000-0000-0000-0000000000f1/clip.mp4'')') = 1);
select t.err('cannot upload into another climber folder', 'insert into storage.objects (bucket_id, name) values (''media'', ''00000000-0000-0000-0000-0000000000f2/x.mp4'')');
select t.err('cannot upload outside a climber folder', 'insert into storage.objects (bucket_id, name) values (''media'', ''loose.mp4'')');
select t.ok('premium: sees own clip only', (select count(*) from storage.objects) = 1);
reset role;
select t.as(:S1); set role authenticated;
select t.ok('expired: can still log an ascent', t.rows('insert into athlete_docs (col, id, athlete_id, data) values (''ascents'', ''a-s1'', ' || quote_literal(:S1) || ', ''{}'')') = 1);
select t.err('expired: no video', 'insert into athlete_docs (col, id, athlete_id, data) values (''videos'', ''v-s1'', ' || quote_literal(:S1) || ', ''{}'')');
select t.ok('another climber sees no media', (select count(*) from storage.objects) = 0);
reset role;
select t.as(:T1); set role authenticated;
select t.ok('coach comments the video', t.rows('update athlete_docs set data = data || ''{"notes":[{"t":12,"text":"hanche"}]}'' where id = ''v-f1''') = 1);
select t.ok('coach records a voice note for a standard climber', t.rows('insert into storage.objects (bucket_id, name) values (''media'', ''00000000-0000-0000-0000-0000000000f2/voice.webm'')') = 1);
select t.ok('coach sees the media of their climbers', (select count(*) from storage.objects) = 2);
select t.ok('coach reads the logbook', (select count(*) from athlete_docs where col = 'ascents') = 1);
select t.ok('coach deletes own voice note', t.rows('delete from storage.objects where name like ''%voice.webm''') = 1);
select t.ok('coach cannot delete the climber clip', t.rows('delete from storage.objects where name like ''%clip.mp4''') = 0);
reset role;
select t.as(null);

-- ================= anon
select t.as(null); set role anon;
select t.err('anon cannot read exercises', 'select count(*) from exercises');
select t.err('anon cannot read sessions', 'select count(*) from athlete_docs');
select t.err('anon cannot read messages', 'select count(*) from messages');
select t.err('anon cannot read calendar tokens', 'select count(*) from calendar_tokens');
reset role;
