import { describe, expect, it } from "vitest";
import { Homography, SquarePose, measureDrawer } from "../lib/homography";
import type { Point } from "../lib/types";

const unitSquare: Point[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

describe("Homography", () => {
  it("fits identity", () => {
    const h = Homography.fit(unitSquare, unitSquare);
    expect(h).not.toBeNull();
    for (const p of [
      [0.3, 0.7],
      [0.9, 0.1],
      [2, -1],
    ] as Point[]) {
      const mapped = h!.apply(p);
      expect(mapped[0]).toBeCloseTo(p[0], 9);
      expect(mapped[1]).toBeCloseTo(p[1], 9);
    }
  });

  it("recovers a known perspective transform", () => {
    const truth = new Homography([1.2, 0.1, 5, -0.05, 0.9, 10, 0.0005, 0.0002, 1]);
    const src: Point[] = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ];
    const dst = src.map((p) => truth.apply(p));
    const fitted = Homography.fit(src, dst);
    expect(fitted).not.toBeNull();
    for (const p of [
      [25, 60],
      [80, 15],
      [150, 200],
    ] as Point[]) {
      const expected = truth.apply(p);
      const actual = fitted!.apply(p);
      expect(actual[0]).toBeCloseTo(expected[0], 6);
      expect(actual[1]).toBeCloseTo(expected[1], 6);
    }
  });

  it("returns null for collinear corners", () => {
    const collinear: Point[] = [
      [0, 0],
      [1, 1],
      [2, 2],
      [0, 1],
    ];
    expect(Homography.fit(collinear, unitSquare)).toBeNull();
  });

  it("least-squares matches exact fit on four points", () => {
    const truth = new Homography([1.2, 0.1, 5, -0.05, 0.9, 10, 0.0005, 0.0002, 1]);
    const src: Point[] = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ];
    const dst = src.map((p) => truth.apply(p));
    const fitted = Homography.fitLeastSquares(src, dst);
    expect(fitted).not.toBeNull();
    for (const p of [
      [25, 60],
      [80, 15],
      [150, 200],
    ] as Point[]) {
      const expected = truth.apply(p);
      const actual = fitted!.apply(p);
      expect(actual[0]).toBeCloseTo(expected[0], 6);
      expect(actual[1]).toBeCloseTo(expected[1], 6);
    }
  });
});

describe("SquarePose", () => {
  it("recovers a rigid pose", () => {
    const truth = new SquarePose(0.07, 350, 210);
    const size = 100;
    const corners: Point[] = [
      [0, 0],
      [size, 0],
      [size, size],
      [0, size],
    ];
    const mapped = corners.map((p) => truth.apply(p));
    const fit = SquarePose.fitSquare(size, mapped);
    expect(fit).not.toBeNull();
    expect(fit!.pose.theta).toBeCloseTo(truth.theta, 9);
    expect(fit!.pose.tx).toBeCloseTo(truth.tx, 6);
    expect(fit!.pose.ty).toBeCloseTo(truth.ty, 6);
    expect(fit!.rms).toBeCloseTo(0, 6);
  });
});

describe("measureDrawer", () => {
  it("recovers drawer size under perspective", () => {
    const planeToImage = new Homography([3.1, 0.4, 220, -0.2, 2.8, 180, 0.0006, 0.0004, 1]);
    const size = 100;
    const tlPlane: Point[] = [
      [0, 0],
      [size, 0],
      [size, size],
      [0, size],
    ];
    const brPlane: Point[] = [
      [350, 200],
      [450, 200],
      [450, 300],
      [350, 300],
    ];
    const result = measureDrawer(
      tlPlane.map((p) => planeToImage.apply(p)),
      brPlane.map((p) => planeToImage.apply(p)),
    );
    expect(result).not.toBeNull();
    expect(result!.widthMm).toBeCloseTo(450, 0);
    expect(result!.heightMm).toBeCloseTo(300, 0);
    expect(result!.maxSideErrorRatio).toBeLessThan(0.01);
    expect(result!.confident).toBe(true);
  });

  it("flags inconsistent quads", () => {
    const planeToImage = new Homography([3.1, 0.4, 220, -0.2, 2.8, 180, 0.0006, 0.0004, 1]);
    const size = 100;
    const tlPlane: Point[] = [
      [0, 0],
      [size, 0],
      [size, size],
      [0, size],
    ];
    const brPlane: Point[] = [
      [390, 240],
      [450, 240],
      [450, 300],
      [390, 300],
    ];
    const result = measureDrawer(
      tlPlane.map((p) => planeToImage.apply(p)),
      brPlane.map((p) => planeToImage.apply(p)),
    );
    expect(result).not.toBeNull();
    expect(result!.maxSideErrorRatio).toBeGreaterThan(0.12);
    expect(result!.confident).toBe(false);
  });
});
