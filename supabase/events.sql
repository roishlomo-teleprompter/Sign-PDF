begin;
create table public.signature_groups (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 name text not null check(length(name) between 1 and 120), members jsonb not null default '[]' check(jsonb_typeof(members)='array' and jsonb_array_length(members)<=100), created_at timestamptz not null default now()
);
create table public.signature_events (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 title text not null check(length(title) between 1 and 200), event_date date, description text not null default '',
 questions jsonb not null default '[]' check(jsonb_typeof(questions)='array' and jsonb_array_length(questions)<=10),
 status text not null default 'draft' check(status in ('draft','published','archived')), created_at timestamptz not null default now()
);
create table public.event_participants (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 event_id uuid not null references public.signature_events(id) on delete cascade,
 name text not null check(length(name) between 1 and 120), email text not null default '', group_name text not null default '',
 token text not null unique default encode(extensions.gen_random_bytes(32),'hex'),
 requests jsonb not null default '[]' check(jsonb_typeof(requests)='array' and jsonb_array_length(requests)<=5),
 answers jsonb not null default '{}', decline_reason text, viewed_at timestamptz, created_at timestamptz not null default now()
);
create index on public.signature_groups(owner_id);
create index on public.signature_events(owner_id,created_at desc);
create index on public.event_participants(owner_id,event_id);
create index on public.event_participants(event_id);
alter table public.signature_groups enable row level security;
alter table public.signature_events enable row level security;
alter table public.event_participants enable row level security;
revoke all on public.signature_groups,public.signature_events,public.event_participants from anon,authenticated;
grant select,insert,update,delete on public.signature_groups,public.signature_events,public.event_participants to authenticated;
create policy "group owner" on public.signature_groups for all to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy "event owner" on public.signature_events for all to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy "participant owner" on public.event_participants for all to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()) and exists(select 1 from public.signature_events e where e.id=event_id and e.owner_id=(select auth.uid())));
-- Prevent linking a participant to someone else's request even when its UUID is known.
create function public.validate_event_participant() returns trigger language plpgsql security invoker set search_path='' as $$
declare r jsonb;
begin
 for r in select value from jsonb_array_elements(new.requests) loop
  if not exists(select 1 from public.sign_requests s where s.id=(r->>'request_id')::uuid and s.owner_id=new.owner_id and s.token_hash=encode(extensions.digest(convert_to(r->>'token','UTF8'),'sha256'),'hex')) then raise exception 'Invalid request ownership'; end if;
 end loop;
 return new;
end;$$;
create trigger validate_event_participant before insert or update of requests,owner_id on public.event_participants for each row execute function public.validate_event_participant();
create schema if not exists signing_private;
revoke all on schema signing_private from public;
grant usage on schema signing_private to authenticated;
-- Bearer capability returns only one participant's forms, never the event roster.
create function signing_private.event_bundle(p_token text,p_answers jsonb default null,p_decline text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.event_participants; e public.signature_events; r jsonb; q jsonb; forms jsonb;
begin
 if auth.uid() is null or p_token is null or length(p_token)<>64 then raise exception 'Invalid link'; end if;
 select * into p from public.event_participants where token=p_token for update;
 if not found then raise exception 'Invalid link'; end if;
 select * into e from public.signature_events where id=p.event_id;
 if e.status<>'published' then raise exception 'Event unavailable'; end if;
 if exists(select 1 from jsonb_array_elements(p.requests) x join public.sign_requests s on s.id=(x->>'request_id')::uuid where s.status='pending' and s.expires_at<=now()) then raise exception 'Link expired'; end if;
 if p.decline_reason is not null then raise exception 'Request declined'; end if;
 if p_decline is not null then
  if length(trim(p_decline)) not between 1 and 1000 then raise exception 'A reason is required'; end if;
  if exists(select 1 from jsonb_array_elements(p.requests) x join public.sign_requests s on s.id=(x->>'request_id')::uuid where s.status='signed') then raise exception 'Cannot decline after signing'; end if;
  update public.event_participants set decline_reason=trim(p_decline),viewed_at=coalesce(viewed_at,now()) where id=p.id;
  update public.sign_requests set status='cancelled',updated_at=now() where id in(select (x->>'request_id')::uuid from jsonb_array_elements(p.requests) x) and status='pending';
  return jsonb_build_object('declined',true);
 end if;
 if p_answers is not null then
  if jsonb_typeof(p_answers)<>'object' or octet_length(p_answers::text)>20000 then raise exception 'Invalid answers'; end if;
  for q in select value from jsonb_array_elements(e.questions) loop
   if length(trim(coalesce(p_answers->>(q->>'id'),''))) not between 1 and 2000 then raise exception 'Answer all required questions'; end if;
  end loop;
  update public.event_participants set answers=p_answers where id=p.id;
  p.answers:=p_answers;
 end if;
 update public.event_participants set viewed_at=coalesce(viewed_at,now()) where id=p.id;
 select coalesce(jsonb_agg(jsonb_build_object('request_id',s.id,'title',s.title,'token',x.value->>'token','status',s.status,'signed_path',s.signed_path) order by ord),'[]') into forms from jsonb_array_elements(p.requests) with ordinality as x(value,ord) join public.sign_requests s on s.id=(x.value->>'request_id')::uuid;
 return jsonb_build_object('title',e.title,'description',e.description,'name',p.name,'questions',e.questions,'answers',p.answers,'forms',forms);
end;$$;
revoke all on function signing_private.event_bundle(text,jsonb,text) from public,anon;
grant execute on function signing_private.event_bundle(text,jsonb,text) to authenticated;
create function public.event_bundle(p_token text,p_answers jsonb default null,p_decline text default null) returns jsonb language sql security invoker set search_path='' as $$select signing_private.event_bundle(p_token,p_answers,p_decline)$$;
revoke all on function public.event_bundle(text,jsonb,text) from public,anon;
grant execute on function public.event_bundle(text,jsonb,text) to authenticated;
-- Required questions also apply to direct use of a child signing token.
create function public.check_event_answers() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.event_participants; q jsonb;
begin
 if new.status='signed' and old.status<>'signed' then
  select * into p from public.event_participants where requests @> jsonb_build_array(jsonb_build_object('request_id',new.id::text)) limit 1;
  if found then
   if p.decline_reason is not null or not exists(select 1 from public.signature_events e where e.id=p.event_id and e.status='published') then raise exception 'Event unavailable'; end if;
   for q in select value from public.signature_events e,jsonb_array_elements(e.questions) where e.id=p.event_id loop
    if length(trim(coalesce(p.answers->>(q->>'id'),'')))=0 then raise exception 'Required answers missing'; end if;
   end loop;
  end if;
 end if;
 return new;
end;$$;
revoke all on function public.check_event_answers() from public,anon,authenticated;
create trigger check_event_answers before update of status on public.sign_requests for each row execute function public.check_event_answers();
commit;
