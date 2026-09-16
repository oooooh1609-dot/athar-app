-- Atomic redemption of an access code.
--
-- The previous flow was: select the row, check max_uses in application code,
-- then update uses = uses + 1. Two requests arriving together both read the
-- same `uses`, both pass the check, and both are let in — so a single-use code
-- admits several people. This moves the check and the increment into one
-- statement, where the row lock makes the race impossible.
--
-- Returns the row when the code was accepted, and nothing when it was not.
-- The caller distinguishes "wrong code" from "code exhausted/expired/revoked"
-- with the separate status column.

create or replace function public.redeem_access_code(p_code text)
returns table (
  id uuid,
  code text,
  label text,
  max_uses integer,
  uses integer,
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_status text;
begin
  -- Lock the candidate row first so concurrent redemptions serialise here.
  select ac.id into v_id
  from public.access_codes ac
  where ac.code = upper(btrim(p_code))
  for update;

  if v_id is null then
    return query select
      null::uuid, null::text, null::text, null::integer, null::integer,
      null::timestamptz, null::timestamptz, null::timestamptz, null::timestamptz,
      'not_found'::text;
    return;
  end if;

  select case
           when ac.revoked_at is not null then 'revoked'
           when ac.expires_at is not null and ac.expires_at < now() then 'expired'
           when ac.max_uses > 0 and ac.uses >= ac.max_uses then 'exhausted'
           else 'ok'
         end
    into v_status
  from public.access_codes ac
  where ac.id = v_id;

  if v_status <> 'ok' then
    return query
      select ac.id, ac.code, ac.label, ac.max_uses, ac.uses, ac.expires_at,
             ac.revoked_at, ac.last_used_at, ac.created_at, v_status
      from public.access_codes ac
      where ac.id = v_id;
    return;
  end if;

  return query
    update public.access_codes ac
       set uses = ac.uses + 1,
           last_used_at = now()
     where ac.id = v_id
    returning ac.id, ac.code, ac.label, ac.max_uses, ac.uses, ac.expires_at,
              ac.revoked_at, ac.last_used_at, ac.created_at, 'ok'::text;
end;
$$;

revoke all on function public.redeem_access_code(text) from public, anon, authenticated;
grant execute on function public.redeem_access_code(text) to service_role;

-- Lookups go through the unique index on `code`; this one keeps the
-- administrator's list screen cheap as the table grows.
create index if not exists access_codes_created_at_idx
  on public.access_codes (created_at desc);
