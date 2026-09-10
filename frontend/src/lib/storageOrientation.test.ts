import { describe, expect, it } from 'vitest';
import { getCatalogObject } from './catalog';
import { specsForGroup } from './groupSpecs';
import { cloneGroup, newCatalogGroup, newCustomGroup, newStandardGroup } from './state';
import { arrange, reconcile, specsForGroups } from '../place/model';
const glue = (storageOrientation: 'flat' | 'vertical', count = 6) => ({ ...newCatalogGroup('glue_stick', 'Glue sticks'), storageOrientation, count });
describe('storage orientation', () => {
  it('keeps separate compartments for horizontal objects that require them', () => {
    const obj = getCatalogObject('glue_stick')!;
    for (const count of [1, 6, 60, 999]) {
      const made = specsForGroup(glue('flat', count), 9, 6);
      expect(made.length).toBeGreaterThan(0);
      expect(made.reduce((n,s)=>n+s.quantity*s.pocket_rows*s.pocket_cols,0)).toBeGreaterThanOrEqual(count);
      for (const s of made) {
        expect(s.kind).toBe('rect_pockets');
        expect(s.pocket_length_mm).toBeGreaterThanOrEqual(obj.geometry.length_mm!);
        expect(s.pocket_width_mm).toBeGreaterThanOrEqual(obj.geometry.diameter_mm!);
        expect(s.pocket_depth_mm).toBeGreaterThanOrEqual(obj.geometry.diameter_mm!);
      }
    }
  });
  it('preserves compartment intent for cutlery stored horizontally', () => {
    const made=specsForGroup({...newCatalogGroup('fork','Forks'),count:6,storageOrientation:'flat'},9,6);
    expect(made[0].kind).toBe('rect_pockets');
    expect(made.reduce((n,s)=>n+s.quantity*s.pocket_rows*s.pocket_cols,0)).toBeGreaterThanOrEqual(6);
  });
  it('requires clearance for the entire upright object and rejects impossible footprints', () => {
    const up = specsForGroup(glue('vertical'), 20, 6);
    expect(up[0].kind).toBe('cyl_pockets');
    expect(up.reduce((n,s) => n+s.quantity*s.pocket_rows*s.pocket_cols,0)).toBeGreaterThanOrEqual(6);
    expect(specsForGroup(glue('vertical'), 4, 6)).toEqual([]);
    expect(specsForGroup(glue('flat'), 9, 1)).toEqual([]);
  });
  it('supports custom objects and batteries, with duplicate and saved choices', () => {
    for (const g of [newCustomGroup('Remote'), newStandardGroup('batteryAA')]) {
      const flat = { ...g, storageOrientation: 'flat' as const };
      expect(specsForGroup(flat, 9, 6)[0].kind).toBe(g.mode === 'standard' ? 'rect_pockets' : 'bin');
      expect(cloneGroup(flat).storageOrientation).toBe('flat');
      expect(JSON.parse(JSON.stringify(flat)).storageOrientation).toBe('flat');
    }
  });
  it('updates placed geometry used for export after toggling', () => {
    const g = glue('vertical');
    const before = specsForGroups([g], 150, 12, 12);
    const after = specsForGroups([{ ...g, storageOrientation: 'flat' }], 150, 12, 12);
    const result = reconcile(after.specs, arrange(before.specs, 12, 12), 12, 12, after.maxHeight);
    expect(result.placed.length).toBeGreaterThan(0);
    expect(result.placed.every(p => p.spec.kind === 'rect_pockets' && p.spec.pocket_rows > 0)).toBe(true);
  });
});

describe('drawer roof clearance', () => {
  it('reserves 10 mm above the assembled container and refuses truncated horizontal objects', () => {
    const g = glue('flat');
    for (const depth of [20, 30, 50, 80, 150]) {
      const result = specsForGroups([g],depth,12,12);
      result.specs.forEach(s=>expect(s.height_u*7+5).toBeLessThanOrEqual(depth-10));
    }
    expect(specsForGroup(g,2,6)).toEqual([]);
  });
  it('checks the seated upright object, not just holder height', () => {
    const g = {...newStandardGroup('batteryAA'),storageOrientation:'vertical' as const};
    expect(specsForGroups([g],70,10,10).specs).toEqual([]);
    const result=specsForGroups([g],90,10,10);
    expect(result.specs.length).toBeGreaterThan(0);
    result.specs.forEach(s=>expect(s.height_u*7-s.pocket_depth_mm+50.5+5).toBeLessThanOrEqual(80));
  });
  it('limits manual holder height so protruding objects remain below the safe limit', () => {
    const g={...newStandardGroup('batteryAA'),storageOrientation:'vertical' as const};
    const result=specsForGroups([g],90,10,10);
    const s=result.specs[0];
    expect(result.heightLimits[s.id]*7-s.pocket_depth_mm+50.5+5).toBeLessThanOrEqual(80);
    const previous=arrange([{...s,height_u:20}],10,10);
    const fixed=reconcile(result.specs,previous,10,10,result.maxHeight,result.heightLimits);
    expect(fixed.placed[0].spec.height_u).toBeLessThanOrEqual(result.heightLimits[s.id]);
  });
  it('uses the required Object name on every generated and saved container', () => {
    const g={...glue('flat',999),name:'  Craft supplies  ',containerLabels:{'0:0':'Old label'}};
    const result=specsForGroups([g],100,12,12);
    expect(result.specs.length).toBeGreaterThan(1);
    expect(result.specs.every(s=>s.name==='Craft supplies')).toBe(true);
    const renamed=specsForGroups([{...g,name:'Glue sticks'}],100,12,12);
    expect(renamed.specs.every(s=>s.name==='Glue sticks')).toBe(true);
    const saved=JSON.parse(JSON.stringify(arrange(result.specs,12,12)));
    expect([...saved.placed.map((p:any)=>p.spec),...saved.unplaced].every((s:any)=>s.name==='Craft supplies')).toBe(true);
  });
  it('rejects blank and whitespace-only Object names', () => {
    for (const name of ['', '   ']) {
      const g={...glue('flat'),name};
      const result=specsForGroups([g],100,12,12);
      expect(result.specs).toEqual([]);
      expect(result.invalidNames).toEqual([g.id]);
    }
  });
});
