import { describe, expect, it } from "vitest";
import { CATALOG_OBJECTS, getCatalogObject } from "./catalog";
import { BIN_FLOOR_MM, BIN_WALL_MM, binInteriorVolumeMm3, specsForCatalogGroup } from "./catalogSpecs";
import { HEIGHT_UNIT_MM, POCKET_EDGE_MM, POCKET_FLOOR_MM, UNIT_MM } from "./itemCatalog";

const HEIGHT_CAP = 9;
const FOOTPRINT_CAP = 6;

function specs(objectId: string, count: number, heightCap = HEIGHT_CAP, footprintCap = FOOTPRINT_CAP) {
  return specsForCatalogGroup(objectId, count, heightCap, footprintCap);
}

describe("specsForCatalogGroup", () => {
  it("returns nothing for an unknown object id", () => {
    expect(specs("not_a_real_object", 5)).toEqual([]);
  });

  it("builds cylindrical pocket arrays for AA batteries", () => {
    const result = specs("battery_aa", 12);
    expect(result).toHaveLength(1);
    const spec = result[0];
    const obj = getCatalogObject("battery_aa")!;
    expect(spec.kind).toBe("cyl_pockets");
    expect(spec.pocket_diam_mm).toBe(obj.geometry.diameter_mm! + obj.storage.clearance_mm);
    expect(spec.pocket_rows * spec.pocket_cols * spec.quantity).toBeGreaterThanOrEqual(12);
  });

  it("derives bit-hole diameter from the bounding box cross-section", () => {
    const result = specs("drill_bit", 10);
    expect(result).toHaveLength(1);
    const spec = result[0];
    const obj = getCatalogObject("drill_bit")!;
    expect(spec.kind).toBe("cyl_pockets");
    // drill_bit bbox is 90x8x8: middle dim (8) is the hole size.
    expect(spec.pocket_diam_mm).toBe(8 + obj.storage.clearance_mm);
    expect(spec.pocket_rows * spec.pocket_cols * spec.quantity).toBeGreaterThanOrEqual(10);
  });

  it("uses hex pockets for hex bits", () => {
    const result = specs("hex_bit", 8);
    expect(result).toHaveLength(1);
    const spec = result[0];
    const obj = getCatalogObject("hex_bit")!;
    expect(obj.generation.backend_generator).toBe("hex_pockets");
    expect(spec.kind).toBe("hex_pockets");
    expect(spec.pocket_diam_mm).toBe(7 + obj.storage.clearance_mm);
  });

  it("builds thin on-edge slots for SD cards", () => {
    const result = specs("sd_card", 6);
    expect(result).toHaveLength(1);
    const spec = result[0];
    const obj = getCatalogObject("sd_card")!;
    expect(spec.kind).toBe("rect_pockets");
    // sd_card bbox is 32x24x2.1: slot is longest x thinnest.
    expect(spec.pocket_length_mm).toBeCloseTo(32 + obj.storage.clearance_mm);
    expect(spec.pocket_width_mm).toBeCloseTo(2.1 + obj.storage.clearance_mm);
    expect(spec.pocket_rows * spec.pocket_cols).toBeGreaterThanOrEqual(6);
  });

  it("builds a scoop bin with enough volume for bulk screws", () => {
    const result = specs("wood_screw", 50);
    expect(result).toHaveLength(1);
    const spec = result[0];
    const obj = getCatalogObject("wood_screw")!;
    expect(spec.kind).toBe("bin");
    expect(spec.scoops).toBe(true);
    const required = (50 * obj.geometry.average_volume_mm3) / obj.storage.packing_factor;
    const interior =
      binInteriorVolumeMm3(spec.length_u, spec.width_u, spec.height_u) * spec.quantity;
    expect(interior).toBeGreaterThanOrEqual(required);
  });

  it("keeps the bulk bin footprint large enough for the longest item", () => {
    const spec = specs("wood_screw", 10)[0];
    const obj = getCatalogObject("wood_screw")!;
    const longest = Math.max(
      obj.geometry.bounding_box_mm!.x,
      obj.geometry.bounding_box_mm!.y,
      obj.geometry.bounding_box_mm!.z,
    );
    const usable = Math.max(spec.length_u, spec.width_u) * UNIT_MM - 2 * BIN_WALL_MM;
    expect(usable).toBeGreaterThanOrEqual(longest);
    expect(spec.height_u * HEIGHT_UNIT_MM - BIN_FLOOR_MM).toBeGreaterThanOrEqual(5);
  });

  it("adds strip compartments for small electronic parts", () => {
    const result = specs("resistor_axial", 100);
    expect(result).toHaveLength(1);
    const spec = result[0];
    expect(spec.kind).toBe("bin");
    expect(spec.length_div).toBeGreaterThanOrEqual(0);
    // Each strip must still span the longest item dimension along the width.
    const usableW = spec.width_u * UNIT_MM - 2 * BIN_WALL_MM;
    expect(usableW).toBeGreaterThanOrEqual(10); // resistor length
  });

  it("builds a tray bin sized for utensils lying flat", () => {
    const result = specs("fork", 6, 9, 6);
    expect(result).toHaveLength(1);
    const spec = result[0];
    expect(spec.kind).toBe("bin");
    // Fork is 200mm long: the tray's long axis must fit it.
    const usable = Math.max(spec.length_u, spec.width_u) * UNIT_MM - 2 * BIN_WALL_MM;
    expect(usable).toBeGreaterThanOrEqual(200);
  });

  it("sizes one nested compartment using nesting increments", () => {
    const result = specs("measuring_cups_set", 4, 12, 6);
    expect(result).toHaveLength(1);
    const spec = result[0];
    const obj = getCatalogObject("measuring_cups_set")!;
    const nesting = obj.storage.nesting!;
    expect(spec.kind).toBe("rect_pockets");
    expect(spec.pocket_rows * spec.pocket_cols).toBe(1);
    const stackHeight = nesting.base_height_mm + 3 * nesting.additional_item_height_mm; // 66
    expect(spec.pocket_depth_mm).toBeLessThanOrEqual(stackHeight);
    expect(spec.pocket_depth_mm).toBeGreaterThan(nesting.base_height_mm);
  });

  it("splits nested stacks that exceed the max typical stack", () => {
    const result = specs("measuring_cups_set", 16, 12, 6);
    expect(result).toHaveLength(1);
    expect(result[0].pocket_rows * result[0].pocket_cols * result[0].quantity).toBeGreaterThanOrEqual(2);
  });

  it("creates a spool spec for cable spools", () => {
    const result = specs("cable_spool_generic", 2);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("spool");
    expect(result[0].quantity).toBe(2);
  });

  it("creates one shared channel for bundled zip ties", () => {
    const result = specs("zip_ties", 40, 12, 6);
    expect(result).toHaveLength(1);
    const spec = result[0];
    expect(spec.kind).toBe("rect_pockets");
    expect(spec.pocket_rows * spec.pocket_cols).toBe(1);
    const obj = getCatalogObject("zip_ties")!;
    expect(spec.pocket_length_mm).toBeGreaterThanOrEqual(obj.geometry.bounding_box_mm!.x);
  });

  it("piles round items in one circular well that grows with count", () => {
    const one = specs("coaster", 1, 20, 6)[0];
    const six = specs("coaster", 6, 20, 6)[0];
    expect(one.kind).toBe("cyl_pockets");
    expect(one.pocket_rows * one.pocket_cols).toBe(1);
    expect(six.pocket_depth_mm).toBeGreaterThan(one.pocket_depth_mm);
  });

  it("uses the bounding-box fallback for coiled cables per the catalog", () => {
    const obj = getCatalogObject("cable_usb_c")!;
    expect(obj.generation.support_level).toBe("fallback");
    expect(obj.generation.sizing_mode).toBe("bounding_box");
    const result = specs("cable_usb_c", 3, 12, 6);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("rect_pockets");
    expect(result[0].pocket_rows * result[0].pocket_cols * result[0].quantity).toBeGreaterThanOrEqual(3);
  });

  it("falls back to bounding-box pockets for contour objects", () => {
    const result = specs("pliers_standard", 2, 12, 6);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("rect_pockets");
    expect(result[0].pocket_rows * result[0].pocket_cols * result[0].quantity).toBeGreaterThanOrEqual(2);
  });

  it("respects drawer height caps", () => {
    const result = specs("measuring_cups_set", 8, 2, 6);
    expect(result).toEqual([]);
  });

  it("keeps pocket depth within the container height", () => {
    for (const id of ["battery_aa", "cable_usb_c", "pliers_standard", "coaster", "sd_card"]) {
      for (const made of specs(id, 4, 12, 6)) {
        if (made.kind === "bin" || made.kind === "spool") continue;
        expect(made.pocket_depth_mm).toBeLessThanOrEqual(
          made.height_u * HEIGHT_UNIT_MM - POCKET_FLOOR_MM + 1e-9,
        );
      }
    }
  });

  it("produces a container for every catalog object that fits the 6U maximum", () => {
    // Largest usable pocket span in a 6U container.
    const usableMax = 6 * UNIT_MM - 2 * POCKET_EDGE_MM;
    const unexpected: string[] = [];
    for (const obj of CATALOG_OBJECTS) {
      const made = specsForCatalogGroup(obj.id, 2, 20, 6);
      if (made.length > 0) continue;
      // Objects longer than the biggest container are legitimately skipped.
      const b = obj.geometry.bounding_box_mm;
      const longest = b
        ? Math.max(b.x, b.y, b.z)
        : Math.max(obj.geometry.diameter_mm ?? 0, obj.geometry.length_mm ?? 0);
      if (longest + obj.storage.clearance_mm <= usableMax) unexpected.push(obj.id);
    }
    expect(unexpected).toEqual([]);
  });
});
