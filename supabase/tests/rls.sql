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

-- ================= anon
select t.as(null); set role anon;
select t.err('anon cannot read exercises', 'select count(*) from exercises');
select t.err('anon cannot read sessions', 'select count(*) from athlete_docs');
select t.err('anon cannot read messages', 'select count(*) from messages');
select t.err('anon cannot read calendar tokens', 'select count(*) from calendar_tokens');
reset role;
