import type { ContainerKind, ContainerSpec } from "./types";
import { makeSpec } from "./types";

export type ItemCategory = "Batteries" | "Tools" | "Electronics";

export type ItemType =
  | "batteryAA"
  | "batteryAAA"
  | "batteryC"
  | "batteryD"
  | "battery9V"
  | "batteryCR2032"
  | "battery18650"
  | "customCell"
  | "screwdriverHolder"
  | "drillBitHolder"
  | "hexBitHolder"
  | "socketHolder"
  | "cableSpool";

export const ALL_ITEM_TYPES: ItemType[] = [
  "batteryAA",
  "batteryAAA",
  "batteryC",
  "batteryD",
  "battery9V",
  "batteryCR2032",
  "battery18650",
  "customCell",
  "screwdriverHolder",
  "drillBitHolder",
  "hexBitHolder",
  "socketHolder",
  "cableSpool",
];

export interface CustomCellSize {
  diameterMm: number;
  lengthMm: number;
}

export const DEFAULT_CUSTOM_CELL: CustomCellSize = { diameterMm: 18.6, lengthMm: 65.2 };

export function itemCategory(type: ItemType): ItemCategory {
  switch (type) {
    case "batteryAA":
    case "batteryAAA":
    case "batteryC":
    case "batteryD":
    case "battery9V":
    case "batteryCR2032":
    case "battery18650":
    case "customCell":
      return "Batteries";
    case "screwdriverHolder":
    case "drillBitHolder":
    case "hexBitHolder":
    case "socketHolder":
      return "Tools";
    case "cableSpool":
      return "Electronics";
  }
}

export function displayName(type: ItemType): string {
  switch (type) {
    case "batteryAA":
      return "AA batteries";
    case "batteryAAA":
      return "AAA batteries";
    case "batteryC":
      return "C batteries";
    case "batteryD":
      return "D batteries";
    case "battery9V":
      return "9V batteries";
    case "batteryCR2032":
      return "CR2032 coin cells";
    case "battery18650":
      return "18650 cells";
    case "customCell":
      return "Custom cylindrical cells";
    case "screwdriverHolder":
      return "Screwdriver holder";
    case "drillBitHolder":
      return "Drill bit holder";
    case "hexBitHolder":
      return "Hex bit holder";
    case "socketHolder":
      return "Socket holder";
    case "cableSpool":
      return "Cable spool";
  }
}

export function countLabel(type: ItemType): string {
  switch (type) {
    case "batteryAA":
    case "batteryAAA":
    case "batteryC":
    case "batteryD":
    case "battery9V":
    case "batteryCR2032":
    case "battery18650":
    case "customCell":
      return "cells";
    case "screwdriverHolder":
      return "screwdrivers";
    case "drillBitHolder":
    case "hexBitHolder":
      return "bits";
    case "socketHolder":
      return "sockets";
    case "cableSpool":
      return "cables";
  }
}

export interface ItemEntry {
  type: ItemType;
  count: number;
  customCell: CustomCellSize;
}

export const UNIT_MM = 42;
export const HEIGHT_UNIT_MM = 7;
export const POCKET_EDGE_MM = 3.5;
export const POCKET_WALL_MM = 2.0;
export const POCKET_FLOOR_MM = 8.0;
export const CELL_GRIP_MM = 12.0;
export const CELL_CLEARANCE_MM = 1.0;
export const SCANNED_CLEARANCE_MM = 1.0;

export const CELL_SIZES: Partial<Record<ItemType, { diameter: number; length: number }>> = {
  batteryAA: { diameter: 14.5, length: 50.5 },
  batteryAAA: { diameter: 10.5, length: 44.5 },
  batteryC: { diameter: 26.2, length: 50.0 },
  batteryD: { diameter: 34.2, length: 61.5 },
  battery18650: { diameter: 18.6, length: 65.2 },
};

function clamp(value: number, lower: number, upper: number): number {
  return Math.min(Math.max(value, lower), upper);
}

export function pocketCapacity(units: number, size: number): number {
  const usable = units * UNIT_MM - 2 * POCKET_EDGE_MM;
  return Math.max(0, Math.floor(usable / (size + POCKET_WALL_MM)));
}

