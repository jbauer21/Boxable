import { specsForCatalogGroup } from "./catalogSpecs";
import { specsForCustomBox, specsForEntry } from "./itemCatalog";
import type { ItemGroup } from "./state";
import type { ContainerSpec } from "./types";

export function specsForGroup(group: ItemGroup, maxHeightU: number, maxFootprintU: number): ContainerSpec[] {
  if (group.mode === "standard") {
    return specsForEntry(
      { type: group.type, count: group.count, customCell: group.customCell, name: group.name },
      maxHeightU,
      maxFootprintU,
    );
  }
  if (group.mode === "catalog") {
    return specsForCatalogGroup(group.objectId, group.count, maxHeightU, maxFootprintU).map((spec) => ({
      ...spec,
      name: group.name,
    }));
  }
  return specsForCustomBox(
    group.name,
    group.count,
    group.lengthMm,
    group.widthMm,
    group.heightMm,
    maxHeightU,
    maxFootprintU,
  );
}
