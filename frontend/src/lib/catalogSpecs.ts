/**
 * Turns a catalog object + count into container specs.
 *
 * Since catalog v0.2.0 every object carries a `generation` block naming the
 * backend generator it must resolve to (divided_bin / cylindrical_pockets /
 * hex_pockets / rectangular_pockets / spool) and a `sizing_mode` describing
 * how that generator should be sized. This module dispatches on those fields;
 * the semantic strategy in `storage` is kept for search/UX only.
 */
import { getCatalogObject, type CatalogBoundingBox, type CatalogObject } from "./catalog";
import {
  CELL_GRIP_MM,
  HEIGHT_UNIT_MM,
  POCKET_FLOOR_MM,
  SCANNED_CLEARANCE_MM,
  UNIT_MM,
  bestOrientation,
  pocketDepthForUpright,
  pocketHolders,
} from "./itemCatalog";
import { makeSpec, type ContainerSpec } from "./types";

/** Approximate gridfinity bin interior margins for volume-based sizing. */
export const BIN_WALL_MM = 4;
export const BIN_FLOOR_MM = 8;

export function binInteriorVolumeMm3(lengthU: number, widthU: number, heightU: number): number {
  const x = lengthU * UNIT_MM - 2 * BIN_WALL_MM;
  const y = widthU * UNIT_MM - 2 * BIN_WALL_MM;
  const z = heightU * HEIGHT_UNIT_MM - BIN_FLOOR_MM;
  return Math.max(0, x) * Math.max(0, y) * Math.max(0, z);
}

/** Effective bounding box: explicit, from cylinder dims, or a volume-derived cube. */
function boundingBox(obj: CatalogObject): CatalogBoundingBox {
  const g = obj.geometry;
  if (g.bounding_box_mm) return g.bounding_box_mm;
  if (g.diameter_mm && g.length_mm) {
    return { x: g.diameter_mm, y: g.diameter_mm, z: g.length_mm };
  }
  const side = Math.cbrt(Math.max(1, g.average_volume_mm3));
  return { x: side, y: side, z: side };
}

function sortedDims(b: CatalogBoundingBox): [number, number, number] {
  const dims = [b.x, b.y, b.z].sort((a, c) => a - c);
  return [dims[0], dims[1], dims[2]]; // [thinnest, middle, longest]
}

function fitsHeight(pocketDepthMm: number, heightCap: number): boolean {
  const requiredU = Math.ceil((pocketDepthMm + POCKET_FLOOR_MM) / HEIGHT_UNIT_MM);
  return Math.max(2, requiredU) <= heightCap;
}

export function specsForCatalogGroup(
  objectId: string,
  count: number,
  maxHeightU: number,
  maxFootprintU: number,
): ContainerSpec[] {
  const obj = getCatalogObject(objectId);
  if (!obj) return [];
  const n = Math.max(1, count);
  const heightCap = Math.max(2, maxHeightU);
  const footprintCap = Math.max(1, Math.min(maxFootprintU, 6));

  switch (obj.generation.sizing_mode) {
    case "cylindrical_array":
    case "bit_hole_array":
    case "socket_array":
      return cylindricalArraySpecs(obj, n, heightCap, footprintCap, "cyl_pockets");
    case "hexagonal_array":
      return cylindricalArraySpecs(obj, n, heightCap, footprintCap, "hex_pockets");
    case "thin_rectangular_array":
      return cardSlotSpecs(obj, n, heightCap, footprintCap);
    case "elongated_rectangular_pocket":
    case "shared_rectangular_pocket":
      return channelSpecs(obj, n, heightCap, footprintCap);
    case "bulk_volume":
      return bulkBinSpecs(obj, n, heightCap, footprintCap, { scoops: true });
    case "small_part_compartments":
      return bulkBinSpecs(obj, n, heightCap, footprintCap, { scoops: true, sections: true });
    case "generic_divisions":
      return trayBinSpecs(obj, n, heightCap, footprintCap);
    case "spool_geometry":
      return spoolSpecs(obj, n, heightCap, footprintCap);
    case "nested_stack_footprint":
      return nestedStackSpecs(obj, n, heightCap, footprintCap);
    case "stacked_rectangular_footprint":
      return horizontalStackSpecs(obj, n, heightCap, footprintCap);
    case "stacked_round_footprint":
      return roundStackSpecs(obj, n, heightCap, footprintCap);
    case "bounding_box":
      return boundingBoxPockets(obj, n, heightCap, footprintCap);
    default:
      return specsByGenerator(obj, n, heightCap, footprintCap);
  }
}

