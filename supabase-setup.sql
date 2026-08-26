-- Sign-PDF secure storage and signing workflow for Supabase
-- Run this entire file once in Supabase Dashboard > SQL Editor.
-- The frontend must use only the project's publishable key (sb_publishable_...).
-- Never place a secret key or service_role key in the browser.

begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.sign_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  signer_id uuid references auth.users (id) on delete set null,
  title text not null default 'מסמך לחתימה'
    check (char_length(title) between 1 and 200),
  token_hash text not null unique
    check (token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending'
    check (status in ('pending', 'signed', 'cancelled')),
  original_path text generated always as
    (owner_id::text || '/' || id::text || '/original.pdf') stored,
  signed_path text generated always as
    (owner_id::text || '/' || id::text || '/signed.pdf') stored,
  expires_at timestamptz not null default (now() + interval '7 days'),
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sign_requests_expiry_after_creation
    check (expires_at > created_at),
  constraint sign_requests_signed_state
    check (
      (status = 'signed' and signed_at is not null)
      or (status <> 'signed' and signed_at is null)
    )
);

create index if not exists sign_requests_owner_created_idx
  on public.sign_requests (owner_id, created_at desc);

create index if not exists sign_requests_signer_pending_idx
  on public.sign_requests (signer_id, expires_at)
  where status = 'pending';

alter table public.sign_requests enable row level security;

-- Explicit Data API grants are required for new Supabase projects.
revoke all on table public.sign_requests from anon, authenticated;
grant select, delete on table public.sign_requests to authenticated;

drop policy if exists "owners can view requests" on public.sign_requests;
create policy "owners can view requests"
  on public.sign_requests
  for select
  to authenticated
  using (
    (select auth.uid()) = owner_id
    and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) is false
  );

drop policy if exists "claimed signers can view requests" on public.sign_requests;
create policy "claimed signers can view requests"
  on public.sign_requests
  for select
  to authenticated
  using (
    (select auth.uid()) = signer_id
    and status in ('pending', 'signed')
    and expires_at > now()
  );

drop policy if exists "owners can delete requests" on public.sign_requests;
create policy "owners can delete requests"
  on public.sign_requests
  for delete
  to authenticated
  using (
    (select auth.uid()) = owner_id
    and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) is false
  );

-- A private PDF-only bucket with a 25 MB limit.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sign-pdf-documents',
  'sign-pdf-documents',
  false,
  26214400,
  array['application/pdf']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "owners can read their PDFs" on storage.objects;
create policy "owners can read their PDFs"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'sign-pdf-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) is false
  );

drop policy if exists "owners can upload original PDFs" on storage.objects;
create policy "owners can upload original PDFs"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'sign-pdf-documents'
    and exists (
      select 1
      from public.sign_requests sr
      where sr.owner_id = (select auth.uid())
        and sr.original_path = name
        and sr.status = 'pending'
        and sr.expires_at > now()
    )
    and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) is false
  );

drop policy if exists "owners can delete their PDFs" on storage.objects;
create policy "owners can delete their PDFs"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'sign-pdf-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) is false
  );

drop policy if exists "claimed signers can read original PDFs" on storage.objects;
create policy "claimed signers can read original PDFs"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'sign-pdf-documents'
    and exists (
      select 1
      from public.sign_requests sr
      where sr.signer_id = (select auth.uid())
        and sr.original_path = name
        and sr.status = 'pending'
        and sr.expires_at > now()
    )
  );

drop policy if exists "claimed signers can upload one signed PDF" on storage.objects;
create policy "claimed signers can upload one signed PDF"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'sign-pdf-documents'
    and exists (
      select 1
      from public.sign_requests sr
      where sr.signer_id = (select auth.uid())
        and sr.signed_path = name
        and sr.status = 'pending'
        and sr.expires_at > now()
    )
  );

