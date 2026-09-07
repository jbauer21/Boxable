export const GRID_UNIT_MM = 42;
export const HEIGHT_UNIT_MM = 7;
export const MARKER_SIZE_MM = 100;

export type ContainerKind =
  | "bin"
  | "cyl_pockets"
  | "hex_pockets"
  | "rect_pockets"
  | "spool";

export interface ContainerSpec {
  id: string;
  name: string;
  kind: ContainerKind;
  length_u: number;
  width_u: number;
  height_u: number;
  quantity: number;
  length_div: number;
  width_div: number;
  scoops: boolean;
  labels: boolean;
  pocket_rows: number;
  pocket_cols: number;
  pocket_depth_mm: number;
  pocket_diam_mm: number;
  pocket_length_mm: number;
  pocket_width_mm: number;
}

export function makeSpec(partial: Partial<ContainerSpec> & Pick<ContainerSpec, "name" | "kind" | "length_u" | "width_u" | "height_u">): ContainerSpec {
  return {
    id: partial.id ?? (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `c-${Math.random().toString(36).slice(2)}`),
    quantity: 1,
    length_div: 0,
    width_div: 0,
    scoops: false,
    labels: false,
    pocket_rows: 0,
    pocket_cols: 0,
    pocket_depth_mm: 0,
    pocket_diam_mm: 0,
    pocket_length_mm: 0,
    pocket_width_mm: 0,
    ...partial,
  };
}

export function footprintCells(spec: ContainerSpec): number {
  return spec.length_u * spec.width_u;
}

export interface PlacedContainer {
  spec: ContainerSpec;
  col: number;
  row: number;
  rotated: boolean;
}

export function placedCols(placed: PlacedContainer): number {
  return placed.rotated ? placed.spec.width_u : placed.spec.length_u;
}

export function placedRows(placed: PlacedContainer): number {
  return placed.rotated ? placed.spec.length_u : placed.spec.width_u;
}

export type Point = [number, number];

export interface MarkerQuads {
  topLeft: Point[] | null;
  bottomRight: Point[] | null;
}

export interface MeasureResponse {
  width_mm: number | null;
  height_mm: number | null;
  markers: MarkerQuads;
  confidence: number;
  confident: boolean;
  rms_residual_mm: number | null;
  twist_degrees: number | null;
  max_side_error_ratio: number | null;
  message: string;
  image_width: number;
  image_height: number;
}

export interface RefineResponse {
  width_mm: number | null;
  height_mm: number | null;
  markers: MarkerQuads;
  confident: boolean;
  rms_residual_mm: number | null;
  twist_degrees: number | null;
  max_side_error_ratio: number | null;
  moved: boolean;
  message: string;
}

export interface PreviewMesh {
  id: string;
  name: string;
  vertices: [number, number, number][];
  triangles: [number, number, number][];
}

export interface PreviewItemPayload {
  spec: ContainerSpec;
  col: number;
  row: number;
  rotated: boolean;
}
