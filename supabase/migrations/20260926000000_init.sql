-- ALTARIS — initial schema: profiles, exercises, assignments + Row Level Security.
-- Roles: admin (manages accounts & pairings), teacher (sees assigned students only), student.

-- ---------------------------------------------------------------- tables

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  full_name   text not null default '',
  role        text not null default 'student' check (role in ('admin', 'teacher', 'student')),
  status      text not null default 'active'  check (status in ('active', 'suspended')),
  teacher_id  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index profiles_teacher_id_idx on public.profiles (teacher_id);

-- free:    visible to everyone signed in (students included)
-- library: shared catalogue for teachers/admins; students only via an assignment
create table public.exercises (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique,
  author_id   uuid references public.profiles (id) on delete set null,
  visibility  text not null default 'library' check (visibility in ('free', 'library')),
  category    text,
  level       text,
  title       jsonb not null,                     -- {"fr": "...", "en": "..."}
  content     jsonb not null default '{}'::jsonb, -- {"fr": {...}, "en": {...}}
  video_url   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index exercises_author_id_idx  on public.exercises (author_id);
create index exercises_visibility_idx on public.exercises (visibility);

create table public.assignments (
  id           uuid primary key default gen_random_uuid(),
  exercise_id  uuid not null references public.exercises (id) on delete cascade,
  student_id   uuid not null references public.profiles (id)  on delete cascade,
  assigned_by  uuid references public.profiles (id) on delete set null,
  note         text,
  due_date     date,
  created_at   timestamptz not null default now(),
  unique (exercise_id, student_id)
);
create index assignments_student_id_idx on public.assignments (student_id);

-- ---------------------------------------------------------------- helpers
-- SECURITY DEFINER so policies can read profiles without recursing into profiles' own RLS.

create function public.my_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid() and status = 'active'
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.my_role() = 'admin', false)
$$;

create function public.is_teacher_of(student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.my_role() = 'teacher'
     and exists (select 1 from public.profiles p where p.id = student and p.teacher_id = auth.uid())
$$;

create function public.my_teacher_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select teacher_id from public.profiles where id = auth.uid()
$$;

create function public.is_assigned_to_me(exercise uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.assignments a where a.exercise_id = exercise and a.student_id = auth.uid())
$$;

-- ---------------------------------------------------------------- triggers

-- Every new auth user gets a student profile. Role never comes from user metadata:
-- signup metadata is user-controlled, so trusting it would allow self-promotion.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Only admins may change role / status / teacher pairing. auth.uid() is null for the
-- SQL editor and the service role, which is how the first admin gets bootstrapped.
create function public.guard_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.is_admin() and (
       new.role       is distinct from old.role
    or new.status     is distinct from old.status
    or new.teacher_id is distinct from old.teacher_id
    or new.email      is distinct from old.email
    or new.id         is distinct from old.id
  ) then
    raise exception 'only an admin can change role, status, email or teacher';
  end if;

  if new.teacher_id is not null then
    if new.role <> 'student' then
      raise exception 'only students can be assigned to a teacher';
    end if;
    if not exists (select 1 from public.profiles p where p.id = new.teacher_id and p.role = 'teacher') then
      raise exception 'teacher_id must reference a teacher';
    end if;
  end if;
  return new;
end $$;

create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profile();

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger exercises_touch
  before update on public.exercises
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- RLS: profiles

alter table public.profiles enable row level security;

create policy "profiles: read self, students, teacher"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or public.is_admin()
    or public.is_teacher_of(id)
    or id = public.my_teacher_id()
  );

create policy "profiles: update self or admin"
  on public.profiles for update to authenticated
  using      (id = (select auth.uid()) or public.is_admin())
  with check (id = (select auth.uid()) or public.is_admin());

-- No insert policy (profiles come from the auth trigger).
-- No delete policy (delete the auth user instead; the profile cascades).

-- ---------------------------------------------------------------- RLS: exercises

alter table public.exercises enable row level security;

create policy "exercises: read free, library (staff), assigned"
  on public.exercises for select to authenticated
  using (
    visibility = 'free'
    or public.is_admin()
    or (visibility = 'library' and public.my_role() = 'teacher')
    or public.is_assigned_to_me(id)
  );

-- Teachers add to the library; publishing free content is admin-only.
create policy "exercises: teachers and admins create"
  on public.exercises for insert to authenticated
  with check (
    public.is_admin()
    or (public.my_role() = 'teacher' and author_id = (select auth.uid()) and visibility = 'library')
  );

create policy "exercises: author or admin update"
  on public.exercises for update to authenticated
  using (
    public.is_admin()
    or (public.my_role() = 'teacher' and author_id = (select auth.uid()))
  )
  with check (
    public.is_admin()
    or (public.my_role() = 'teacher' and author_id = (select auth.uid()) and visibility = 'library')
  );

create policy "exercises: author or admin delete"
  on public.exercises for delete to authenticated
  using (
    public.is_admin()
    or (public.my_role() = 'teacher' and author_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------- RLS: assignments

alter table public.assignments enable row level security;

create policy "assignments: read own or own students"
  on public.assignments for select to authenticated
  using (
    student_id = (select auth.uid())
    or public.is_teacher_of(student_id)
    or public.is_admin()
  );

-- A teacher can only assign exercises they can see, to their own students.
create policy "assignments: teacher assigns to own students"
  on public.assignments for insert to authenticated
  with check (
    public.is_admin()
    or (
      public.is_teacher_of(student_id)
      and assigned_by = (select auth.uid())
      and exists (select 1 from public.exercises e where e.id = exercise_id)
    )
  );

create policy "assignments: teacher edits own students' assignments"
  on public.assignments for update to authenticated
  using      (public.is_teacher_of(student_id) or public.is_admin())
  with check (public.is_teacher_of(student_id) or public.is_admin());

create policy "assignments: teacher removes own students' assignments"
  on public.assignments for delete to authenticated
  using (public.is_teacher_of(student_id) or public.is_admin());

-- ---------------------------------------------------------------- grants
-- Nothing is readable without signing in.
revoke all on public.profiles, public.exercises, public.assignments from anon;
