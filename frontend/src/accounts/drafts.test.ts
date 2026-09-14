import 'fake-indexeddb/auto';
import { it,expect } from 'vitest';
import { readDraft,writeDraft } from './drafts';
import { newDocument } from './document';
it('keeps recovery drafts separated by account and deletes them on request',async()=>{
 const a={document:newDocument(),photo:null,id:null,revision:0,photoPath:null,dirty:true};
 await writeDraft('user:a',a);await writeDraft('guest',{...a,document:{...a.document,name:'Guest'}});
 expect((await readDraft('user:a'))?.document.name).toBe('Untitled drawer');expect(await readDraft('user:b')).toBeUndefined();await writeDraft('user:a',null);expect(await readDraft('user:a')).toBeUndefined();expect((await readDraft('guest'))?.document.name).toBe('Guest');await writeDraft('guest',null);
});
