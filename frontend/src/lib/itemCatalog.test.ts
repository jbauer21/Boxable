import { describe, expect, it } from "vitest";
import {
  ALL_ITEM_TYPES,
  CELL_CLEARANCE_MM,
  HEIGHT_UNIT_MM,
  POCKET_EDGE_MM,
  POCKET_FLOOR_MM,
  POCKET_WALL_MM,
  UNIT_MM,
  bestOrientation,
  bestOrientedSpecs,
  orientationCandidates,
  pocketHolders,
  specsForCustomBox,
  specsForCustomCylinder,
  specsForEntry,
  totalGridCells,
  type ItemType,
} from "../lib/itemCatalog";
import type { ContainerSpec as Spec } from "../lib/types";

function pocketsFit(spec: Spec): boolean {
  const usableX = spec.length_u * UNIT_MM - 2 * POCKET_EDGE_MM;
  const usableY = spec.width_u * UNIT_MM - 2 * POCKET_EDGE_MM;
  const sizeX = spec.kind === "rect_pockets" ? spec.pocket_length_mm : spec.pocket_diam_mm;
  const sizeY = spec.kind === "rect_pockets" ? spec.pocket_width_mm : spec.pocket_diam_mm;
  const pitchX = usableX / spec.pocket_cols;
  const pitchY = usableY / spec.pocket_rows;
  return pitchX >= sizeX + POCKET_WALL_MM && pitchY >= sizeY + POCKET_WALL_MM;
}

/** Solid rim from the box edge to the nearest pocket, along one axis. */
function outerRimMm(spec: Spec, along: "x" | "y"): number {
  const total = (along === "x" ? spec.length_u : spec.width_u) * UNIT_MM;
  const size =
    along === "x"
      ? spec.kind === "rect_pockets"
        ? spec.pocket_length_mm
        : spec.pocket_diam_mm
      : spec.kind === "rect_pockets"
        ? spec.pocket_width_mm
        : spec.pocket_diam_mm;
  const count = along === "x" ? spec.pocket_cols : spec.pocket_rows;
  const pitch = (total - 2 * POCKET_EDGE_MM) / count;
  return POCKET_EDGE_MM + (pitch - size) / 2;
}

function specs(type: ItemType, count: number, maxHeightU = 9, maxFootprintU = 6, customCell = { diameterMm: 18.6, lengthMm: 65.2 }) {
  return specsForEntry({ type, count, customCell }, maxHeightU, maxFootprintU);
}

