import { BIN_FLOOR_MM, BIN_WALL_MM } from "./catalogSpecs";
import { POCKET_EDGE_MM, POCKET_FLOOR_MM, POCKET_WALL_MM } from "./itemCatalog";
import {
  GRID_UNIT_MM,
  HEIGHT_UNIT_MM,
  type ContainerSpec,
  type ItemShape,
  type PreviewItemPayload,
  type PreviewMesh,
} from "./types";

const FILL = 0.9;

export type OverlayShape = "cylinder" | "hex" | "box" | "torus";

export interface OverlayPrimitive {
  id: string;
  name: string;
  shape: OverlayShape;
  /** CAD mm. Cylinder/hex: [diameter, diameter, height]. Box: [sx, sy, sz]. Torus: [radius, tube, 0]. */
  size: [number, number, number];
  /** CAD world position of the primitive center. */
  position: [number, number, number];
  /** Container was packed with a 90° yaw; apply the same yaw to the primitive. */
  containerRotated: boolean;
  /** Lie a cylinder so its axis follows spec length (CAD X), used for on-side cells. */
  lieAlongX: boolean;
}

export interface OverlayLabel {
  id: string;
  text: string;
  /** CAD world position (top-center of the container). */
  position: [number, number, number];
}

export function pocketSizeX(spec: ContainerSpec): number {
  return spec.kind === "rect_pockets" ? spec.pocket_length_mm : spec.pocket_diam_mm;
}

export function pocketSizeY(spec: ContainerSpec): number {
  return spec.kind === "rect_pockets" ? spec.pocket_width_mm : spec.pocket_diam_mm;
}

export function clampedPocketDepth(spec: ContainerSpec): number {
  const maxDepth = spec.height_u * HEIGHT_UNIT_MM - POCKET_FLOOR_MM;
  if (spec.pocket_depth_mm <= 0) return Math.max(1, maxDepth);
  return Math.max(1, Math.min(spec.pocket_depth_mm, maxDepth));
}

/** Centers of a rows x cols pocket grid, relative to the box footprint center. */
export function pocketCenters(spec: ContainerSpec): [number, number][] {
  const totalX = spec.length_u * GRID_UNIT_MM;
  const totalY = spec.width_u * GRID_UNIT_MM;
  const usableX = totalX - 2 * POCKET_EDGE_MM;
  const usableY = totalY - 2 * POCKET_EDGE_MM;
  const pitchX = usableX / spec.pocket_cols;
  const pitchY = usableY / spec.pocket_rows;
  const sizeX = pocketSizeX(spec);
  const sizeY = pocketSizeY(spec);
  if (pitchX < sizeX + POCKET_WALL_MM || pitchY < sizeY + POCKET_WALL_MM) {
    throw new Error(
      `${spec.pocket_cols}x${spec.pocket_rows} pockets of ${sizeX.toFixed(1)}x${sizeY.toFixed(1)} mm do not fit a ${spec.length_u}x${spec.width_u} unit footprint`,
    );
  }
  const centers: [number, number][] = [];
  for (let row = 0; row < spec.pocket_rows; row++) {
    const cy = -usableY / 2 + pitchY * (row + 0.5);
    for (let col = 0; col < spec.pocket_cols; col++) {
      const cx = -usableX / 2 + pitchX * (col + 0.5);
      centers.push([cx, cy]);
    }
  }
  return centers;
}

/**
 * Spec-local pocket offset → drawer XY. Matches backend `_place_vertices`
 * rotation: (x, y) → (−y, x) relative to the footprint center.
 */
export function pocketOffsetWorld(px: number, py: number, rotated: boolean): [number, number] {
  return rotated ? [-py, px] : [px, py];
}

/**
 * Place a point in unrotated mesh space (origin at the footprint corner) into
 * drawer CAD coordinates. Matches backend `_place_vertices` when extents equal
 * the grid footprint.
 */
