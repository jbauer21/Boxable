import { describe, expect, it } from "vitest";
import { fitGrid } from "../lib/gridLayout";

describe("fitGrid", () => {
  it("fits exact multiples", () => {
    const grid = fitGrid(252, 168);
    expect(grid.cols).toBe(6);
    expect(grid.rows).toBe(4);
    expect(grid.marginXMm).toBe(0);
    expect(grid.marginYMm).toBe(0);
  });

  it("floors leftover and centers the grid", () => {
    const grid = fitGrid(260, 180);
    expect(grid.cols).toBe(6);
    expect(grid.rows).toBe(4);
    expect(grid.gridWidthMm).toBe(252);
    expect(grid.gridHeightMm).toBe(168);
    expect(grid.marginXMm).toBeCloseTo(4, 9);
    expect(grid.marginYMm).toBeCloseTo(6, 9);
  });

  it("treats near-integers as full cells", () => {
    const grid = fitGrid(251.999999999, 42);
    expect(grid.cols).toBe(6);
    expect(grid.rows).toBe(1);
  });

  it("returns zero cells for empty drawers", () => {
    const grid = fitGrid(0, 100);
    expect(grid.cols).toBe(0);
    expect(grid.rows).toBe(2);
  });
});
