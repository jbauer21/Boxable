import { describe, expect, it } from "vitest";
import { specsForCatalogGroup } from "./catalogSpecs";
import { DEFAULT_CUSTOM_CELL, specsForCustomCylinder, specsForEntry } from "./itemCatalog";
import {
  cadToThree,
  meshAabb,
  overlayLabels,
  overlayPrimitives,
  placeInDrawer,
  pocketCenters,
  pocketOffsetWorld,
} from "./previewOverlay";
import { GRID_UNIT_MM, HEIGHT_UNIT_MM, makeSpec, type ContainerSpec } from "./types";

function cylSpec(overrides: Partial<ContainerSpec> = {}): ContainerSpec {
  return {
    ...makeSpec({
      id: "cyl",
      name: "AA batteries",
      kind: "cyl_pockets",
      length_u: 2,
      width_u: 2,
      height_u: 7,
      pocket_rows: 4,
      pocket_cols: 4,
      pocket_diam_mm: 15.5,
      pocket_depth_mm: 38.5,
    }),
    ...overrides,
  };
}

describe("pocketCenters", () => {
  it("places a single pocket at the footprint origin", () => {
    const spec = cylSpec({ pocket_rows: 1, pocket_cols: 1 });
    expect(pocketCenters(spec)).toEqual([[0, 0]]);
  });

  it("spreads a 2-col row evenly and symmetrically", () => {
    const spec = cylSpec({ pocket_rows: 1, pocket_cols: 2, pocket_diam_mm: 15.5 });
    const centers = pocketCenters(spec);
    expect(centers).toHaveLength(2);
    expect(centers[0][1]).toBeCloseTo(0);
    expect(centers[1][1]).toBeCloseTo(0);
    expect(centers[0][0]).toBeCloseTo(-centers[1][0]);
    expect(centers[1][0] - centers[0][0]).toBeGreaterThan(15.5);
  });

  it("matches the backend 4x4 count and symmetry", () => {
    const centers = pocketCenters(cylSpec());
    expect(centers).toHaveLength(16);
    const xs = [...new Set(centers.map((c) => Math.round(c[0] * 1e6) / 1e6))].sort((a, b) => a - b);
    expect(xs).toEqual([...xs].map((x) => -x).sort((a, b) => a - b));
  });

  it("rejects an overpacked grid", () => {
    expect(() => pocketCenters(cylSpec({ pocket_rows: 10, pocket_cols: 10 }))).toThrow(/do not fit/);
  });
});

describe("placeInDrawer", () => {
  it("offsets an unrotated local point by the grid cell", () => {
    const spec = cylSpec({ length_u: 2, width_u: 1 });
    const placed = placeInDrawer([10, 5, 3], spec, 1, 2, false);
    expect(placed[0]).toBeCloseTo(10 + 1 * GRID_UNIT_MM);
    expect(placed[1]).toBeCloseTo(5 + 2 * GRID_UNIT_MM);
    expect(placed[2]).toBeCloseTo(3);
  });

  it("rotates like backend _place_vertices: (x, y) -> (extentY - y, x)", () => {
    const spec = cylSpec({ length_u: 2, width_u: 1 });
    const extentY = 1 * GRID_UNIT_MM;
    const placed = placeInDrawer([10, 5, 3], spec, 1, 2, true);
    expect(placed[0]).toBeCloseTo(extentY - 5 + 1 * GRID_UNIT_MM);
    expect(placed[1]).toBeCloseTo(10 + 2 * GRID_UNIT_MM);
    expect(placed[2]).toBeCloseTo(3);
  });

  it("maps CAD z-up onto Three.js y-up", () => {
    expect(cadToThree([4, 9, 13])).toEqual([4, 13, 9]);
  });

  it("rotates pocket offsets around the footprint center", () => {
    expect(pocketOffsetWorld(10, 3, false)).toEqual([10, 3]);
    expect(pocketOffsetWorld(10, 3, true)).toEqual([-3, 10]);
  });
});

