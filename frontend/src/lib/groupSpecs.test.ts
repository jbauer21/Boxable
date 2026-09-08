import { describe, expect, it } from "vitest";
import { getCatalogObject } from "./catalog";
import { specsForCatalogGroup } from "./catalogSpecs";
import { specsForGroup } from "./groupSpecs";
import { displayName } from "./itemCatalog";
import { newCatalogGroup, newCustomGroup, newStandardGroup } from "./state";

describe("specsForGroup names", () => {
  it("uses a renamed catalog group's name on every spec", () => {
    const obj = getCatalogObject("battery_aa")!;
    const group = { ...newCatalogGroup(obj.id, obj.name), name: "Junk drawer AA" };
    const result = specsForGroup(group, 9, 6);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((spec) => spec.name === "Junk drawer AA")).toBe(true);
  });

  it("keeps the catalog object name when the group is not renamed", () => {
    const obj = getCatalogObject("battery_aa")!;
    const group = newCatalogGroup(obj.id, obj.name);
    const result = specsForGroup(group, 9, 6);
    const baseline = specsForCatalogGroup(obj.id, 1, 9, 6);
    expect(result.map((spec) => spec.name)).toEqual(baseline.map((spec) => spec.name));
    expect(result[0].name).toBe(obj.name);
  });

  it("uses a renamed standard group's name", () => {
    const group = { ...newStandardGroup("batteryAA"), name: "Kitchen AA" };
    const result = specsForGroup(group, 9, 6);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((spec) => spec.name === "Kitchen AA")).toBe(true);
  });

  it("defaults a standard group to its display name", () => {
    const group = newStandardGroup("batteryAA");
    expect(group.name).toBe(displayName("batteryAA"));
    expect(specsForGroup(group, 9, 6)[0].name).toBe("AA batteries");
  });

  it("uses a custom group's name", () => {
    expect(specsForGroup(newCustomGroup("Remote"), 9, 6)[0].name).toBe("Remote");
  });
});
