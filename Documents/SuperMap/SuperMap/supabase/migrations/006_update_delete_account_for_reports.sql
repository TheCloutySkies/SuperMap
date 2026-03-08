create or replace function public.delete_my_account()
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.saved_articles where user_id = uid;
  delete from public.saved_x_posts where user_id = uid;
  delete from public.user_updates where user_id = uid;
  delete from public.saved_places where user_id = uid;
  delete from public.saved_reports where user_id = uid;
  delete from auth.users where id = uid;

  return true;
end;
$$;

grant execute on function public.delete_my_account() to anon, authenticated;

