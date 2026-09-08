import { describe, expect, it } from "vitest";
import { MAX_BASEPLATE_U, tileBaseplates } from "./baseplateTiler";

function gridCells(cols: number, rows: number): Set<string> {
  const cells = new Set<string>();
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      cells.add(`${c},${r}`);
    }
  }
  return cells;
}

function coveredCells(plates: ReturnType<typeof tileBaseplates>): Set<string> {
  const cells = new Set<string>();
  for (const plate of plates) {
    expect(plate.length_u).toBeGreaterThanOrEqual(1);
    expect(plate.width_u).toBeGreaterThanOrEqual(1);
    expect(plate.length_u).toBeLessThanOrEqual(MAX_BASEPLATE_U);
    expect(plate.width_u).toBeLessThanOrEqual(MAX_BASEPLATE_U);
    for (let c = plate.col; c < plate.col + plate.length_u; c++) {
      for (let r = plate.row; r < plate.row + plate.width_u; r++) {
        const key = `${c},${r}`;
        expect(cells.has(key)).toBe(false);
        cells.add(key);
      }
    }
  }
  return cells;
}

describe("tileBaseplates", () => {
  it("returns nothing for an empty grid", () => {
    expect(tileBaseplates(0, 0)).toEqual([]);
    expect(tileBaseplates(4, 0)).toEqual([]);
    expect(tileBaseplates(0, 4)).toEqual([]);
  });

  it("covers a 5x5 drawer with one plate", () => {
    expect(tileBaseplates(5, 5)).toEqual([{ length_u: 5, width_u: 5, col: 0, row: 0 }]);
  });

  it("covers a 4x3 drawer with one plate", () => {
    expect(tileBaseplates(4, 3)).toEqual([{ length_u: 4, width_u: 3, col: 0, row: 0 }]);
  });

  it("splits a strip longer than 5 into 5x1 + 1x1", () => {
    expect(tileBaseplates(6, 1)).toEqual([
      { length_u: 5, width_u: 1, col: 0, row: 0 },
      { length_u: 1, width_u: 1, col: 5, row: 0 },
    ]);
  });

  it("tiles a 10x5 drawer with two 5x5 plates", () => {
    expect(tileBaseplates(10, 5)).toEqual([
      { length_u: 5, width_u: 5, col: 0, row: 0 },
      { length_u: 5, width_u: 5, col: 5, row: 0 },
    ]);
  });

  it("covers every cell of an irregular drawer with no overlap", () => {
    const plates = tileBaseplates(8, 7);
    expect(coveredCells(plates)).toEqual(gridCells(8, 7));
  });

  it("does not depend on packed containers", () => {
    expect(tileBaseplates(3, 2)).toEqual([{ length_u: 3, width_u: 2, col: 0, row: 0 }]);
  });

  it("is deterministic", () => {
    expect(tileBaseplates(9, 6)).toEqual(tileBaseplates(9, 6));
  });
});
