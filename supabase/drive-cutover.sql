begin;
create table signing_private.drive_workspace_freezes (
 owner_id uuid primary key references auth.users(id), frozen_at timestamptz not null default now()
);
alter table signing_private.drive_workspace_freezes enable row level security;
revoke all on signing_private.drive_workspace_freezes from public,anon,authenticated;
-- Kept private because it reads the migration registry without exposing it.
create function signing_private.drive_assert_source_writable(p_owner uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text,57491));
 if exists(select 1 from signing_private.drive_workspace_freezes where owner_id=p_owner) then
  raise exception 'Workspace moved to Google Drive. Refresh SignWay to continue.' using errcode='55000';
 end if;
end;$$;
revoke all on function signing_private.drive_assert_source_writable(uuid) from public,anon,authenticated;
create function signing_private.drive_source_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if TG_OP<>'INSERT' then perform signing_private.drive_assert_source_writable(OLD.owner_id); end if;
 if TG_OP<>'DELETE' then perform signing_private.drive_assert_source_writable(NEW.owner_id); return NEW; end if;
 return OLD;
end;$$;
revoke all on function signing_private.drive_source_guard() from public,anon,authenticated;
create trigger drive_source_guard before insert or update or delete on public.sign_requests for each row execute function signing_private.drive_source_guard();
create trigger drive_source_guard before insert or update or delete on public.signature_groups for each row execute function signing_private.drive_source_guard();
create trigger drive_source_guard before insert or update or delete on public.signature_events for each row execute function signing_private.drive_source_guard();
create trigger drive_source_guard before insert or update or delete on public.event_participants for each row execute function signing_private.drive_source_guard();
-- Preserve current Storage policies. The guard only refuses writes for a frozen
-- request owner; paths continue to follow the immutable storage_owner_id namespace.
create function signing_private.drive_storage_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare candidate record; path text; bucket text;
begin
 if TG_OP<>'INSERT' then
  for candidate in select owner_id from public.sign_requests where OLD.bucket_id='sign-pdf-documents' and (original_path=OLD.name or signed_path=OLD.name) loop
   perform signing_private.drive_assert_source_writable(candidate.owner_id);
  end loop;
 end if;
 if TG_OP<>'DELETE' then
  for candidate in select owner_id from public.sign_requests where NEW.bucket_id='sign-pdf-documents' and (original_path=NEW.name or signed_path=NEW.name) loop
   perform signing_private.drive_assert_source_writable(candidate.owner_id);
  end loop;
  return NEW;
 end if;
 return OLD;
end;$$;
revoke all on function signing_private.drive_storage_guard() from public,anon,authenticated;
create trigger signway_drive_storage_guard before insert or update or delete on storage.objects for each row execute function signing_private.drive_storage_guard();
create function signing_private.drive_workspace_frozen() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from signing_private.drive_workspace_freezes where owner_id=auth.uid());
$$;
revoke all on function signing_private.drive_workspace_frozen() from public,anon,authenticated;
grant execute on function signing_private.drive_workspace_frozen() to authenticated;
create function public.signway_workspace_frozen() returns boolean
language sql stable security invoker set search_path='' as $$select signing_private.drive_workspace_frozen()$$;
revoke all on function public.signway_workspace_frozen() from public,anon,authenticated;
grant execute on function public.signway_workspace_frozen() to authenticated;
commit;
