import { describe, expect, it } from "vitest";
import {
  CATALOG_OBJECTS,
  categoryDisplayName,
  getCatalogObject,
  quantityLabel,
  searchCatalog,
} from "./catalog";

describe("catalog loading", () => {
  it("loads all objects with the required fields", () => {
    expect(CATALOG_OBJECTS.length).toBeGreaterThan(100);
    const generators = ["divided_bin", "cylindrical_pockets", "hex_pockets", "rectangular_pockets", "spool"];
    for (const obj of CATALOG_OBJECTS) {
      expect(obj.id).toBeTruthy();
      expect(obj.name).toBeTruthy();
      expect(obj.storage.strategy).toBeTruthy();
      expect(obj.storage.quantity_mode).toBeTruthy();
      // v0.2.0: every object must resolve to an implemented backend generator.
      expect(generators).toContain(obj.generation.backend_generator);
      expect(obj.generation.sizing_mode).toBeTruthy();
      expect(["native", "parameterized", "fallback"]).toContain(obj.generation.support_level);
    }
  });

  it("looks up objects by id", () => {
    const aa = getCatalogObject("battery_aa");
    expect(aa?.name).toBe("AA Battery");
    expect(aa?.geometry.diameter_mm).toBe(14.5);
    expect(getCatalogObject("nonexistent_thing")).toBeUndefined();
  });

  it("maps category ids to display names", () => {
    expect(categoryDisplayName("batteries_power")).toBe("Batteries & Power");
    expect(categoryDisplayName("unknown_cat")).toBe("unknown_cat");
  });

  it("labels counts by quantity mode", () => {
    expect(quantityLabel("bulk")).toBe("pieces");
    expect(quantityLabel("set")).toBe("sets");
    expect(quantityLabel("individual")).toBe("items");
  });
});

describe("searchCatalog", () => {
  it("returns nothing for an empty query", () => {
    expect(searchCatalog("")).toEqual([]);
    expect(searchCatalog("   ")).toEqual([]);
  });

  it("finds objects by alias", () => {
    const results = searchCatalog("double a");
    expect(results[0]?.id).toBe("battery_aa");
  });

  it("ranks an exact name match first", () => {
    const results = searchCatalog("aa battery");
    expect(results[0]?.id).toBe("battery_aa");
  });

  it("ranks prefix matches above substring matches", () => {
    const results = searchCatalog("screw");
    expect(results.length).toBeGreaterThan(0);
    // Prefix matches like "Screwdriver"/"Wood Screws" (alias "wood screw")
    // must come before substring-only matches like "Drywall Screws".
    const first = results[0];
    const firstMatchesPrefix = [first.name, ...first.aliases].some((t) =>
      t.toLowerCase().startsWith("screw"),
    );
    expect(firstMatchesPrefix).toBe(true);
  });

  it("matches multi-token queries across word boundaries", () => {
    const results = searchCatalog("usb c");
    expect(results.some((r) => r.id === "cable_usb_c")).toBe(true);
  });

  it("is case-insensitive", () => {
    const results = searchCatalog("USB-C CABLE");
    expect(results[0]?.id).toBe("cable_usb_c");
  });

  it("falls back to category matches", () => {
    const results = searchCatalog("kitchen");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.category === "kitchen")).toBe(true);
  });

  it("caps results at the limit", () => {
    expect(searchCatalog("s", 5).length).toBeLessThanOrEqual(5);
  });
});
