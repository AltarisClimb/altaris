-- An admin can permanently delete an account (GDPR erasure, departures, mistakes).
-- Deleting the auth user cascades through profiles to everything tied to the person:
-- sessions, assessments, pain log, messages, read markers, assignments, devices,
-- calendar token. Exercises they authored stay, without an author; climbers of a
-- deleted coach become unpaired.

create function public.admin_delete_user(target uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'only an admin can delete an account';
  end if;
  if target = auth.uid() then
    raise exception 'an admin cannot delete their own account from the app';
  end if;
  delete from auth.users where id = target;
  if not found then
    raise exception 'account not found';
  end if;
end $$;

revoke execute on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;