describe("ItemCatalog", () => {
  it("fits twenty AA batteries in one holder", () => {
    const result = specs("batteryAA", 20);
    expect(result).toHaveLength(1);
    const spec = result[0];
    expect(spec.kind).toBe("cyl_pockets");
    expect(spec.quantity).toBe(1);
    expect(spec.pocket_rows * spec.pocket_cols).toBeGreaterThanOrEqual(20);
    expect(spec.pocket_diam_mm).toBeGreaterThanOrEqual(14.5 + CELL_CLEARANCE_MM);
    expect(pocketsFit(spec)).toBe(true);
    expect(spec.pocket_depth_mm).toBeLessThanOrEqual(spec.height_u * 7 - POCKET_FLOOR_MM + 1e-9);
  });

  it("expands a single pocket to leave a ~5 mm outer wall", () => {
    const spec = specs("batteryAA", 1)[0];
    expect(spec.length_u).toBe(1);
    expect(spec.width_u).toBe(1);
    expect(spec.pocket_rows).toBe(1);
    expect(spec.pocket_cols).toBe(1);
    expect(spec.pocket_diam_mm).toBeGreaterThan(14.5 + CELL_CLEARANCE_MM);
    expect(outerRimMm(spec, "x")).toBeCloseTo(POCKET_EDGE_MM + POCKET_WALL_MM / 2);
    expect(outerRimMm(spec, "y")).toBeCloseTo(POCKET_EDGE_MM + POCKET_WALL_MM / 2);
    expect(pocketsFit(spec)).toBe(true);
  });

  it("splits a large count into multiple holders", () => {
    const result = specs("batteryAA", 300, 9, 3);
    expect(result).toHaveLength(1);
    const spec = result[0];
    expect(spec.quantity).toBeGreaterThan(1);
    expect(spec.pocket_rows * spec.pocket_cols * spec.quantity).toBeGreaterThanOrEqual(300);
    expect(spec.length_u).toBeLessThanOrEqual(3);
    expect(spec.width_u).toBeLessThanOrEqual(3);
    expect(pocketsFit(spec)).toBe(true);
  });

  it("uses slots for coin cells", () => {
    const spec = specs("batteryCR2032", 10)[0];
    expect(spec.kind).toBe("rect_pockets");
    expect(spec.pocket_width_mm).toBeGreaterThanOrEqual(3.8);
    expect(spec.pocket_rows * spec.pocket_cols).toBeGreaterThanOrEqual(10);
    expect(pocketsFit(spec)).toBe(true);
  });

  it("uses the entered custom cell size", () => {
    const spec = specs("customCell", 4, 9, 6, { diameterMm: 21.5, lengthMm: 70 })[0];
    expect(spec.pocket_diam_mm).toBeGreaterThanOrEqual(21.5 + CELL_CLEARANCE_MM);
    expect(pocketsFit(spec)).toBe(true);
  });

  it("caps height and pocket depth to the drawer", () => {
    const spec = specs("battery18650", 8, 4)[0];
    expect(spec.height_u).toBe(4);
    expect(spec.pocket_depth_mm).toBeLessThanOrEqual(4 * 7 - POCKET_FLOOR_MM + 1e-9);
  });

  it("makes one spool per cable", () => {
    const spec = specs("cableSpool", 3)[0];
    expect(spec.kind).toBe("spool");
    expect(spec.quantity).toBe(3);
  });

  it("produces valid specs for every catalog type", () => {
    for (const type of ALL_ITEM_TYPES) {
      for (const count of [1, 5, 24]) {
        const result = specs(type, count, 8, 5);
        expect(result.length).toBeGreaterThan(0);
        for (const spec of result) {
          expect(spec.length_u).toBeGreaterThanOrEqual(1);
          expect(spec.length_u).toBeLessThanOrEqual(5);
          expect(spec.width_u).toBeGreaterThanOrEqual(1);
          expect(spec.width_u).toBeLessThanOrEqual(5);
          expect(spec.height_u).toBeGreaterThanOrEqual(2);
          expect(spec.height_u).toBeLessThanOrEqual(8);
          expect(spec.quantity).toBeGreaterThanOrEqual(1);
          if (spec.kind === "cyl_pockets" || spec.kind === "hex_pockets" || spec.kind === "rect_pockets") {
            expect(spec.pocket_rows).toBeGreaterThanOrEqual(1);
            expect(spec.pocket_cols).toBeGreaterThanOrEqual(1);
            expect(spec.pocket_depth_mm).toBeGreaterThan(0);
            expect(pocketsFit(spec)).toBe(true);
          }
        }
      }
    }
  });

  it("encodes snake_case keys the backend expects", () => {
    const spec = specs("batteryAA", 4)[0];
    const json = JSON.stringify({ containers: [spec] });
    for (const key of [
      "length_u",
      "width_u",
      "height_u",
      "pocket_rows",
      "pocket_cols",
      "pocket_diam_mm",
      "pocket_depth_mm",
      "quantity",
    ]) {
      expect(json).toContain(`"${key}"`);
    }
    expect(json).toContain('"cyl_pockets"');
  });
});

