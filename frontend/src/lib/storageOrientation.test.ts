import { describe, expect, it } from 'vitest';
import { getCatalogObject } from './catalog';
import { specsForGroup } from './groupSpecs';
import { cloneGroup, newCatalogGroup, newCustomGroup, newStandardGroup } from './state';
import { arrange, reconcile, specsForGroups } from '../place/model';
const glue = (storageOrientation: 'flat' | 'vertical', count = 6) => ({ ...newCatalogGroup('glue_stick', 'Glue sticks'), storageOrientation, count });
describe('storage orientation', () => {
  it('fits every whole glue stick in an undivided flat bin', () => {
    const obj = getCatalogObject('glue_stick')!;
    const { diameter_mm: diameter, length_mm: length } = obj.geometry;
    for (const count of [1, 6, 60, 999]) {
      const made = specsForGroup(glue('flat', count), 9, 6);
      expect(made.length).toBeGreaterThan(0);
      let capacity = 0;
      for (const s of made) {
        expect(s.kind).toBe('bin');
        expect(s.length_div + s.width_div + s.pocket_rows + s.pocket_cols).toBe(0);
        expect(s.height_u * 7 - 8).toBeGreaterThanOrEqual(diameter!);
        const x = s.length_u * 42 - 8, y = s.width_u * 42 - 8;
        const l = length! + obj.storage.clearance_mm, w = diameter! + obj.storage.clearance_mm;
        capacity += s.quantity * Math.max(Math.floor(x/l)*Math.floor(y/w), Math.floor(y/l)*Math.floor(x/w));
      }
      expect(capacity).toBeGreaterThanOrEqual(count);
    }
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
      expect(specsForGroup(flat, 9, 6)[0].kind).toBe('bin');
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
    expect(result.placed.every(p => p.spec.kind === 'bin' && p.spec.pocket_rows === 0)).toBe(true);
  });
});