-- Create a signing request and return the raw token exactly once.
create or replace function public.create_sign_request(
  p_title text default 'מסמך לחתימה',
  p_expires_at timestamptz default (now() + interval '7 days')
)
returns table (
  request_id uuid,
  signing_token text,
  original_path text,
  signed_path text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_token text;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'A permanent account is required';
  end if;

  if p_expires_at <= now() or p_expires_at > now() + interval '30 days' then
    raise exception 'Expiration must be between now and 30 days';
  end if;

  v_token := rtrim(translate(
    encode(extensions.gen_random_bytes(32), 'base64'),
    '+/', '-_'
  ), '=');

  return query
  insert into public.sign_requests (owner_id, title, token_hash, expires_at)
  values (
    v_user_id,
    left(coalesce(nullif(btrim(p_title), ''), 'מסמך לחתימה'), 200),
    encode(extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex'),
    p_expires_at
  )
  returning
    id,
    v_token,
    sign_requests.original_path,
    sign_requests.signed_path,
    sign_requests.expires_at;
end;
$$;

-- Atomically bind a valid link to the current anonymous signer.
create or replace function public.claim_sign_request(p_token text)
returns table (
  request_id uuid,
  title text,
  original_path text,
  signed_path text,
  expires_at timestamptz,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_hash text;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_token is null or char_length(p_token) < 32 or char_length(p_token) > 128 then
    raise exception 'Invalid or expired signing link';
  end if;

  v_hash := encode(
    extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'),
    'hex'
  );

  return query
  update public.sign_requests sr
  set signer_id = v_user_id,
      updated_at = now()
  where sr.token_hash = v_hash
    and sr.status = 'pending'
    and sr.expires_at > now()
    and (sr.signer_id is null or sr.signer_id = v_user_id)
  returning sr.id, sr.title, sr.original_path, sr.signed_path,
            sr.expires_at, sr.status;

  if not found then
    raise exception 'Invalid or expired signing link';
  end if;
end;
$$;

-- Mark a request signed only after its expected PDF exists in private storage.
create or replace function public.complete_sign_request(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_hash text;
  v_updated boolean := false;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_token is null or char_length(p_token) < 32 or char_length(p_token) > 128 then
    raise exception 'Invalid or expired signing link';
  end if;

  v_hash := encode(
    extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'),
    'hex'
  );

  update public.sign_requests sr
  set status = 'signed',
      signed_at = now(),
      updated_at = now()
  where sr.token_hash = v_hash
    and sr.signer_id = v_user_id
    and sr.status = 'pending'
    and sr.expires_at > now()
    and exists (
      select 1
      from storage.objects so
      where so.bucket_id = 'sign-pdf-documents'
        and so.name = sr.signed_path
    );

  v_updated := found;
  if not v_updated then
    raise exception 'Signed PDF was not found or the link is no longer valid';
  end if;

  return true;
end;
$$;

-- Let an owner invalidate an outstanding link without exposing direct UPDATE.
create or replace function public.cancel_sign_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'A permanent account is required';
  end if;

  update public.sign_requests sr
  set status = 'cancelled', updated_at = now()
  where sr.id = p_request_id
    and sr.owner_id = auth.uid()
    and sr.status = 'pending';

  return found;
end;
$$;

-- Functions are not public by default. Only signed-in Supabase users may call them.
revoke all on function public.create_sign_request(text, timestamptz) from public, anon;
revoke all on function public.claim_sign_request(text) from public, anon;
revoke all on function public.complete_sign_request(text) from public, anon;
revoke all on function public.cancel_sign_request(uuid) from public, anon;

grant execute on function public.create_sign_request(text, timestamptz) to authenticated;
grant execute on function public.claim_sign_request(text) to authenticated;
grant execute on function public.complete_sign_request(text) to authenticated;
grant execute on function public.cancel_sign_request(uuid) to authenticated;

commit;

-- Verification queries (read-only):
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'sign-pdf-documents';

select schemaname, tablename, policyname, roles, cmd
from pg_policies
where (schemaname = 'public' and tablename = 'sign_requests')
   or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;
