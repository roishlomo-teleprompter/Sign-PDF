-- Run against a reviewed installed events schema. All fixtures are rolled back.
begin;
insert into auth.users(id) values ('e23f2fd3-d5de-4d74-8f58-47cb5c129001'),('e23f2fd3-d5de-4d74-8f58-47cb5c129002');
set local request.jwt.claim.sub='e23f2fd3-d5de-4d74-8f58-47cb5c129001';
set local role authenticated;
do $test$
declare ev uuid; rp record; bundle jsonb; tok text; rejected boolean:=false;
begin
 insert into public.signature_events(title,questions,status) values ('ROLLBACK TEST','[{"id":"q0","label":"Required"}]','published') returning id into ev;
 select * into rp from public.create_sign_request('test.pdf',now()+interval '1 day');
 insert into public.event_participants(event_id,name,requests) values(ev,'TEST',jsonb_build_array(jsonb_build_object('request_id',rp.request_id::text,'token',rp.signing_token))) returning token into tok;
 bundle:=public.event_bundle(tok);
 if jsonb_array_length(bundle->'forms')<>1 then raise exception 'Manifest forms missing'; end if;
 begin perform public.event_bundle(tok,'{}'); exception when others then rejected:=true; end;
 if not rejected then raise exception 'Missing required answer accepted'; end if;
 bundle:=public.event_bundle(tok,'{"q0":"answer"}');
 if bundle->'answers'->>'q0'<>'answer' then raise exception 'Answer not persisted'; end if;
 perform set_config('request.jwt.claim.sub','e23f2fd3-d5de-4d74-8f58-47cb5c129002',true);
 if exists(select 1 from public.signature_events where id=ev) then raise exception 'Owner isolation failed'; end if;
 if exists(select 1 from public.event_participants where token=tok) then raise exception 'Participant RLS failed'; end if;
 bundle:=public.event_bundle(tok);
 if bundle->>'name'<>'TEST' then raise exception 'Bearer access from another device failed'; end if;
 bundle:=public.event_bundle(tok,null,'Declined by test');
 if bundle->>'declined'<>'true' then raise exception 'Decline failed'; end if;
 rejected:=false;
 begin perform public.event_bundle(tok); exception when others then rejected:=true; end;
 if not rejected then raise exception 'Declined link still active'; end if;
end;$test$;
reset role;
select 'PASS: manifest, required answers, owner isolation, cross-device link, decline and closed link' as integration_result;
rollback;
