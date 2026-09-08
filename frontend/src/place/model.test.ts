import { describe, expect, it } from 'vitest';
import { CATALOG_OBJECTS } from '../lib/catalog';
import { makeSpec } from '../lib/types';
import type { ItemGroup } from '../lib/state';
import { arrange, reconcile, validPlacement, specsForGroups, minHeight } from './model';
const bin=(id:string,w=2,h=3)=>makeSpec({id,name:id,kind:'bin',length_u:w,width_u:h,height_u:4});
describe('editable Place layout',()=>{
 it('rejects collisions, out of bounds and invalid rotations',()=>{
  const a={spec:bin('a'),col:0,row:0,rotated:false},b={spec:bin('b'),col:2,row:0,rotated:false};
  expect(validPlacement(a,[a,b],6,6)).toBe(true);
  expect(validPlacement({...a,col:1},[a,b],6,6)).toBe(false);
  expect(validPlacement({...a,col:-1},[a,b],6,6)).toBe(false);
  expect(validPlacement({...a,rotated:true},[a,b],6,6)).toBe(false);
 });
 it('keeps manual positions and per-bin height when an item is added',()=>{
  const a=bin('a'),b=bin('b');
  const old={placed:[{spec:{...a,height_u:6},col:4,row:3,rotated:true}],unplaced:[]};
  const next=reconcile([a,b],old,10,8,9);
  expect(next.placed.find(p=>p.spec.id==='a')).toMatchObject({col:4,row:3,rotated:true,spec:{height_u:6}});
  expect(next.placed).toHaveLength(2);
 });
 it('removes deleted bins and repairs positions after shrinking a drawer',()=>{
  const a=bin('a'),b=bin('b');const previous={placed:[{spec:a,col:8,row:6,rotated:false},{spec:b,col:0,row:0,rotated:false}],unplaced:[]};
  const next=reconcile([a],previous,4,4,8);
  expect(next.placed).toHaveLength(1);expect(next.placed[0].spec.id).toBe('a');expect(validPlacement(next.placed[0],next.placed,4,4)).toBe(true);
 });
 it('keeps overflow visible and never overlaps in auto arrange',()=>{
  const specs=Array.from({length:8},(_,i)=>bin(String(i),3,3));const l=arrange(specs,5,5);
  expect(l.placed.length+l.unplaced.length).toBe(8);expect(l.unplaced.length).toBeGreaterThan(0);
  l.placed.forEach(p=>expect(validPlacement(p,l.placed,5,5)).toBe(true));
 });
 it('assigns stable unique ids to repeated catalog groups',()=>{
  const obj=CATALOG_OBJECTS.find(o=>o.name.toLowerCase().includes('aa batter'))!;
  const groups:ItemGroup[]=['first','second'].map(id=>({id,mode:'catalog',objectId:obj.id,name:obj.name,count:12}));
  const a=specsForGroups(groups,70,11,9),b=specsForGroups(groups,70,11,9);
  expect(a.specs.length).toBeGreaterThan(1);expect(a.specs.map(s=>s.id)).toEqual(b.specs.map(s=>s.id));expect(new Set(a.specs.map(s=>s.id)).size).toBe(a.specs.length);
  const l=arrange(a.specs,11,9);l.placed.forEach(p=>expect(validPlacement(p,l.placed,11,9)).toBe(true));
 });
 it('preserves edited heights through auto arrange and respects pocket floors',()=>{
  const s={...bin('pocket'),kind:'cyl_pockets' as const,pocket_depth_mm:20,height_u:6};
  expect(minHeight(s)).toBe(4);const l=arrange([s],5,5);expect(l.placed[0].spec.height_u).toBe(6);
 });
 it('does not generate containers in an impossibly shallow drawer',()=>{
  const g:ItemGroup={id:'test',name:'Test',mode:'custom',count:1,lengthMm:20,widthMm:20,heightMm:5};
  expect(specsForGroups([g],10,5,5).specs).toHaveLength(0);
 });
});
