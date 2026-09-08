import type { BaseplatePlacement } from "./types";

export const MAX_BASEPLATE_U = 5;

function cellKey(col: number, row: number): string {
  return `${col},${row}`;
}

function occupancyFromGrid(cols: number, rows: number): Set<string> {
  const cells = new Set<string>();
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      cells.add(cellKey(c, r));
    }
  }
  return cells;
}

function canPlace(uncovered: Set<string>, col: number, row: number, width: number, height: number): boolean {
  for (let c = col; c < col + width; c++) {
    for (let r = row; r < row + height; r++) {
      if (!uncovered.has(cellKey(c, r))) return false;
    }
  }
  return true;
}

function largestAt(uncovered: Set<string>, col: number, row: number): { width: number; height: number } | null {
  let best: { width: number; height: number; area: number; square: number } | null = null;
  for (let width = 1; width <= MAX_BASEPLATE_U; width++) {
    for (let height = 1; height <= MAX_BASEPLATE_U; height++) {
      if (!canPlace(uncovered, col, row, width, height)) continue;
      const area = width * height;
      const square = Math.min(width, height);
      if (
        !best ||
        area > best.area ||
        (area === best.area && square > best.square) ||
        (area === best.area && square === best.square && width > best.width)
      ) {
        best = { width, height, area, square };
      }
    }
  }
  return best;
}

/** Cover the full drawer grid with as few 1×1–5×5 baseplates as possible. */
export function tileBaseplates(cols: number, rows: number): BaseplatePlacement[] {
  const uncovered = occupancyFromGrid(Math.max(0, cols), Math.max(0, rows));
  const plates: BaseplatePlacement[] = [];

  while (uncovered.size > 0) {
    let best: {
      col: number;
      row: number;
      width: number;
      height: number;
      area: number;
      square: number;
    } | null = null;

    for (const key of uncovered) {
      const comma = key.indexOf(",");
      const col = Number(key.slice(0, comma));
      const row = Number(key.slice(comma + 1));
      const local = largestAt(uncovered, col, row);
      if (!local) continue;
      const area = local.width * local.height;
      const square = Math.min(local.width, local.height);
      if (
        !best ||
        area > best.area ||
        (area === best.area && square > best.square) ||
        (area === best.area && square === best.square && row < best.row) ||
        (area === best.area && square === best.square && row === best.row && col < best.col)
      ) {
        best = { col, row, width: local.width, height: local.height, area, square };
      }
    }

    if (!best) break;

    plates.push({ length_u: best.width, width_u: best.height, col: best.col, row: best.row });
    for (let c = best.col; c < best.col + best.width; c++) {
      for (let r = best.row; r < best.row + best.height; r++) {
        uncovered.delete(cellKey(c, r));
      }
    }
  }

  return plates;
}