describe("overlayPrimitives orientation", () => {
  it("stands a cylinder taller than its diameter in each pocket", () => {
    const spec = cylSpec({
      pocket_rows: 1,
      pocket_cols: 2,
      pocket_diam_mm: 15.5,
      pocket_depth_mm: 38.5,
      height_u: 7,
    });
    const prims = overlayPrimitives([{ spec, col: 0, row: 0, rotated: false }]);
    expect(prims).toHaveLength(2);
    for (const p of prims) {
      expect(p.shape).toBe("cylinder");
      const [diameter, , height] = p.size;
      expect(height).toBeGreaterThan(diameter);
      expect(diameter).toBeCloseTo(15.5 * 0.9);
      expect(height).toBeCloseTo(38.5 * 0.9);
    }
    expect(prims[0].position[2]).toBeCloseTo(prims[1].position[2]);
    expect(prims[0].position[0]).not.toBeCloseTo(prims[1].position[0]);
    expect(prims[0].containerRotated).toBe(false);
    expect(prims[0].lieAlongX).toBe(false);
  });

  it("places one primitive in the center of each pocket as the grid grows", () => {
    const spec = cylSpec({ pocket_rows: 2, pocket_cols: 3, pocket_diam_mm: 14 });
    const prims = overlayPrimitives([{ spec, col: 1, row: 0, rotated: false }]);
    expect(prims).toHaveLength(6);
    const xs = [...new Set(prims.map((p) => Math.round(p.position[0] * 100) / 100))];
    const ys = [...new Set(prims.map((p) => Math.round(p.position[1] * 100) / 100))];
    expect(xs).toHaveLength(3);
    expect(ys).toHaveLength(2);
    const frameX = prims.reduce((s, p) => s + p.position[0], 0) / prims.length;
    const frameY = prims.reduce((s, p) => s + p.position[1], 0) / prims.length;
    const [cx, cy] = placeInDrawer(
      [spec.length_u * GRID_UNIT_MM / 2, spec.width_u * GRID_UNIT_MM / 2, 0],
      spec,
      1,
      0,
      false,
    );
    expect(frameX).toBeCloseTo(cx);
    expect(frameY).toBeCloseTo(cy);
  });

  it("keeps pocket primitives centered on a real mesh AABB", () => {
    const spec = cylSpec({ pocket_rows: 1, pocket_cols: 2, id: "mesh-cyl" });
    const mesh = {
      id: spec.id,
      name: spec.name,
      vertices: [
        [100, 40, 0],
        [184, 40, 0],
        [184, 124, 55],
        [100, 124, 55],
      ] as [number, number, number][],
      triangles: [] as [number, number, number][],
    };
    const aabb = meshAabb(mesh)!;
    const prims = overlayPrimitives([{ spec, col: 0, row: 0, rotated: false }], [mesh]);
    expect(prims).toHaveLength(2);
    const midX = (prims[0].position[0] + prims[1].position[0]) / 2;
    const midY = (prims[0].position[1] + prims[1].position[1]) / 2;
    expect(midX).toBeCloseTo(aabb.centerX);
    expect(midY).toBeCloseTo(aabb.centerY);
    expect(prims[0].position[2]).toBeCloseTo(aabb.topZ - 38.5 + (38.5 * 0.9) / 2);
  });

  it("lays a rect-pocket object with length much greater than height", () => {
    const spec = makeSpec({
      id: "side",
      name: "Lying cylinder",
      kind: "rect_pockets",
      length_u: 4,
      width_u: 2,
      height_u: 6,
      pocket_rows: 1,
      pocket_cols: 1,
      pocket_length_mm: 131,
      pocket_width_mm: 46,
      pocket_depth_mm: 27,
    });
    const prims = overlayPrimitives([{ spec, col: 0, row: 0, rotated: false }]);
    expect(prims).toHaveLength(1);
    expect(prims[0].shape).toBe("box");
    const [sx, sy, sz] = prims[0].size;
    expect(sx).toBeGreaterThan(sz * 2);
    expect(sx).toBeGreaterThan(sy);
    expect(sx).toBeCloseTo(131 * 0.9);
    expect(sy).toBeCloseTo(46 * 0.9);
    expect(sz).toBeCloseTo(27 * 0.9);
  });

  it("keeps a rotated primitive inside the swapped footprint", () => {
    const spec = makeSpec({
      id: "rot",
      name: "On edge",
      kind: "rect_pockets",
      length_u: 3,
      width_u: 1,
      height_u: 6,
      pocket_rows: 1,
      pocket_cols: 1,
      pocket_length_mm: 90,
      pocket_width_mm: 12,
      pocket_depth_mm: 30,
    });
    const prims = overlayPrimitives([{ spec, col: 2, row: 1, rotated: true }]);
    expect(prims).toHaveLength(1);
    const [x, y] = prims[0].position;
    const spanX = spec.width_u * GRID_UNIT_MM;
    const spanY = spec.length_u * GRID_UNIT_MM;
    expect(x).toBeGreaterThan(2 * GRID_UNIT_MM);
    expect(x).toBeLessThan(2 * GRID_UNIT_MM + spanX);
    expect(y).toBeGreaterThan(1 * GRID_UNIT_MM);
    expect(y).toBeLessThan(1 * GRID_UNIT_MM + spanY);
  });

  it("sits cylinder primitives on the pocket floor", () => {
    const spec = cylSpec({ pocket_rows: 1, pocket_cols: 1, pocket_depth_mm: 38.5, height_u: 7 });
    const [p] = overlayPrimitives([{ spec, col: 0, row: 0, rotated: false }]);
    const top = spec.height_u * HEIGHT_UNIT_MM;
    const halfH = (38.5 * 0.9) / 2;
    expect(p.position[2]).toBeCloseTo(top - 38.5 + halfH);
  });
});