export function pocketHolders(
  name: string,
  kind: ContainerKind,
  count: number,
  sizeX: number,
  sizeY: number,
  depth: number,
  maxHeightU: number,
  maxFootprintU: number,
): ContainerSpec[] {
  const maxU = maxFootprintU;
  const maxCapacity = pocketCapacity(maxU, sizeX) * pocketCapacity(maxU, sizeY);
  if (maxCapacity <= 0) return [];

  const boxes = Math.ceil(count / maxCapacity);
  const perBox = Math.ceil(count / boxes);

  let best: { l: number; w: number } | null = null;
  for (let l = 1; l <= maxU; l++) {
    for (let w = 1; w <= maxU; w++) {
      const capacity = pocketCapacity(l, sizeX) * pocketCapacity(w, sizeY);
      if (capacity < perBox) continue;
      if (
        !best ||
        l * w < best.l * best.w ||
        (l * w === best.l * best.w && Math.abs(l - w) < Math.abs(best.l - best.w))
      ) {
        best = { l, w };
      }
    }
  }
  if (!best) return [];

  const maxCols = pocketCapacity(best.l, sizeX);
  const rows = Math.min(Math.ceil(perBox / maxCols), pocketCapacity(best.w, sizeY));
  const cols = Math.min(maxCols, Math.ceil(perBox / rows));

  const requiredHeight = Math.ceil((depth + POCKET_FLOOR_MM) / HEIGHT_UNIT_MM);
  const heightU = clamp(requiredHeight, 2, maxHeightU);
  const effectiveDepth = Math.min(depth, heightU * HEIGHT_UNIT_MM - POCKET_FLOOR_MM);

  const spec = makeSpec({
    name,
    kind,
    length_u: best.l,
    width_u: best.w,
    height_u: heightU,
    quantity: boxes,
    pocket_rows: rows,
    pocket_cols: cols,
    pocket_depth_mm: effectiveDepth,
  });
  if (kind === "rect_pockets") {
    spec.pocket_length_mm = sizeX;
    spec.pocket_width_mm = sizeY;
  } else {
    spec.pocket_diam_mm = sizeX;
  }
  return [spec];
}

function cylinderHolders(
  name: string,
  count: number,
  diameter: number,
  length: number,
  maxHeightU: number,
  maxFootprintU: number,
): ContainerSpec[] {
  return pocketHolders(
    name,
    "cyl_pockets",
    count,
    diameter + CELL_CLEARANCE_MM,
    diameter + CELL_CLEARANCE_MM,
    Math.max(10, length - CELL_GRIP_MM),
    maxHeightU,
    maxFootprintU,
  );
}

export function specsForEntry(entry: ItemEntry, maxHeightU: number, maxFootprintU: number): ContainerSpec[] {
  const count = Math.max(1, entry.count);
  const heightCap = Math.max(2, maxHeightU);
  const footprintCap = Math.max(1, Math.min(maxFootprintU, 6));
  const name = displayName(entry.type);

  switch (entry.type) {
    case "batteryAA":
    case "batteryAAA":
    case "batteryC":
    case "batteryD":
    case "battery18650": {
      const cell = CELL_SIZES[entry.type]!;
      return cylinderHolders(name, count, cell.diameter, cell.length, heightCap, footprintCap);
    }
    case "customCell":
      return cylinderHolders(
        name,
        count,
        entry.customCell.diameterMm,
        entry.customCell.lengthMm,
        heightCap,
        footprintCap,
      );
    case "battery9V":
      return pocketHolders(
        name,
        "rect_pockets",
        count,
        27.5,
        18.5,
        48.5 - CELL_GRIP_MM,
        heightCap,
        footprintCap,
      );
    case "batteryCR2032":
      return pocketHolders(name, "rect_pockets", count, 21.0, 3.8, 13, heightCap, footprintCap);
    case "screwdriverHolder":
      return pocketHolders(name, "cyl_pockets", count, 22, 22, 40, heightCap, footprintCap);
    case "drillBitHolder":
      return pocketHolders(name, "cyl_pockets", count, 11, 11, 30, heightCap, footprintCap);
    case "hexBitHolder":
      return pocketHolders(name, "hex_pockets", count, 7.2, 7.2, 20, heightCap, footprintCap);
    case "socketHolder":
      return pocketHolders(name, "cyl_pockets", count, 24.5, 24.5, 16, heightCap, footprintCap);
    case "cableSpool": {
      const spec = makeSpec({
        name,
        kind: "spool",
        length_u: Math.min(2, footprintCap),
        width_u: Math.min(2, footprintCap),
        height_u: Math.min(6, heightCap),
        quantity: count,
      });
      spec.pocket_depth_mm = spec.height_u * HEIGHT_UNIT_MM - POCKET_FLOOR_MM;
      return [spec];
    }
  }
}

export type ScannedShape =
  | { kind: "cylinder"; diameter: number; length: number }
  | { kind: "box"; length: number; width: number; height: number };

export interface ScannedOrientation {
  kind: ContainerKind;
  pocketSizeXMm: number;
  pocketSizeYMm: number;
  pocketDepthMm: number;
  uprightExtentMm: number;
  label: string;
}