/** Safety net for sizing modes added to the catalog before this code knows them. */
function specsByGenerator(
  obj: CatalogObject,
  n: number,
  heightCap: number,
  footprintCap: number,
): ContainerSpec[] {
  switch (obj.generation.backend_generator) {
    case "cylindrical_pockets":
      return cylindricalArraySpecs(obj, n, heightCap, footprintCap, "cyl_pockets");
    case "hex_pockets":
      return cylindricalArraySpecs(obj, n, heightCap, footprintCap, "hex_pockets");
    case "divided_bin":
      return bulkBinSpecs(obj, n, heightCap, footprintCap, { scoops: true });
    case "spool":
      return spoolSpecs(obj, n, heightCap, footprintCap);
    case "rectangular_pockets":
      return boundingBoxPockets(obj, n, heightCap, footprintCap);
  }
}

/**
 * One round (or hex) hole per item. Uses explicit diameter/length when the
 * catalog has them; otherwise the bounding box cross-section (middle dim)
 * is the hole size and the longest dim is the upright extent.
 */
function cylindricalArraySpecs(
  obj: CatalogObject,
  n: number,
  heightCap: number,
  footprintCap: number,
  kind: "cyl_pockets" | "hex_pockets",
): ContainerSpec[] {
  const g = obj.geometry;
  const clearance = obj.storage.clearance_mm;
  let diameter: number;
  let uprightExtent: number;
  if (g.diameter_mm && g.length_mm) {
    diameter = g.diameter_mm;
    uprightExtent = g.length_mm;
  } else {
    const [, middle, longest] = sortedDims(boundingBox(obj));
    diameter = middle;
    uprightExtent = longest;
  }
  return pocketHolders(
    obj.name,
    kind,
    n,
    diameter + clearance,
    diameter + clearance,
    Math.max(10, uprightExtent - CELL_GRIP_MM),
    heightCap,
    footprintCap,
  );
}

/** Thin indexed slots (SD cards, cartridges): items stand on edge, one per slot. */
function cardSlotSpecs(
  obj: CatalogObject,
  n: number,
  heightCap: number,
  footprintCap: number,
): ContainerSpec[] {
  const clearance = obj.storage.clearance_mm;
  const [thinnest, middle, longest] = sortedDims(boundingBox(obj));
  return pocketHolders(
    obj.name,
    "rect_pockets",
    n,
    longest + clearance,
    thinnest + clearance,
    pocketDepthForUpright(middle),
    heightCap,
    footprintCap,
  );
}

/** One rect/cyl pocket per counted unit, orientation chosen to fit the drawer. */
function boundingBoxPockets(
  obj: CatalogObject,
  pocketCount: number,
  heightCap: number,
  footprintCap: number,
): ContainerSpec[] {
  const b = boundingBox(obj);
  const orientation = bestOrientation(
    { kind: "box", length: b.x, width: b.y, height: b.z },
    heightCap,
    footprintCap,
  );
  if (!orientation) return [];
  const extra = Math.max(0, obj.storage.clearance_mm - SCANNED_CLEARANCE_MM);
  return pocketHolders(
    obj.name,
    orientation.kind,
    pocketCount,
    orientation.pocketSizeXMm + extra,
    orientation.pocketSizeYMm + extra,
    orientation.pocketDepthMm,
    heightCap,
    footprintCap,
  );
}

/**
 * Long items in channels. Bundled quantities share one channel whose
 * cross-section is scaled by count / packing factor; individual quantities
 * get one channel each.
 */
function channelSpecs(
  obj: CatalogObject,
  n: number,
  heightCap: number,
  footprintCap: number,
): ContainerSpec[] {
  const clearance = obj.storage.clearance_mm;
  const [thinnest, middle, longest] = sortedDims(boundingBox(obj));
  const mode = obj.storage.quantity_mode;

  if (mode === "bundle" || mode === "bulk") {
    const packing = Math.max(0.05, obj.storage.packing_factor);
    const crossArea = (n * middle * thinnest) / packing;
    const side = Math.max(Math.sqrt(crossArea), middle);
    return pocketHolders(
      obj.name,
      "rect_pockets",
      1,
      longest + clearance,
      side + clearance,
      side,
      heightCap,
      footprintCap,
    );
  }

  return pocketHolders(
    obj.name,
    "rect_pockets",
    n,
    longest + clearance,
    middle + clearance,
    pocketDepthForUpright(thinnest),
    heightCap,
    footprintCap,
  );
}

