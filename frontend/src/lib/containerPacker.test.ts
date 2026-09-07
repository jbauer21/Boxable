import { describe, expect, it } from "vitest";
import { packContainers, usedCells } from "../lib/containerPacker";
import { placedCols, placedRows, type ContainerSpec, makeSpec } from "../lib/types";

function spec(name: string, lengthU: number, widthU: number, quantity = 1): ContainerSpec {
  return makeSpec({ id: name, name, kind: "bin", length_u: lengthU, width_u: widthU, height_u: 3, quantity });
}

function assertNoOverlapAndInBounds(
  result: ReturnType<typeof packContainers>,
  cols: number,
  rows: number,
) {
  const occupied = new Set<number>();
  for (const placed of result.placed) {
    expect(placed.col).toBeGreaterThanOrEqual(0);
    expect(placed.row).toBeGreaterThanOrEqual(0);
    expect(placed.col + placedCols(placed)).toBeLessThanOrEqual(cols);
    expect(placed.row + placedRows(placed)).toBeLessThanOrEqual(rows);
    for (let c = placed.col; c < placed.col + placedCols(placed); c++) {
      for (let r = placed.row; r < placed.row + placedRows(placed); r++) {
        const cell = r * cols + c;
        expect(occupied.has(cell)).toBe(false);
        occupied.add(cell);
      }
    }
  }
}

describe("ContainerPacker", () => {
  it("places a single container that fills the grid", () => {
    const result = packContainers([spec("a", 4, 3)], 4, 3);
    expect(result.placed).toHaveLength(1);
    expect(result.unplaced).toHaveLength(0);
    expect(usedCells(result)).toBe(12);
  });

  it("tiles four 2x2 containers into a 4x4 grid", () => {
    const result = packContainers([spec("a", 2, 2, 4)], 4, 4);
    expect(result.placed).toHaveLength(4);
    expect(result.unplaced).toHaveLength(0);
    expect(usedCells(result)).toBe(16);
    assertNoOverlapAndInBounds(result, 4, 4);
  });

  it("rotates a strip to fill a leftover column", () => {
    const result = packContainers([spec("big", 3, 4), spec("strip", 4, 1)], 4, 4);
    expect(result.placed).toHaveLength(2);
    expect(result.unplaced).toHaveLength(0);
    assertNoOverlapAndInBounds(result, 4, 4);
    const strip = result.placed.find((p) => p.spec.name === "strip")!;
    expect(strip.rotated).toBe(true);
    expect(placedCols(strip)).toBe(1);
    expect(placedRows(strip)).toBe(4);
  });

  it("reports overflow instead of dropping it", () => {
    const result = packContainers([spec("a", 2, 2, 5)], 4, 4);
    expect(result.placed).toHaveLength(4);
    expect(result.unplaced).toHaveLength(1);
  });

  it("expands quantity into distinct instances", () => {
    const result = packContainers([spec("a", 1, 1, 3)], 3, 1);
    expect(result.placed).toHaveLength(3);
    expect(new Set(result.placed.map((p) => p.spec.id)).size).toBe(3);
  });

  it("packs mixed sizes without overlap", () => {
    const specs = [
      spec("tray", 5, 2),
      spec("box", 3, 3),
      spec("bin", 2, 2, 3),
      spec("slim", 1, 3),
      spec("cube", 1, 1, 4),
    ];
    const result = packContainers(specs, 8, 5);
    expect(result.unplaced).toHaveLength(0);
    assertNoOverlapAndInBounds(result, 8, 5);
    expect(usedCells(result)).toBe(38);
  });

  it("is deterministic", () => {
    const specs = [spec("tray", 5, 2), spec("box", 3, 3), spec("bin", 2, 2, 3), spec("cube", 1, 1, 4)];
    const first = packContainers(specs, 8, 5);
    const second = packContainers(specs, 8, 5);
    expect(first).toEqual(second);
  });

  it("leaves everything unplaced on an empty grid", () => {
    const result = packContainers([spec("a", 1, 1, 2)], 0, 0);
    expect(result.placed).toHaveLength(0);
    expect(result.unplaced).toHaveLength(2);
  });

  it("rejects a container larger than the grid", () => {
    const result = packContainers([spec("huge", 5, 5)], 4, 4);
    expect(result.placed).toHaveLength(0);
    expect(result.unplaced).toHaveLength(1);
  });
});