export function placeInDrawer(
  local: [number, number, number],
  spec: ContainerSpec,
  col: number,
  row: number,
  rotated: boolean,
): [number, number, number] {
  const extentX = spec.length_u * GRID_UNIT_MM;
  const extentY = spec.width_u * GRID_UNIT_MM;
  let x = local[0];
  let y = local[1];
  const z = local[2];
  let spanX: number;
  let spanY: number;
  let placedExtentX: number;
  let placedExtentY: number;
  if (rotated) {
    const nx = extentY - y;
    x = nx;
    y = local[0];
    spanX = spec.width_u * GRID_UNIT_MM;
    spanY = spec.length_u * GRID_UNIT_MM;
    placedExtentX = extentY;
    placedExtentY = extentX;
  } else {
    spanX = spec.length_u * GRID_UNIT_MM;
    spanY = spec.width_u * GRID_UNIT_MM;
    placedExtentX = extentX;
    placedExtentY = extentY;
  }
  const dx = col * GRID_UNIT_MM + (spanX - placedExtentX) / 2;
  const dy = row * GRID_UNIT_MM + (spanY - placedExtentY) / 2;
  return [x + dx, y + dy, z];
}

/** CAD (x, y, z-up) → Three.js (x, y-up, z). */
export function cadToThree(cad: [number, number, number]): [number, number, number] {
  return [cad[0], cad[2], cad[1]];
}

function footprintCenterLocal(spec: ContainerSpec): [number, number] {
  return [(spec.length_u * GRID_UNIT_MM) / 2, (spec.width_u * GRID_UNIT_MM) / 2];
}

function containerHeightMm(spec: ContainerSpec): number {
  return spec.height_u * HEIGHT_UNIT_MM;
}

function itemShapeOf(spec: ContainerSpec): ItemShape {
  if (spec.item_shape) return spec.item_shape;
  if (spec.kind === "hex_pockets") return "hex";
  if (spec.kind === "cyl_pockets") return "cylinder";
  return "box";
}

function overlayShapeOf(spec: ContainerSpec, fallback: OverlayShape): OverlayShape {
  if (fallback === "torus") return "torus";
  const item = itemShapeOf(spec);
  if (item === "cylinder") return "cylinder";
  if (item === "hex") return "hex";
  return "box";
}

export function meshAabb(mesh: PreviewMesh): { centerX: number; centerY: number; topZ: number } | null {
  if (mesh.vertices.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const [x, y, z] of mesh.vertices) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }
  return {
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    topZ: maxZ,
  };
}

function containerFrame(
  placed: PreviewItemPayload,
  mesh?: PreviewMesh,
): { centerX: number; centerY: number; topZ: number } {
  const fromMesh = mesh ? meshAabb(mesh) : null;
  if (fromMesh) return fromMesh;
  const { spec, col, row, rotated } = placed;
  const [cx, cy] = footprintCenterLocal(spec);
  const [wx, wy, wz] = placeInDrawer([cx, cy, containerHeightMm(spec)], spec, col, row, rotated);
  return { centerX: wx, centerY: wy, topZ: wz };
}

function overlayForPockets(
  placed: PreviewItemPayload,
  fallbackShape: OverlayShape,
  mesh?: PreviewMesh,
): OverlayPrimitive[] {
  const { spec, rotated } = placed;
  let centers: [number, number][];
  try {
    centers = pocketCenters(spec);
  } catch {
    return [];
  }
  const frame = containerFrame(placed, mesh);
  const depth = clampedPocketDepth(spec);
  const height = depth * FILL;
  const z = frame.topZ - depth + height / 2;
  const sizeX = pocketSizeX(spec) * FILL;
  const sizeY = pocketSizeY(spec) * FILL;
  const shape = overlayShapeOf(spec, fallbackShape);
  const lieAlongX = shape === "cylinder" && spec.kind === "rect_pockets";
  const size: [number, number, number] = shape === "box"
    ? [sizeX, sizeY, height]
    : lieAlongX
      ? [sizeY, sizeY, sizeX]
      : [sizeX, sizeX, height];
  const zCenter = lieAlongX ? frame.topZ - depth + size[0] / 2 : z;
  return centers.map((offset, index) => {
    const [ox, oy] = pocketOffsetWorld(offset[0], offset[1], rotated);
    return {
      id: `${spec.id}:pocket:${index}`,
      name: spec.name,
      shape,
      size,
      position: [frame.centerX + ox, frame.centerY + oy, zCenter] as [number, number, number],
      containerRotated: rotated,
      lieAlongX,
    };
  });
}

