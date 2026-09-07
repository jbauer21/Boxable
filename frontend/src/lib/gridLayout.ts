export const GRID_UNIT_MM = 42;

export interface GridLayout {
  widthMm: number;
  heightMm: number;
  unitMm: number;
  cols: number;
  rows: number;
  gridWidthMm: number;
  gridHeightMm: number;
  marginXMm: number;
  marginYMm: number;
}

const EPSILON = 1e-9;

export function fitGrid(widthMm: number, heightMm: number, unitMm = GRID_UNIT_MM): GridLayout {
  const cols = widthMm > 0 && unitMm > 0 ? Math.floor(widthMm / unitMm + EPSILON) : 0;
  const rows = heightMm > 0 && unitMm > 0 ? Math.floor(heightMm / unitMm + EPSILON) : 0;
  const gridWidthMm = cols * unitMm;
  const gridHeightMm = rows * unitMm;
  return {
    widthMm,
    heightMm,
    unitMm,
    cols,
    rows,
    gridWidthMm,
    gridHeightMm,
    marginXMm: Math.max(0, (widthMm - gridWidthMm) / 2),
    marginYMm: Math.max(0, (heightMm - gridHeightMm) / 2),
  };
}
