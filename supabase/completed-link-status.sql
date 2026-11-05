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

  -- A completed capability reveals status only; never expose private file paths.
  if exists(select 1 from public.sign_requests sr where sr.token_hash=v_hash and sr.status='signed') then
    return query select null::uuid, null::text, null::text, null::text, null::timestamptz, 'signed'::text;
    return;
  end if;

  return query
  update public.sign_requests sr
  set signer_id = v_user_id,
      updated_at = now()
  where sr.token_hash = v_hash
    and sr.status = 'pending'
    and sr.expires_at > now()
  returning sr.id, sr.title, sr.original_path, sr.signed_path,
            sr.expires_at, sr.status;

  if not found then
    raise exception 'Invalid or expired signing link';
  end if;
end;
$$;