function overlayForBin(placed: PreviewItemPayload, mesh?: PreviewMesh): OverlayPrimitive[] {
  const { spec, rotated } = placed;
  const interiorX = spec.length_u * GRID_UNIT_MM - 2 * BIN_WALL_MM;
  const interiorY = spec.width_u * GRID_UNIT_MM - 2 * BIN_WALL_MM;
  const interiorZ = containerHeightMm(spec) - BIN_FLOOR_MM;
  if (interiorX <= 0 || interiorY <= 0 || interiorZ <= 0) return [];
  const alongX = interiorX >= interiorY;
  const longer = alongX ? interiorX : interiorY;
  const shorter = alongX ? interiorY : interiorX;
  const long = longer * 0.55;
  const short = shorter * 0.35;
  const height = Math.min(interiorZ * 0.45, Math.min(long, short) * 0.5);
  const size: [number, number, number] = alongX ? [long, short, height] : [short, long, height];
  const frame = containerFrame(placed, mesh);
  const z = frame.topZ - interiorZ + height / 2;
  return [
    {
      id: `${spec.id}:bin`,
      name: spec.name,
      shape: "box",
      size,
      position: [frame.centerX, frame.centerY, z],
      containerRotated: rotated,
      lieAlongX: false,
    },
  ];
}

function overlayForSpool(placed: PreviewItemPayload, mesh?: PreviewMesh): OverlayPrimitive[] {
  const { spec, rotated } = placed;
  const extentX = spec.length_u * GRID_UNIT_MM;
  const extentY = spec.width_u * GRID_UNIT_MM;
  const outerR = Math.min(extentX, extentY) / 2 - 3;
  const postR = Math.max(outerR * 0.4, 7);
  const tube = Math.max(1, ((outerR - postR) / 2) * FILL);
  const radius = (outerR + postR) / 2;
  const depth = clampedPocketDepth(spec);
  const frame = containerFrame(placed, mesh);
  const z = frame.topZ - depth + tube;
  return [
    {
      id: `${spec.id}:spool`,
      name: spec.name,
      shape: "torus",
      size: [radius, tube, 0],
      position: [frame.centerX, frame.centerY, z],
      containerRotated: rotated,
      lieAlongX: false,
    },
  ];
}

export function overlayPrimitives(items: PreviewItemPayload[], meshes: PreviewMesh[] = []): OverlayPrimitive[] {
  const byId = new Map(meshes.map((mesh) => [mesh.id, mesh]));
  const out: OverlayPrimitive[] = [];
  for (const item of items) {
    const mesh = byId.get(item.spec.id);
    switch (item.spec.kind) {
      case "cyl_pockets":
        out.push(...overlayForPockets(item, "cylinder", mesh));
        break;
      case "hex_pockets":
        out.push(...overlayForPockets(item, "hex", mesh));
        break;
      case "rect_pockets":
        out.push(...overlayForPockets(item, "box", mesh));
        break;
      case "bin":
        out.push(...overlayForBin(item, mesh));
        break;
      case "spool":
        out.push(...overlayForSpool(item, mesh));
        break;
    }
  }
  return out;
}

export function overlayLabels(items: PreviewItemPayload[], meshes: PreviewMesh[] = []): OverlayLabel[] {
  const byId = new Map(meshes.map((mesh) => [mesh.id, mesh]));
  return items.map((item) => {
    const frame = containerFrame(item, byId.get(item.spec.id));
    return {
      id: item.spec.id,
      text: item.spec.name,
      position: [frame.centerX, frame.centerY, frame.topZ + 6],
    };
  });
}