export function pocketDepthForUpright(extent: number): number {
  return extent - Math.min(CELL_GRIP_MM, extent * 0.4);
}

export function orientationCandidates(shape: ScannedShape): ScannedOrientation[] {
  if (shape.kind === "cylinder") {
    const { diameter, length } = shape;
    return [
      {
        kind: "cyl_pockets",
        pocketSizeXMm: diameter + SCANNED_CLEARANCE_MM,
        pocketSizeYMm: diameter + SCANNED_CLEARANCE_MM,
        pocketDepthMm: pocketDepthForUpright(length),
        uprightExtentMm: length,
        label: "standing upright",
      },
      {
        kind: "rect_pockets",
        pocketSizeXMm: length + SCANNED_CLEARANCE_MM,
        pocketSizeYMm: diameter + SCANNED_CLEARANCE_MM,
        pocketDepthMm: pocketDepthForUpright(diameter),
        uprightExtentMm: diameter,
        label: "lying on its side",
      },
    ];
  }
  const dims = [shape.length, shape.width, shape.height];
  const maxDim = Math.max(...dims);
  const minDim = Math.min(...dims);
  return [0, 1, 2].map((up) => {
    const footprint = dims.filter((_, i) => i !== up);
    const upDim = dims[up];
    const label = upDim >= maxDim ? "standing upright" : upDim <= minDim ? "lying flat" : "on its side";
    return {
      kind: "rect_pockets" as const,
      pocketSizeXMm: Math.max(footprint[0], footprint[1]) + SCANNED_CLEARANCE_MM,
      pocketSizeYMm: Math.min(footprint[0], footprint[1]) + SCANNED_CLEARANCE_MM,
      pocketDepthMm: pocketDepthForUpright(upDim),
      uprightExtentMm: upDim,
      label,
    };
  });
}

export function bestOrientation(
  shape: ScannedShape,
  maxHeightU: number,
  maxFootprintU: number,
): ScannedOrientation | null {
  const footprintCap = Math.max(1, Math.min(maxFootprintU, 6));
  const heightCap = Math.max(2, maxHeightU);
  let best: { orientation: ScannedOrientation; area: number } | null = null;
  for (const candidate of orientationCandidates(shape)) {
    if (candidate.pocketDepthMm <= 0) continue;
    if (pocketCapacity(footprintCap, candidate.pocketSizeXMm) < 1) continue;
    if (pocketCapacity(footprintCap, candidate.pocketSizeYMm) < 1) continue;
    const requiredHeightU = Math.ceil((candidate.pocketDepthMm + POCKET_FLOOR_MM) / HEIGHT_UNIT_MM);
    if (Math.max(2, requiredHeightU) > heightCap) continue;
    const area = (candidate.pocketSizeXMm + POCKET_WALL_MM) * (candidate.pocketSizeYMm + POCKET_WALL_MM);
    if (
      !best ||
      area < best.area ||
      (area === best.area && candidate.pocketDepthMm < best.orientation.pocketDepthMm)
    ) {
      best = { orientation: candidate, area };
    }
  }
  return best?.orientation ?? null;
}

export function specsForCustomBox(
  name: string,
  count: number,
  lengthMm: number,
  widthMm: number,
  heightMm: number,
  maxHeightU: number,
  maxFootprintU: number,
): ContainerSpec[] {
  const shape: ScannedShape = { kind: "box", length: lengthMm, width: widthMm, height: heightMm };
  const orientation = bestOrientation(shape, maxHeightU, maxFootprintU);
  if (!orientation) return [];
  return pocketHolders(
    name || "Custom object",
    orientation.kind,
    Math.max(1, count),
    orientation.pocketSizeXMm,
    orientation.pocketSizeYMm,
    orientation.pocketDepthMm,
    Math.max(2, maxHeightU),
    Math.max(1, Math.min(maxFootprintU, 6)),
  );
}

export function specsForCustomCylinder(
  name: string,
  count: number,
  diameterMm: number,
  lengthMm: number,
  maxHeightU: number,
  maxFootprintU: number,
): ContainerSpec[] {
  const shape: ScannedShape = { kind: "cylinder", diameter: diameterMm, length: lengthMm };
  const orientation = bestOrientation(shape, maxHeightU, maxFootprintU);
  if (!orientation) return [];
  return pocketHolders(
    name || "Custom object",
    orientation.kind,
    Math.max(1, count),
    orientation.pocketSizeXMm,
    orientation.pocketSizeYMm,
    orientation.pocketDepthMm,
    Math.max(2, maxHeightU),
    Math.max(1, Math.min(maxFootprintU, 6)),
  );
}
