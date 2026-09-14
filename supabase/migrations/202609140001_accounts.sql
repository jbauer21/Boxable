begin;
-- All authorization derives from the authenticated subject, never user metadata.
create function public.boxable_verified() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from auth.users where id = (select auth.uid()) and email_confirmed_at is not null);
$$;
revoke all on function public.boxable_verified() from public;
grant execute on function public.boxable_verified() to authenticated;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
 created_at timestamptz not null default now()
);
create function public.boxable_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles(id,display_name) values(new.id,
  coalesce(nullif(left(btrim(new.raw_user_meta_data->>'display_name'),80),''),nullif(left(btrim(new.raw_user_meta_data->>'full_name'),80),''),'Your account'));
 return new;
end; $$;
revoke all on function public.boxable_profile() from public;
create trigger boxable_new_user after insert on auth.users for each row execute function public.boxable_profile();
insert into public.profiles(id,display_name) select id,coalesce(nullif(left(btrim(raw_user_meta_data->>'display_name'),80),''),nullif(left(btrim(raw_user_meta_data->>'full_name'),80),''),'Your account') from auth.users;
alter table public.profiles enable row level security;
revoke all on public.profiles from anon,authenticated;
grant select on public.profiles to authenticated;
grant update(display_name) on public.profiles to authenticated;
create policy profiles_read on public.profiles for select to authenticated using(id=(select auth.uid()) and (select public.boxable_verified()));
create policy profiles_update on public.profiles for update to authenticated using(id=(select auth.uid()) and (select public.boxable_verified())) with check(id=(select auth.uid()) and (select public.boxable_verified()));

create table public.drawers (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(char_length(btrim(name)) between 1 and 80 and name=btrim(name)),
 document jsonb not null check(coalesce(jsonb_typeof(document)='object' and document->>'version'='1' and jsonb_typeof(document->'drawer')='object' and jsonb_typeof(document->'groups')='array' and jsonb_typeof(document->'layout')='object' and octet_length(document::text)<=2097152,false)),
 photo_path text,
 revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(coalesce(document->>'name'=name,false)),
 check(photo_path is null or (split_part(photo_path,'/',1)=owner_id::text and split_part(photo_path,'/',2)=id::text and photo_path ~ '^[0-9a-f-]+/[0-9a-f-]+/[0-9a-f-]+[.](jpg|png|webp)$'))
);
create index drawers_owner_updated on public.drawers(owner_id,updated_at desc);
create function public.boxable_revision() returns trigger language plpgsql set search_path = '' as $$
begin
 if new.owner_id<>old.owner_id or new.id<>old.id then raise exception 'Drawer ownership cannot change'; end if;
 new.revision=old.revision+1;new.updated_at=now();new.created_at=old.created_at;
 return new;
end; $$;
revoke all on function public.boxable_revision() from public;
create trigger boxable_drawer_revision before update on public.drawers for each row execute function public.boxable_revision();
alter table public.drawers enable row level security;
revoke all on public.drawers from anon,authenticated;
grant select,delete on public.drawers to authenticated;
grant insert(id,owner_id,name,document) on public.drawers to authenticated;
grant update(name,document,photo_path) on public.drawers to authenticated;
create policy drawers_read on public.drawers for select to authenticated using(owner_id=(select auth.uid()) and (select public.boxable_verified()));
create policy drawers_insert on public.drawers for insert to authenticated with check(owner_id=(select auth.uid()) and (select public.boxable_verified()));
create policy drawers_update on public.drawers for update to authenticated using(owner_id=(select auth.uid()) and (select public.boxable_verified())) with check(owner_id=(select auth.uid()) and (select public.boxable_verified()));
create policy drawers_delete on public.drawers for delete to authenticated using(owner_id=(select auth.uid()) and (select public.boxable_verified()));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('drawer-photos','drawer-photos',false,10485760,array['image/jpeg','image/png','image/webp']);
create policy drawer_photos_read on storage.objects for select to authenticated using(
 bucket_id='drawer-photos' and (select public.boxable_verified()) and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.drawers d where d.id::text=(storage.foldername(storage.objects.name))[2] and d.owner_id=(select auth.uid()))
);
create policy drawer_photos_insert on storage.objects for insert to authenticated with check(
 bucket_id='drawer-photos' and (select public.boxable_verified()) and (storage.foldername(name))[1]=(select auth.uid())::text
 and name ~ '^[0-9a-f-]+/[0-9a-f-]+/[0-9a-f-]+[.](jpg|png|webp)$'
 and exists(select 1 from public.drawers d where d.id::text=(storage.foldername(storage.objects.name))[2] and d.owner_id=(select auth.uid()))
);
-- Immutable uploads: replacements use new object IDs. Owner cleanup also works after drawer deletion.
create policy drawer_photos_delete on storage.objects for delete to authenticated using(
 bucket_id='drawer-photos' and (select public.boxable_verified()) and (storage.foldername(name))[1]=(select auth.uid())::text
);
-- SELECT is also needed by the Storage API for post-delete cleanup.
create policy drawer_photos_cleanup_read on storage.objects for select to authenticated using(
 bucket_id='drawer-photos' and (select public.boxable_verified()) and (storage.foldername(name))[1]=(select auth.uid())::text and owner_id=(select auth.uid())::text
);
commit;
