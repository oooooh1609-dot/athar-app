create table if not exists public.access_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text,
  max_uses integer not null default 1,
  uses integer not null default 0,
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
grant all on public.access_codes to service_role;
alter table public.access_codes enable row level security;

alter table public.feedback_threads drop constraint if exists feedback_threads_user_id_fkey;

update public.admin_credentials
set password_hash = 'pbkdf2$120000$e9548609dc5ba24399ed1e2b9c6ab905$6137413adf238c2581f9871ae758e22e0acb0c3c69ea506c1217e03a343a0c7f',
    updated_at = now()
where id = true;