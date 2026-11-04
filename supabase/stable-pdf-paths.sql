begin;
lock table public.sign_requests in access exclusive mode;
create temporary table signway_path_check on commit drop as select id,original_path,signed_path from public.sign_requests;
alter table public.sign_requests add column storage_owner_id uuid;
update public.sign_requests set storage_owner_id=owner_id;
alter table public.sign_requests alter column storage_owner_id set not null;
alter table public.sign_requests alter column storage_owner_id set default auth.uid();
alter table public.sign_requests alter column original_path set expression as (storage_owner_id::text || '/' || id::text || '/original.pdf');
alter table public.sign_requests alter column signed_path set expression as (storage_owner_id::text || '/' || id::text || '/signed.pdf');
comment on column public.sign_requests.storage_owner_id is 'Immutable PDF namespace, independent of the current workspace owner. Ownership authorization uses sign_requests.owner_id.';
alter policy "owners can read their PDFs" on storage.objects using (
 bucket_id='sign-pdf-documents' and exists(select 1 from public.sign_requests sr where sr.owner_id=(select auth.uid()) and (sr.original_path=name or sr.signed_path=name))
);
alter policy "owners can delete their PDFs" on storage.objects using (
 bucket_id='sign-pdf-documents' and exists(select 1 from public.sign_requests sr where sr.owner_id=(select auth.uid()) and (sr.original_path=name or sr.signed_path=name))
);
do $$ begin
 if exists(select 1 from public.sign_requests s join signway_path_check p using(id) where s.original_path is distinct from p.original_path or s.signed_path is distinct from p.signed_path) then raise exception 'PDF paths changed'; end if;
end $$;
commit;