interface BinConstraints {
  /** Largest usable axis must be at least this (longest item lies flat). */
  minLongMm: number;
  /** Smaller usable axis must be at least this. */
  minCrossMm: number;
  /** Interior depth must be at least this. */
  minDepthMm: number;
  requiredVolumeMm3: number;
}

function findSmallestBin(
  c: BinConstraints,
  heightCap: number,
  footprintCap: number,
): { l: number; w: number; h: number; bins: number } | null {
  const maxVolume = binInteriorVolumeMm3(footprintCap, footprintCap, heightCap);
  if (maxVolume <= 0) return null;
  const bins = Math.max(1, Math.ceil(c.requiredVolumeMm3 / maxVolume));
  const perBin = c.requiredVolumeMm3 / bins;

  let best: { l: number; w: number; h: number } | null = null;
  for (let l = 1; l <= footprintCap; l++) {
    const usableL = l * UNIT_MM - 2 * BIN_WALL_MM;
    if (usableL < c.minCrossMm) continue;
    for (let w = l; w <= footprintCap; w++) {
      const usableW = w * UNIT_MM - 2 * BIN_WALL_MM;
      if (usableW < c.minLongMm) continue;
      for (let h = 2; h <= heightCap; h++) {
        if (h * HEIGHT_UNIT_MM - BIN_FLOOR_MM < c.minDepthMm) continue;
        if (binInteriorVolumeMm3(l, w, h) < perBin) continue;
        if (!best || l * w < best.l * best.w || (l * w === best.l * best.w && h < best.h)) {
          best = { l, w, h };
        }
        break; // taller bins with the same footprint are never better
      }
    }
  }
  return best ? { ...best, bins } : null;
}

/**
 * Loose parts in an open bin sized from count x item volume / packing factor.
 * With `sections`, the bin is split into strip compartments (small parts that
 * should stay separated); each strip spans the long axis so items still fit.
 */
function bulkBinSpecs(
  obj: CatalogObject,
  n: number,
  heightCap: number,
  footprintCap: number,
  opts: { scoops: boolean; sections?: boolean },
): ContainerSpec[] {
  const g = obj.geometry;
  const clearance = obj.storage.clearance_mm;
  const [thinnest, middle, longest] = sortedDims(boundingBox(obj));
  const packing = Math.max(0.05, obj.storage.packing_factor);

  const found = findSmallestBin(
    {
      minLongMm: longest,
      minCrossMm: Math.min(middle + clearance, longest),
      minDepthMm: thinnest,
      requiredVolumeMm3: (n * g.average_volume_mm3) / packing,
    },
    heightCap,
    footprintCap,
  );
  if (!found) return [];

  const spec = makeSpec({
    name: obj.name,
    kind: "bin",
    length_u: found.l,
    width_u: found.w,
    height_u: found.h,
    quantity: found.bins,
    scoops: opts.scoops,
  });

  if (opts.sections) {
    // Strip compartments across the short axis; each strip spans the long
    // axis (which findSmallestBin guaranteed fits the longest item).
    const usableL = found.l * UNIT_MM - 2 * BIN_WALL_MM;
    const stripMin = Math.max(30, middle + clearance);
    const sections = Math.min(4, Math.max(1, Math.floor(usableL / stripMin)));
    spec.length_div = sections - 1;
  }

  return [spec];
}

/**
 * Divider-tray fallback (utensils, packets): a plain tray whose footprint
 * fits the item lying flat and whose volume covers the counted quantity.
 */
function trayBinSpecs(
  obj: CatalogObject,
  n: number,
  heightCap: number,
  footprintCap: number,
): ContainerSpec[] {
  const g = obj.geometry;
  const clearance = obj.storage.clearance_mm;
  const [thinnest, middle, longest] = sortedDims(boundingBox(obj));
  const packing = Math.max(0.05, obj.storage.packing_factor);

  const found = findSmallestBin(
    {
      minLongMm: longest + clearance,
      minCrossMm: middle + clearance,
      minDepthMm: thinnest,
      requiredVolumeMm3: (n * g.average_volume_mm3) / packing,
    },
    heightCap,
    footprintCap,
  );
  if (!found) return [];

  return [
    makeSpec({
      name: obj.name,
      kind: "bin",
      length_u: found.l,
      width_u: found.w,
      height_u: found.h,
      quantity: found.bins,
    }),
  ];
}