describe("mixed catalog overlay", () => {
  it("visualizes upright batteries, on-edge cards, and lying vs standing scissors", () => {
    const batteries = specsForEntry(
      { type: "batteryAA", count: 8, customCell: DEFAULT_CUSTOM_CELL },
      9,
      6,
    );
    const cards = specsForCatalogGroup("board_game_cards", 1, 9, 6);
    const scissorsUp = specsForCatalogGroup("scissors_office", 1, 11, 6);
    const scissorsFlat = specsForCatalogGroup("scissors_office", 1, 4, 6);
    const lyingCell = specsForCustomCylinder("Tall cell", 1, 45, 130, 8, 6);

    const items = [
      { spec: batteries[0], col: 0, row: 0, rotated: false },
      { spec: cards[0], col: 2, row: 0, rotated: false },
      { spec: scissorsUp[0], col: 0, row: 2, rotated: false },
      { spec: scissorsFlat[0], col: 0, row: 3, rotated: false },
      { spec: lyingCell[0], col: 3, row: 3, rotated: true },
    ];

    const prims = overlayPrimitives(items);
    const labels = overlayLabels(items);

    const cyl = prims.filter((p) => p.shape === "cylinder");
    expect(cyl.length).toBeGreaterThan(0);
    expect(cyl[0].size[2]).toBeGreaterThan(cyl[0].size[0]);

    const card = prims.find((p) => p.name === cards[0].name)!;
    expect(card.shape).toBe("box");
    expect(card.size[2]).toBeGreaterThan(card.size[1]);

    const standing = prims.find((p) => p.id.startsWith(scissorsUp[0].id))!;
    expect(standing.size[2]).toBeGreaterThan(standing.size[1]);

    const flat = prims.find((p) => p.id.startsWith(scissorsFlat[0].id))!;
    expect(flat.size[0]).toBeGreaterThan(flat.size[2] * 2);

    const laid = prims.find((p) => p.id.startsWith(lyingCell[0].id))!;
    expect(laid.shape).toBe("cylinder");
    expect(laid.lieAlongX).toBe(true);
    expect(laid.containerRotated).toBe(true);
    expect(laid.size[2]).toBeGreaterThan(laid.size[0]);

    expect(labels).toHaveLength(items.length);
    expect(labels.map((l) => l.text)).toEqual(items.map((i) => i.spec.name));
  });
});
