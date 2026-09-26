-- An admin is a coach with extra powers: a student may be paired to an admin as well as to a teacher.

create or replace function public.guard_profile() returns trigger
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
    if not exists (select 1 from public.profiles p where p.id = new.teacher_id and p.role in ('teacher', 'admin')) then
      raise exception 'teacher_id must reference a teacher or an admin';
    end if;
  end if;
  return new;
end $$;
