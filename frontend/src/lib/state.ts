import type { CustomCellSize, ItemType } from "./itemCatalog";
import { DEFAULT_CUSTOM_CELL, displayName } from "./itemCatalog";
import type { Point } from "./types";

export type WizardStep = 1 | 2 | 3 | 4;

export type ItemGroup =
  | {
      id: string;
      mode: "standard";
      type: ItemType;
      name: string;
      count: number;
      customCell: CustomCellSize;
    }
  | {
      id: string;
      mode: "catalog";
      objectId: string;
      name: string;
      count: number;
    }
  | {
      id: string;
      mode: "custom";
      name: string;
      count: number;
      lengthMm: number;
      widthMm: number;
      heightMm: number;
    };

export interface DrawerState {
  widthMm: number;
  heightMm: number;
  depthMm: number;
  photoUrl: string | null;
  photoFile: File | null;
  imageWidth: number;
  imageHeight: number;
  topLeft: Point[] | null;
  bottomRight: Point[] | null;
  confident: boolean;
  message: string;
}

export const EMPTY_DRAWER: DrawerState = {
  widthMm: 0,
  heightMm: 0,
  depthMm: 50,
  photoUrl: null,
  photoFile: null,
  imageWidth: 0,
  imageHeight: 0,
  topLeft: null,
  bottomRight: null,
  confident: false,
  message: "",
};

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `g-${Math.random().toString(36).slice(2)}`;
}

export const newStandardGroup = (type: ItemType): ItemGroup => ({
  id: newId(),
  mode: "standard",
  type,
  name: displayName(type),
  count: 1,
  customCell: { ...DEFAULT_CUSTOM_CELL },
});

export const newCatalogGroup = (objectId: string, name: string): ItemGroup => ({
  id: newId(),
  mode: "catalog",
  objectId,
  name,
  count: 1,
});

export const newCustomGroup = (name = "Custom object"): ItemGroup => ({
  id: newId(),
  mode: "custom",
  name,
  count: 1,
  lengthMm: 80,
  widthMm: 40,
  heightMm: 20,
});

export function cloneGroup(group: ItemGroup): ItemGroup {
  if (group.mode === "standard") {
    return {
      ...group,
      id: newId(),
      customCell: { ...group.customCell },
    };
  }
  return { ...group, id: newId() };
}
