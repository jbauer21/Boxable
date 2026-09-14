import { describe,it,expect } from 'vitest';
import { newDocument,parseDocument,serialize } from './document';
import { EMPTY_DRAWER,newCustomGroup } from '../lib/state';
import { makeSpec } from '../lib/types';
import { validatePhoto } from './client';
describe('saved drawer documents',()=>{
 it('round trips manual placements, rotation, heights and markers without browser objects',()=>{
  const group=newCustomGroup('Pens'),spec=makeSpec({id:`${group.id}:0:0`,name:'Pens',kind:'bin',length_u:2,width_u:1,height_u:6});
  const doc=serialize('Desk',2,{...EMPTY_DRAWER,widthMm:420,heightMm:420,photoUrl:'blob:temporary',topLeft:[[0,0],[100,0],[100,100],[0,100]]},[group],{placed:[{spec,col:3,row:4,rotated:true}],unplaced:[]},84);
  expect(parseDocument(JSON.parse(JSON.stringify(doc)))).toEqual(doc);expect(doc.layout.placed[0]).toMatchObject({col:3,row:4,rotated:true,spec:{height_u:6}});expect(doc.usableHeightMm).toBe(84);expect(doc.drawer).not.toHaveProperty('photoUrl');expect(doc.drawer).not.toHaveProperty('photoFile');
 });
 it.each([{version:2},{groups:[{mode:'unknown'}]},{layout:{placed:[{col:-1}],unplaced:[]}},{name:' '},{drawer:{widthMm:Infinity}}])('rejects invalid documents: %j',patch=>{expect(()=>parseDocument({...newDocument(),...patch})).toThrow();});
 it('accepts an unfinished measurement draft',()=>expect(parseDocument(newDocument())).toEqual(newDocument()));
 it('rejects executable formats and oversized photos',()=>{expect(()=>validatePhoto(new Blob(['<svg/>'],{type:'image/svg+xml'}))).toThrow();expect(()=>validatePhoto(new Blob([new Uint8Array(10485761)],{type:'image/png'}))).toThrow();expect(()=>validatePhoto(new Blob(['image'],{type:'image/webp'}))).not.toThrow();});
});
