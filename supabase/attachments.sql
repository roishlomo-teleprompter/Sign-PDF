-- Optional PDF evidence uploaded by a claimed recipient, scoped to one existing request.
-- Original/signed PDF paths and current workspace ownership are not changed.
create table public.sign_request_attachments (
 request_id uuid primary key references public.sign_requests(id) on delete cascade,
 file_name text not null check(char_length(file_name) between 1 and 200),
 storage_path text not null unique,
 created_at timestamptz not null default now()
);
alter table public.sign_request_attachments enable row level security;
revoke all on public.sign_request_attachments from public, anon, authenticated;
grant select on public.sign_request_attachments to authenticated;
create policy "request owner or claimed signer reads attachment metadata" on public.sign_request_attachments for select to authenticated using (
 exists(select 1 from public.sign_requests sr where sr.id=request_id and (sr.owner_id=(select auth.uid()) or sr.signer_id=(select auth.uid())))
);
create policy "request owner reads attachment PDF" on storage.objects for select to authenticated using (
 bucket_id='sign-pdf-documents' and exists(select 1 from public.sign_requests sr where sr.owner_id=(select auth.uid()) and regexp_replace(sr.original_path,'/original\.pdf$','/attachment.pdf')=storage.objects.name)
);
create policy "request owner deletes attachment PDF" on storage.objects for delete to authenticated using (
 bucket_id='sign-pdf-documents' and exists(select 1 from public.sign_requests sr where sr.owner_id=(select auth.uid()) and regexp_replace(sr.original_path,'/original\.pdf$','/attachment.pdf')=storage.objects.name)
);
create policy "claimed signer reads own attachment PDF" on storage.objects for select to authenticated using (
 bucket_id='sign-pdf-documents' and exists(select 1 from public.sign_requests sr where sr.signer_id=(select auth.uid()) and sr.expires_at>now() and regexp_replace(sr.original_path,'/original\.pdf$','/attachment.pdf')=storage.objects.name)
);
create policy "claimed signer uploads pending attachment" on storage.objects for insert to authenticated with check (
 bucket_id='sign-pdf-documents' and exists(select 1 from public.sign_requests sr where sr.signer_id=(select auth.uid()) and sr.status='pending' and sr.expires_at>now() and regexp_replace(sr.original_path,'/original\.pdf$','/attachment.pdf')=storage.objects.name)
);
create policy "claimed signer replaces pending attachment" on storage.objects for update to authenticated using (
 bucket_id='sign-pdf-documents' and exists(select 1 from public.sign_requests sr where sr.signer_id=(select auth.uid()) and sr.status='pending' and sr.expires_at>now() and regexp_replace(sr.original_path,'/original\.pdf$','/attachment.pdf')=storage.objects.name)
) with check (
 bucket_id='sign-pdf-documents' and exists(select 1 from public.sign_requests sr where sr.signer_id=(select auth.uid()) and sr.status='pending' and sr.expires_at>now() and regexp_replace(sr.original_path,'/original\.pdf$','/attachment.pdf')=storage.objects.name)
);
create function public.register_sign_attachment(p_token text,p_filename text) returns boolean language plpgsql security definer set search_path='' as $$
declare sr public.sign_requests; v_path text;
begin
 if auth.uid() is null or p_token is null or char_length(p_token) not between 32 and 128 or char_length(btrim(p_filename)) not between 1 and 200 then raise exception 'Invalid attachment'; end if;
 select * into sr from public.sign_requests where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and signer_id=auth.uid() and status='pending' and expires_at>now() for update;
 if sr.id is null then raise exception 'Open a valid pending signing link'; end if;
 v_path:=regexp_replace(sr.original_path,'/original\.pdf$','/attachment.pdf');
 if not exists(select 1 from storage.objects where bucket_id='sign-pdf-documents' and name=v_path) then raise exception 'Upload the attachment first'; end if;
 insert into public.sign_request_attachments(request_id,file_name,storage_path) values(sr.id,btrim(p_filename),v_path)
 on conflict(request_id) do update set file_name=excluded.file_name,created_at=now();
 return true;
end;$$;
revoke all on function public.register_sign_attachment(text,text) from public,anon;
grant execute on function public.register_sign_attachment(text,text) to authenticated;
