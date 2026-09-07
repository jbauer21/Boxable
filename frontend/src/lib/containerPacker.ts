import type { ContainerSpec, PlacedContainer } from "./types";
import { footprintCells, placedCols, placedRows } from "./types";

export interface ContainerPackResult {
  placed: PlacedContainer[];
  unplaced: ContainerSpec[];
}

export function usedCells(result: ContainerPackResult): number {
  return result.placed.reduce((sum, p) => sum + placedCols(p) * placedRows(p), 0);
}

interface FreeRect {
  col: number;
  row: number;
  cols: number;
  rows: number;
}

function contains(a: FreeRect, b: FreeRect): boolean {
  return (
    b.col >= a.col &&
    b.row >= a.row &&
    b.col + b.cols <= a.col + a.cols &&
    b.row + b.rows <= a.row + a.rows
  );
}

function intersects(rect: FreeRect, col: number, row: number, cols: number, rows: number): boolean {
  return col < rect.col + rect.cols && col + cols > rect.col && row < rect.row + rect.rows && row + rows > rect.row;
}

function expand(specs: ContainerSpec[]): ContainerSpec[] {
  return specs.flatMap((spec) =>
    Array.from({ length: Math.max(1, spec.quantity) }, (_, index) => ({
      ...spec,
      quantity: 1,
      id: index > 0 ? `${spec.id}#${index}` : spec.id,
    })),
  );
}

function bestPlacement(spec: ContainerSpec, freeRects: FreeRect[]): PlacedContainer | null {
  let best: { score: [number, number, number, number]; placement: PlacedContainer } | null = null;
  for (const rect of freeRects) {
    for (const rotated of [false, true]) {
      const w = rotated ? spec.width_u : spec.length_u;
      const h = rotated ? spec.length_u : spec.width_u;
      if (rotated && w === h) continue;
      if (w > rect.cols || h > rect.rows) continue;
      const leftoverW = rect.cols - w;
      const leftoverH = rect.rows - h;
      const score: [number, number, number, number] = [
        Math.min(leftoverW, leftoverH),
        Math.max(leftoverW, leftoverH),
        rect.row,
        rect.col,
      ];
      if (
        !best ||
        score[0] < best.score[0] ||
        (score[0] === best.score[0] && score[1] < best.score[1]) ||
        (score[0] === best.score[0] && score[1] === best.score[1] && score[2] < best.score[2]) ||
        (score[0] === best.score[0] &&
          score[1] === best.score[1] &&
          score[2] === best.score[2] &&
          score[3] < best.score[3])
      ) {
        best = { score, placement: { spec, col: rect.col, row: rect.row, rotated } };
      }
    }
  }
  return best?.placement ?? null;
}

function split(freeRects: FreeRect[], placed: PlacedContainer): FreeRect[] {
  const next: FreeRect[] = [];
  const pc = placed.col;
  const pr = placed.row;
  const pw = placedCols(placed);
  const ph = placedRows(placed);
  for (const rect of freeRects) {
    if (!intersects(rect, pc, pr, pw, ph)) {
      next.push(rect);
      continue;
    }
    const left = pc - rect.col;
    if (left > 0) next.push({ col: rect.col, row: rect.row, cols: left, rows: rect.rows });
    const right = rect.col + rect.cols - (pc + pw);
    if (right > 0) next.push({ col: pc + pw, row: rect.row, cols: right, rows: rect.rows });
    const top = pr - rect.row;
    if (top > 0) next.push({ col: rect.col, row: rect.row, cols: rect.cols, rows: top });
    const bottom = rect.row + rect.rows - (pr + ph);
    if (bottom > 0) next.push({ col: rect.col, row: pr + ph, cols: rect.cols, rows: bottom });
  }
  return next.filter((rect, index) => {
    return !next.some((other, otherIndex) => {
      if (otherIndex === index) return false;
      if (!contains(other, rect)) return false;
      if (contains(rect, other) && otherIndex > index) return false;
      return true;
    });
  });
}

export function packContainers(specs: ContainerSpec[], cols: number, rows: number): ContainerPackResult {
  const result: ContainerPackResult = { placed: [], unplaced: [] };
  if (cols <= 0 || rows <= 0) {
    result.unplaced = expand(specs);
    return result;
  }

  const instances = expand(specs).sort((lhs, rhs) => {
    const lf = footprintCells(lhs);
    const rf = footprintCells(rhs);
    if (lf !== rf) return rf - lf;
    const lhsMax = Math.max(lhs.length_u, lhs.width_u);
    const rhsMax = Math.max(rhs.length_u, rhs.width_u);
    if (lhsMax !== rhsMax) return rhsMax - lhsMax;
    if (lhs.name !== rhs.name) return lhs.name < rhs.name ? -1 : 1;
    return lhs.id < rhs.id ? -1 : 1;
  });

  let freeRects: FreeRect[] = [{ col: 0, row: 0, cols, rows }];
  for (const instance of instances) {
    const placement = bestPlacement(instance, freeRects);
    if (!placement) {
      result.unplaced.push(instance);
      continue;
    }
    result.placed.push(placement);
    freeRects = split(freeRects, placement);
  }
  return result;
}
