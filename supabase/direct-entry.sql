-- Apply only together with the direct-entry frontend.
-- Device sessions remain authenticated and strictly scoped to their owner_id.
-- No anon-role grants, public bucket, or access to another owner are added.

alter policy "owners can view requests" on public.sign_requests using ((select auth.uid()) = owner_id);

alter policy "owners can delete requests" on public.sign_requests using ((select auth.uid()) = owner_id);

alter policy "owners can read their PDFs" on storage.objects using (bucket_id = 'sign-pdf-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

alter policy "owners can delete their PDFs" on storage.objects using (bucket_id = 'sign-pdf-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

alter policy "owners can upload original PDFs" on storage.objects with check (bucket_id = 'sign-pdf-documents' and exists (select 1 from public.sign_requests sr where sr.owner_id = (select auth.uid()) and sr.original_path = name and sr.status = 'pending' and sr.expires_at > now()));

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

create or replace function public.cancel_sign_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.sign_requests sr
  set status = 'cancelled', updated_at = now()
  where sr.id = p_request_id
    and sr.owner_id = auth.uid()
    and sr.status = 'pending';

  return found;
end;
$$;