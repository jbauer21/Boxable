import { describe, expect, it } from 'vitest';
import { CATALOG_OBJECTS, getCatalogObject } from './catalog';
import { specsForGroup } from './groupSpecs';
import { cloneGroup, newCatalogGroup, newCustomGroup, newStandardGroup } from './state';
import { arrange, reconcile, specsForGroups } from '../place/model';
import { binInteriorVolumeMm3 } from './catalogSpecs';
import { newDocument, parseDocument } from '../accounts/document';
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

describe('drawer height limits', () => {
  it('keeps assembled containers within the drawer depth and refuses truncated horizontal objects', () => {
    const g = glue('flat');
    for (const depth of [20, 30, 50, 80, 150]) {
      const result = specsForGroups([g],depth,12,12);
      result.specs.forEach(s=>expect(s.height_u*7+5).toBeLessThanOrEqual(depth));
    }
    expect(specsForGroup(g,2,6)).toEqual([]);
  });
  it('checks the seated upright object, not just holder height', () => {
    const g = {...newStandardGroup('batteryAA'),storageOrientation:'vertical' as const};
    expect(specsForGroups([g],55,10,10).specs).toEqual([]);
    const result=specsForGroups([g],90,10,10);
    expect(result.specs.length).toBeGreaterThan(0);
    result.specs.forEach(s=>expect(s.height_u*7-s.pocket_depth_mm+50.5+5).toBeLessThanOrEqual(90));
  });
  it('limits manual holder height so protruding objects remain below the drawer ceiling', () => {
    const g={...newStandardGroup('batteryAA'),storageOrientation:'vertical' as const};
    const result=specsForGroups([g],90,10,10);
    const s=result.specs[0];
    expect(result.heightLimits[s.id]*7-s.pocket_depth_mm+50.5+5).toBeLessThanOrEqual(90);
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

describe('open storage', () => {
  it('sizes one undivided bin for pens lying flat and grows with quantity', () => {
    const obj = getCatalogObject('pen_standard')!;
    const volumes: number[] = [];
    for (const count of [1, 10, 50]) {
      const made = specsForGroup({...newCatalogGroup(obj.id, 'Pens'), count, storageOrientation: 'open'}, 9, 6);
      expect(made).toHaveLength(1);
      const s = made[0];
      expect(s).toMatchObject({kind: 'bin', quantity: 1, length_div: 0, width_div: 0, pocket_rows: 0, pocket_cols: 0});
      const volume = binInteriorVolumeMm3(s.length_u, s.width_u, s.height_u);
      expect(volume).toBeGreaterThanOrEqual(count * obj.geometry.average_volume_mm3 / obj.storage.packing_factor);
      expect(s.width_u * 42 - 8).toBeGreaterThanOrEqual(obj.geometry.bounding_box_mm!.x);
      volumes.push(volume);
    }
    expect(volumes[1]).toBeGreaterThan(volumes[0]);
    expect(volumes[2]).toBeGreaterThan(volumes[1]);
  });
  it('supports every catalog sizing mode as well as batteries and custom objects', () => {
    for (const obj of CATALOG_OBJECTS) {
      const made = specsForGroup({...newCatalogGroup(obj.id, obj.name), storageOrientation: 'open'}, 20, 6);
      // Oversized objects may be rejected, but must never fall back to fitted holders.
      expect(made.every(s => s.kind === 'bin' && s.length_div === 0 && s.width_div === 0)).toBe(true);
    }
    for (const g of [newCatalogGroup('paper_clip', 'Clips'), newCatalogGroup('cable_spool_generic', 'Spool'), newStandardGroup('batteryAA'), newCustomGroup()]) {
      expect(specsForGroup({...g, storageOrientation: 'open'}, 20, 6)[0].kind).toBe('bin');
    }
  });
  it('splits overflow by whole-item capacity and respects size limits', () => {
    const g = {...newCustomGroup(), mode: 'custom' as const, lengthMm: 30, widthMm: 20, heightMm: 10, count: 999, storageOrientation: 'open' as const};
    const made = specsForGroup(g, 4, 2);
    expect(made[0].quantity).toBeGreaterThan(1);
    const s = made[0];
    expect(s.quantity * Math.floor(binInteriorVolumeMm3(s.length_u, s.width_u, s.height_u) / 6000)).toBeGreaterThanOrEqual(999);
    expect(s.height_u).toBeLessThanOrEqual(4);
    expect(specsForGroup({...g, lengthMm: 300}, 4, 6)).toEqual([]);
    expect(specsForGroup(g, 2, 6)).toEqual([]);
  });
  it('preserves Open through duplication, saved documents, placement and export', () => {
    const g = {...newCatalogGroup('pen_standard', 'Pens'), count: 10, storageOrientation: 'open' as const};
    expect(cloneGroup(g).storageOrientation).toBe('open');
    expect(parseDocument({...newDocument(), groups: [g]}).groups[0].storageOrientation).toBe('open');
    const result = specsForGroups([g], 80, 12, 12);
    const layout = arrange(result.specs, 12, 12);
    expect(layout.placed).toHaveLength(1);
    expect(JSON.parse(JSON.stringify(layout)).placed[0].spec.kind).toBe('bin');
  });
});
