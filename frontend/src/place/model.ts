import { storageDimensions } from '../lib/storageOrientation';
import { specsForGroup } from '../lib/groupSpecs';
import { packContainers } from '../lib/containerPacker';
import { placedCols, placedRows, type ContainerSpec, type PlacedContainer } from '../lib/types';
import type { ItemGroup } from '../lib/state';

export interface Layout { placed: PlacedContainer[]; unplaced: ContainerSpec[] }
export const COLORS = ['#c6b6ff', '#c2f24a', '#ffb5c7', '#a8d9f0', '#f7d58b', '#b2dec7'];
export const groupId = (id: string) => id.split(':')[0];
export const colorFor = (id: string) => COLORS[[...groupId(id)].reduce((n,c) => n+c.charCodeAt(0),0)%COLORS.length];
export const ROOF_CLEARANCE_MM = 10;
export const BASE_ALLOWANCE_MM = 5;
export function specsForGroups(groups: ItemGroup[], depth: number, cols: number, rows: number) {
  const maxHeight = Math.min(20, Math.floor((depth - BASE_ALLOWANCE_MM - ROOF_CLEARANCE_MM) / 7));
  const maxFootprint = Math.max(1, Math.min(6, Math.max(cols, rows)));
  const specs: ContainerSpec[] = [], skipped: string[] = [];
  const heightLimits: Record<string,number> = {};
  const invalidNames: string[] = [];
  for (const g of groups) {
    if (!g.name.trim()) { invalidNames.push(g.id); continue; }
    if (maxHeight < 2) { skipped.push(g.name); continue; }
    const shape = storageDimensions(g);
    const oriented = shape ? {...g, storageOrientation: g.storageOrientation ?? 'flat' as const} : g;
    const made = specsForGroup(oriented,maxHeight,maxFootprint).filter(s => s.height_u <= maxHeight);
    if (!made.length) skipped.push(g.name);
    made.forEach((s,i) => { for (let j=0;j<s.quantity;j++) specs.push({...s,name:g.name.trim(),id:`${g.id}:${i}:${j}`,quantity:1}); });
  }
  for (const spec of specs) {
    const g=groups.find(g=>g.id===groupId(spec.id))!;
    const shape=storageDimensions(g);
    const extent=shape ? (shape.round ? shape.dims[g.storageOrientation==='vertical'?2:0] : g.storageOrientation==='vertical' ? Math.max(...shape.dims) : Math.min(...shape.dims)) : 0;
    const protrusion=spec.kind==='bin'||spec.kind==='spool' ? 0 : Math.max(0,extent-spec.pocket_depth_mm);
    heightLimits[spec.id]=Math.floor((maxHeight*7-protrusion)/7);
  }
  return {specs, skipped, maxHeight, heightLimits, invalidNames};
}
export function validPlacement(p: PlacedContainer, all: PlacedContainer[], cols: number, rows: number) {
  const w=placedCols(p),h=placedRows(p);
  return Number.isInteger(p.col)&&Number.isInteger(p.row)&&p.col>=0&&p.row>=0&&p.col+w<=cols&&p.row+h<=rows
    && !all.some(a => a.spec.id!==p.spec.id && p.col<a.col+placedCols(a)&&p.col+w>a.col&&p.row<a.row+placedRows(a)&&p.row+h>a.row);
}
export function findSpace(spec: ContainerSpec, placed: PlacedContainer[], cols: number, rows: number): PlacedContainer | null {
  for (let row=0;row<rows;row++) for(let col=0;col<cols;col++) for(const rotated of [false,true]) {
    const p={spec,col,row,rotated}; if (validPlacement(p,placed,cols,rows)) return p;
  }
  return null;
}
export function minHeight(spec: ContainerSpec) {
  return Math.max(2, Math.ceil((spec.pocket_depth_mm+8)/7));
}
export function reconcile(specs: ContainerSpec[], previous: Layout, cols: number, rows: number, maxHeight: number, heightLimits: Record<string,number> = {}): Layout {
  const placed: PlacedContainer[]=[], pending: ContainerSpec[]=[];
  const old=new Map([...previous.placed.map(p=>[p.spec.id,p.spec] as const),...previous.unplaced.map(s=>[s.id,s] as const)]);
  for (const raw of specs) {
    const before=old.get(raw.id);
    const unchanged=before&&before.length_u===raw.length_u&&before.width_u===raw.width_u&&before.kind===raw.kind;
    const spec=unchanged?{...raw,height_u:Math.max(minHeight(raw),raw.height_u,Math.min(heightLimits[raw.id]??maxHeight,before.height_u))}:raw;
    const was=previous.placed.find(p=>p.spec.id===spec.id);
    const p=was?{...was,spec}:null;
    if(p&&validPlacement(p,placed,cols,rows)) placed.push(p); else pending.push(spec);
  }
  const unplaced: ContainerSpec[]=[];
  for (const spec of pending) { const p=findSpace(spec,placed,cols,rows); if(p)placed.push(p);else unplaced.push(spec); }
  return {placed,unplaced};
}
function score(l: Layout) {
  const area=l.placed.reduce((n,p)=>n+placedCols(p)*placedRows(p),0);
  const right=Math.max(0,...l.placed.map(p=>p.col+placedCols(p))),bottom=Math.max(0,...l.placed.map(p=>p.row+placedRows(p)));
  return [l.unplaced.length,right*bottom-area,bottom,right];
}
function better(a: Layout,b: Layout) {const x=score(a),y=score(b);for(let i=0;i<x.length;i++){if(x[i]!==y[i])return x[i]<y[i];}return false;}
export function arrange(specs: ContainerSpec[],cols: number,rows: number,current?: Layout): Layout {
  let best=packContainers(specs,cols,rows);
  const orderings=[specs,[...specs].sort((a,b)=>b.length_u*b.width_u-a.length_u*a.width_u),[...specs].sort((a,b)=>Math.max(b.length_u,b.width_u)-Math.max(a.length_u,a.width_u)),[...specs].sort((a,b)=>b.width_u-a.width_u)];
  for(const ordering of orderings) {
    const candidate: Layout={placed:[],unplaced:[]};
    for(const spec of ordering){const p=findSpace(spec,candidate.placed,cols,rows);if(p)candidate.placed.push(p);else candidate.unplaced.push(spec);}
    if(better(candidate,best))best=candidate;
  }
  if(current&&current.placed.every(p=>validPlacement(p,current.placed,cols,rows))&&better(current,best))return current;
  return best;
}
export function downloadJSON(value: unknown) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='boxable-drawer-plan.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