function spoolSpecs(
  obj: CatalogObject,
  n: number,
  heightCap: number,
  footprintCap: number,
): ContainerSpec[] {
  const spec = makeSpec({
    name: obj.name,
    kind: "spool",
    length_u: Math.min(2, footprintCap),
    width_u: Math.min(2, footprintCap),
    height_u: Math.min(6, heightCap),
    quantity: n,
  });
  spec.pocket_depth_mm = spec.height_u * HEIGHT_UNIT_MM - POCKET_FLOOR_MM;
  return [spec];
}

/** One compartment per nested stack; depth = base + (n-1) x increment. */
function nestedStackSpecs(
  obj: CatalogObject,
  n: number,
  heightCap: number,
  footprintCap: number,
): ContainerSpec[] {
  const b = boundingBox(obj);
  const clearance = obj.storage.clearance_mm;
  const nesting = obj.storage.nesting;

  const stackHeightFor = (items: number): number =>
    nesting
      ? nesting.base_height_mm + (items - 1) * nesting.additional_item_height_mm
      : b.z;
  const fits = (items: number): boolean =>
    fitsHeight(pocketDepthForUpright(stackHeightFor(items)), heightCap);

  if (!fits(1)) return [];

  // Largest stack that fits the drawer height and the typical-stack limit.
  const hardCap = nesting && nesting.max_typical_stack > 0 ? nesting.max_typical_stack : n;
  let perStack = 1;
  while (perStack < Math.min(n, hardCap) && fits(perStack + 1)) perStack++;
  const stacks = Math.ceil(n / perStack);
  perStack = Math.ceil(n / stacks); // rebalance stacks evenly

  const depth = pocketDepthForUpright(stackHeightFor(perStack));

  return pocketHolders(
    obj.name,
    "rect_pockets",
    stacks,
    Math.max(b.x, b.y) + clearance,
    Math.min(b.x, b.y) + clearance,
    depth,
    heightCap,
    footprintCap,
  );
}

/** Flat items on edge in a shared slot; falls back to a flat pile if too tall. */
function horizontalStackSpecs(
  obj: CatalogObject,
  n: number,
  heightCap: number,
  footprintCap: number,
): ContainerSpec[] {
  const clearance = obj.storage.clearance_mm;
  const [thinnest, middle, longest] = sortedDims(boundingBox(obj));

  const onEdgeDepth = pocketDepthForUpright(middle);
  if (fitsHeight(onEdgeDepth, heightCap)) {
    const made = pocketHolders(
      obj.name,
      "rect_pockets",
      1,
      longest + clearance,
      thinnest * n + clearance,
      onEdgeDepth,
      heightCap,
      footprintCap,
    );
    if (made.length > 0) return made;
  }

  // Fallback: lie flat and pile upward.
  const pileDepth = pocketDepthForUpright(thinnest * n);
  if (!fitsHeight(pileDepth, heightCap)) return [];
  return pocketHolders(
    obj.name,
    "rect_pockets",
    1,
    longest + clearance,
    middle + clearance,
    pileDepth,
    heightCap,
    footprintCap,
  );
}

/** Round flat items (coasters, tape rolls) piled in one circular well. */
function roundStackSpecs(
  obj: CatalogObject,
  n: number,
  heightCap: number,
  footprintCap: number,
): ContainerSpec[] {
  const g = obj.geometry;
  const clearance = obj.storage.clearance_mm;
  const b = boundingBox(obj);
  const diameter = g.diameter_mm ?? Math.max(b.x, b.y);
  const itemThickness = g.length_mm ?? Math.min(b.x, b.y, b.z);
  const depth = pocketDepthForUpright(itemThickness * n);
  if (!fitsHeight(depth, heightCap)) return [];
  return pocketHolders(
    obj.name,
    "cyl_pockets",
    1,
    diameter + clearance,
    diameter + clearance,
    depth,
    heightCap,
    footprintCap,
  );
}