describe("custom item orientation", () => {
  it("stands a tall cylinder upright in a deep drawer", () => {
    const orientation = bestOrientation({ kind: "cylinder", diameter: 45, length: 130 }, 20, 6);
    expect(orientation).not.toBeNull();
    expect(orientation!.kind).toBe("cyl_pockets");
    expect(orientation!.uprightExtentMm).toBe(130);
    expect(orientation!.pocketSizeXMm).toBe(46);
  });

  it("lays a tall cylinder on its side in a shallow drawer", () => {
    const orientation = bestOrientation({ kind: "cylinder", diameter: 45, length: 130 }, 8, 6);
    expect(orientation).not.toBeNull();
    expect(orientation!.kind).toBe("rect_pockets");
    expect(orientation!.uprightExtentMm).toBe(45);
    expect(orientation!.pocketSizeXMm).toBe(131);
    expect(orientation!.pocketSizeYMm).toBe(46);
  });

  it("picks the next-best axis for a box when height is capped", () => {
    const shape = { kind: "box" as const, length: 120, width: 50, height: 25 };
    const deep = bestOrientation(shape, 20, 6);
    expect(deep?.uprightExtentMm).toBe(120);
    expect(deep?.label).toBe("standing upright");
    const shallow = bestOrientation(shape, 8, 6);
    expect(shallow?.uprightExtentMm).toBe(50);
    expect(shallow?.label).toBe("on its side");
  });

  it("returns no orientation for an oversized object", () => {
    expect(bestOrientation({ kind: "box", length: 400, width: 300, height: 300 }, 8, 6)).toBeNull();
  });

  it("produces a valid cylinder pocket spec", () => {
    const result = specsForCustomCylinder("Deodorant", 6, 45, 130, 20, 6);
    expect(result).toHaveLength(1);
    const spec = result[0];
    expect(spec.kind).toBe("cyl_pockets");
    expect(spec.name).toBe("Deodorant");
    expect(spec.pocket_diam_mm).toBeGreaterThanOrEqual(46);
    expect(spec.pocket_rows * spec.pocket_cols * spec.quantity).toBeGreaterThanOrEqual(6);
    expect(pocketsFit(spec)).toBe(true);
  });

  it("produces a valid rect pocket spec for a box", () => {
    const result = specsForCustomBox("Remote", 4, 120, 50, 25, 8, 6);
    expect(result).toHaveLength(1);
    const spec = result[0];
    expect(spec.kind).toBe("rect_pockets");
    expect(spec.pocket_length_mm).toBeGreaterThanOrEqual(121);
    expect(spec.pocket_width_mm).toBeGreaterThanOrEqual(26);
    expect(spec.pocket_rows * spec.pocket_cols * spec.quantity).toBeGreaterThanOrEqual(4);
    expect(pocketsFit(spec)).toBe(true);
  });

  it("produces no specs for an object that cannot fit", () => {
    expect(specsForCustomBox("Toaster", 1, 400, 300, 300, 8, 6)).toEqual([]);
  });
});

describe("bestOrientedSpecs", () => {
  it("picks the orientation with the fewest total grid cells for a multi-item count", () => {
    const shape = { kind: "box" as const, length: 120, width: 50, height: 25 };
    const heightCap = 8;
    const footprintCap = 6;
    const result = bestOrientedSpecs("Widget", shape, 4, 0, heightCap, footprintCap);
    expect(result.length).toBeGreaterThan(0);
    const cells = totalGridCells(result);
    // No other valid orientation lays the same count out in fewer cells.
    for (const candidate of orientationCandidates(shape)) {
      const requiredU = Math.ceil((candidate.pocketDepthMm + POCKET_FLOOR_MM) / HEIGHT_UNIT_MM);
      if (Math.max(2, requiredU) > heightCap) continue;
      const made = pocketHolders(
        "Widget",
        candidate.kind,
        4,
        candidate.pocketSizeXMm,
        candidate.pocketSizeYMm,
        candidate.pocketDepthMm,
        heightCap,
        footprintCap,
      );
      if (made.length === 0) continue;
      expect(cells).toBeLessThanOrEqual(totalGridCells(made));
    }
  });

  it("rejects orientations whose depth would be truncated by the drawer", () => {
    // 130mm cylinder in an 8U (56mm) drawer: upright would need truncation,
    // so the lying pose at full depth is chosen instead.
    const result = bestOrientedSpecs(
      "Tube",
      { kind: "cylinder", diameter: 45, length: 130 },
      2,
      0,
      8,
      6,
    );
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("rect_pockets");
    expect(result[0].pocket_depth_mm).toBeLessThanOrEqual(
      result[0].height_u * HEIGHT_UNIT_MM - POCKET_FLOOR_MM,
    );
  });

  it("prefers the more vertical orientation when floor area ties", () => {
    // 25x30x30 box: standing on the 30mm axis and lying on the 25mm axis both
    // occupy one grid cell; the deeper (more vertical) pose wins the tie.
    const result = bestOrientedSpecs(
      "Cube",
      { kind: "box", length: 25, width: 30, height: 30 },
      1,
      0,
      12,
      6,
    );
    expect(result).toHaveLength(1);
    const spec = result[0];
    expect(spec.pocket_depth_mm).toBeCloseTo(18); // 30 - 12 grip, not 25 - 10
    expect(spec.pocket_length_mm).toBeGreaterThanOrEqual(31);
    expect(spec.pocket_width_mm).toBeGreaterThanOrEqual(26);
  });
});
