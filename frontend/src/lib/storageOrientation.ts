import { getCatalogObject } from './catalog';
import { binInteriorVolumeMm3, BIN_FLOOR_MM, BIN_WALL_MM } from './catalogSpecs';
import { CELL_SIZES, pocketDepthForUpright, pocketHolders } from './itemCatalog';
import type { ItemGroup } from './state';
import { makeSpec, type ContainerSpec } from './types';

/** Only offer orientation when real object dimensions are available. */
export function storageDimensions(group: ItemGroup) {
  if (group.mode === 'custom') return { dims: [group.lengthMm, group.widthMm, group.heightMm], round: false, clearance: 1 };
  if (group.mode === 'standard') {
    const cell = group.type === 'customCell'
      ? { diameter: group.customCell.diameterMm, length: group.customCell.lengthMm }
      : CELL_SIZES[group.type];
    return cell ? { dims: [cell.diameter, cell.diameter, cell.length], round: true, clearance: 1 } : null;
  }
  const obj = getCatalogObject(group.objectId);
  if (!obj || ['spool_geometry', 'nested_stack_footprint', 'stacked_rectangular_footprint', 'stacked_round_footprint', 'bulk_volume', 'small_part_compartments'].includes(obj.generation.sizing_mode)) return null;
  const g = obj.geometry;
  if (g.diameter_mm && g.length_mm) return { dims: [g.diameter_mm, g.diameter_mm, g.length_mm], round: true, clearance: obj.storage.clearance_mm };
  const b = g.bounding_box_mm;
  return b ? { dims: [b.x, b.y, b.z], round: false, clearance: obj.storage.clearance_mm } : null;
}

export function orientedGroupSpecs(group: ItemGroup, maxHeightU: number, maxFootprintU: number): ContainerSpec[] {
  if (group.storageOrientation === 'open') return openGroupSpecs(group, maxHeightU, maxFootprintU);
  const shape = storageDimensions(group);
  if (!shape || !shape.dims.every(d => Number.isFinite(d) && d > 0) || maxHeightU < 2) return [];
  const [thin, middle, long] = [...shape.dims].sort((a, b) => a - b);
  const cap = Math.min(6, Math.floor(maxFootprintU));
  const count = Math.max(1, Math.ceil(group.count));
  if (group.storageOrientation === 'vertical') {
    // Check the whole item, including the portion protruding above its holder.
    const extent = shape.round ? shape.dims[2] : long;
    if (extent + BIN_FLOOR_MM > maxHeightU * 7) return [];
    return pocketHolders(group.name, shape.round ? 'cyl_pockets' : 'rect_pockets', count,
      (shape.round ? shape.dims[0] : middle) + shape.clearance,
      (shape.round ? shape.dims[1] : thin) + shape.clearance,
      pocketDepthForUpright(extent), maxHeightU, cap).filter(s => s.height_u * 7 - s.pocket_depth_mm + extent <= maxHeightU * 7);
  }
  const obj = group.mode === 'catalog' ? getCatalogObject(group.objectId) : null;
  const needsCompartments = group.mode === 'standard' || (obj && (['cylindrical_pockets', 'hex_pockets', 'rectangular_pockets'].includes(obj.generation.backend_generator) || obj.generation.sizing_mode === 'generic_divisions'));
  if (needsCompartments) {
    const extent = shape.round ? shape.dims[0] : thin;
    return pocketHolders(group.name, 'rect_pockets', count,
      (shape.round ? shape.dims[2] : long) + shape.clearance,
      (shape.round ? shape.dims[0] : middle) + shape.clearance,
      extent, maxHeightU, cap).filter(s => s.pocket_depth_mm >= extent);
  }
  // One layer of whole items in a shared open bin. Discrete capacity avoids
  // volume-only estimates that can claim several long objects fit when they cannot.
  const itemL = (shape.round ? shape.dims[2] : long) + shape.clearance;
  const itemW = (shape.round ? shape.dims[0] : middle) + shape.clearance;
  const height = Math.max(2, Math.ceil(((shape.round ? shape.dims[0] : thin) + BIN_FLOOR_MM) / 7));
  if (height > maxHeightU) return [];
  let best: { l: number; w: number; bins: number; area: number } | null = null;
  for (let l = 1; l <= cap; l++) for (let w = l; w <= cap; w++) {
    const x = l * 42 - 2 * BIN_WALL_MM, y = w * 42 - 2 * BIN_WALL_MM;
    const capacity = Math.max(Math.floor(x / itemL) * Math.floor(y / itemW), Math.floor(y / itemL) * Math.floor(x / itemW));
    if (!capacity) continue;
    const bins = Math.ceil(count / capacity), area = bins * l * w;
    if (!best || area < best.area || (area === best.area && bins < best.bins)) best = { l, w, bins, area };
  }
  return best ? [makeSpec({ name: group.name, kind: 'bin', length_u: best.l, width_u: best.w, height_u: height, quantity: best.bins })] : [];
}

/** Shared loose storage: fit each item lying flat and reserve volume for every whole item. */
function openGroupSpecs(group: ItemGroup, maxHeightU: number, maxFootprintU: number): ContainerSpec[] {
  const obj = group.mode === 'catalog' ? getCatalogObject(group.objectId) : null;
  let shape = storageDimensions(group);
  if (obj && !shape) {
    const g = obj.geometry;
    const b = g.bounding_box_mm;
    const side = Math.cbrt(g.average_volume_mm3);
    shape = { dims: b ? [b.x, b.y, b.z] : g.diameter_mm && g.length_mm
      ? [g.diameter_mm, g.diameter_mm, g.length_mm] : [side, side, side],
      round: false, clearance: obj.storage.clearance_mm };
  }
  if (!shape || !shape.dims.every(d => Number.isFinite(d) && d > 0) || !Number.isFinite(group.count)) return [];
  const [thin, middle, long] = [...shape.dims].sort((a, b) => a - b);
  const volume = obj ? obj.geometry.average_volume_mm3 / Math.max(0.05, obj.storage.packing_factor)
    : shape.dims.reduce((a, b) => a * b, 1);
  if (!Number.isFinite(volume) || volume <= 0) return [];
  const count = Math.max(1, Math.ceil(group.count));
  const cap = Math.min(6, Math.floor(maxFootprintU));
  let best: { l: number; w: number; h: number; bins: number; volume: number } | null = null;
  for (let l = 1; l <= cap; l++) for (let w = l; w <= cap; w++) {
    if (l * 42 - 2 * BIN_WALL_MM < middle + shape.clearance || w * 42 - 2 * BIN_WALL_MM < long + shape.clearance) continue;
    for (let h = 2; h <= Math.min(20, Math.floor(maxHeightU)); h++) {
      if (h * 7 - BIN_FLOOR_MM < thin) continue;
      const capacity = Math.floor(binInteriorVolumeMm3(l, w, h) / volume);
      if (!capacity) continue;
      const bins = Math.ceil(count / capacity), totalVolume = bins * l * w * h;
      // Keep the collection together whenever possible; prefer compact, shallow bins.
      if (!best || bins < best.bins || (bins === best.bins && (totalVolume < best.volume || (totalVolume === best.volume && h < best.h)))) {
        best = { l, w, h, bins, volume: totalVolume };
      }
    }
  }
  return best ? [makeSpec({ name: group.name, kind: 'bin', length_u: best.l, width_u: best.w, height_u: best.h, quantity: best.bins })] : [];
}
