/// <reference types="node" />
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll,afterAll,it,expect } from 'vitest';
import { newDocument } from './document';
let db:PGlite;
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',unverified='33333333-3333-4333-8333-333333333333',drawer='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
async function as(user:string,query:string,params:unknown[]=[]){await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${user}',false)`);return db.query(query,params);}
beforeAll(async()=>{
 db=new PGlite();await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth,storage,public to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,owner_id text);
 alter table storage.objects enable row level security;grant select,insert,update,delete on storage.objects to authenticated,anon;
 create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name,'/') $$;
 `);
 await db.exec(readFileSync(new URL('../../../supabase/migrations/202609140001_accounts.sql',import.meta.url),'utf8'));
 await db.query(`insert into auth.users values ($1,now(),'{}'),($2,now(),'{}'),($3,null,'{}')`,[a,b,unverified]);
 await as(a,'insert into public.drawers(id,owner_id,name,document) values ($1,$2,$3,$4)',[drawer,a,'Untitled drawer',JSON.stringify(newDocument())]);
},30000);
afterAll(async()=>{await db?.close();});
it('denies anonymous access',async()=>{await db.exec('reset role;set role anon');await expect(db.query('select * from public.drawers')).rejects.toThrow(/permission denied/);});
it('allows the owner but hides rows from another account',async()=>{expect((await as(a,'select * from public.drawers')).rows).toHaveLength(1);expect((await as(b,'select * from public.drawers')).rows).toHaveLength(0);expect((await as(b,'delete from public.drawers returning id')).rows).toHaveLength(0);});
it('denies forged ownership and unverified account writes',async()=>{await expect(as(b,'insert into public.drawers(owner_id,name,document) values ($1,$2,$3)',[a,'Untitled drawer',JSON.stringify(newDocument())])).rejects.toThrow(/row-level security/);await expect(as(unverified,'insert into public.drawers(owner_id,name,document) values ($1,$2,$3)',[unverified,'Untitled drawer',JSON.stringify(newDocument())])).rejects.toThrow(/row-level security/);});
it('allows only own profile changes and blocks owner/revision forgery',async()=>{await as(a,"update profiles set display_name='Julian' where id=$1",[a]);expect((await as(b,'select * from profiles where id=$1',[a])).rows).toHaveLength(0);await expect(as(a,'update drawers set owner_id=$1 where id=$2',[b,drawer])).rejects.toThrow(/permission denied/);await expect(as(a,'update drawers set revision=999 where id=$1',[drawer])).rejects.toThrow(/permission denied/);});
it('increments revisions and rejects stale writes',async()=>{const doc={...newDocument(),name:'Desk'};const saved=await as(a,'update drawers set name=$1,document=$2 where id=$3 and revision=1 returning revision',['Desk',JSON.stringify(doc),drawer]);expect(saved.rows).toEqual([{revision:2}]);expect((await as(a,'update drawers set name=$1,document=$2 where id=$3 and revision=1 returning revision',['Desk',JSON.stringify(doc),drawer])).rows).toHaveLength(0);});
it('isolates photo reads, uploads, replacements and deletes',async()=>{const path=`${a}/${drawer}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png`;await as(a,"insert into storage.objects(bucket_id,name,owner_id) values ('drawer-photos',$1,$2)",[path,a]);expect((await as(b,'select * from storage.objects')).rows).toHaveLength(0);await expect(as(b,"insert into storage.objects(bucket_id,name,owner_id) values ('drawer-photos',$1,$2)",[path,b])).rejects.toThrow(/row-level security/);expect((await as(a,'update storage.objects set name=name returning id')).rows).toHaveLength(0);expect((await as(b,'delete from storage.objects returning id')).rows).toHaveLength(0);expect((await as(a,'select * from storage.objects')).rows).toHaveLength(1);});

it('rejects malformed documents and references to another user photo',async()=>{await expect(as(a,'insert into drawers(owner_id,name,document) values ($1,$2,$3)',[a,'Bad',JSON.stringify({version:1,name:'Bad'})])).rejects.toThrow(/check constraint/);await expect(as(a,'update drawers set photo_path=$1 where id=$2',[`${b}/${drawer}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png`,drawer])).rejects.toThrow(/check constraint/);expect((await as(unverified,'select * from profiles')).rows).toHaveLength(0);});
