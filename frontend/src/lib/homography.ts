import type { Point } from "./types";
import { MARKER_SIZE_MM } from "./types";

export const SIDE_ERROR_TOLERANCE = 0.12;
export const CONSISTENCY_TOLERANCE = 0.08;

function hypot(dx: number, dy: number): number {
  return Math.hypot(dx, dy);
}

function remainder(x: number, y: number): number {
  return x - y * Math.round(x / y);
}

function solve(system: number[][], n: number): number[] | null {
  const a = system.map((row) => row.slice());
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) <= 1e-12) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const p = a[col][col];
    for (let j = col; j <= n; j++) a[col][j] /= p;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const f = a[row][col];
      if (f === 0) continue;
      for (let j = col; j <= n; j++) a[row][j] -= f * a[col][j];
    }
  }
  return Array.from({ length: n }, (_, i) => a[i][n]);
}

function multiply(a: number[], b: number[]): number[] {
  const out = new Array<number>(9).fill(0);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    }
  }
  return out;
}

class Similarity {
  constructor(
    readonly scale: number,
    readonly cx: number,
    readonly cy: number,
  ) {}

  static conditioning(points: Point[]): Similarity | null {
    const n = points.length;
    const mx = points.reduce((s, p) => s + p[0], 0) / n;
    const my = points.reduce((s, p) => s + p[1], 0) / n;
    const meanDistance = points.reduce((s, p) => s + hypot(p[0] - mx, p[1] - my), 0) / n;
    if (meanDistance <= 1e-9) return null;
    return new Similarity(Math.sqrt(2) / meanDistance, mx, my);
  }

  apply(p: Point): Point {
    return [(p[0] - this.cx) * this.scale, (p[1] - this.cy) * this.scale];
  }

  get forward(): number[] {
    return [this.scale, 0, -this.scale * this.cx, 0, this.scale, -this.scale * this.cy, 0, 0, 1];
  }

  get inverse(): number[] {
    return [1 / this.scale, 0, this.cx, 0, 1 / this.scale, this.cy, 0, 0, 1];
  }
}

export class Homography {
  constructor(readonly m: number[]) {}

  static fit(src: Point[], dst: Point[]): Homography | null {
    if (src.length !== 4 || dst.length !== 4) return null;
    const system: number[][] = Array.from({ length: 8 }, () => new Array(9).fill(0));
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i];
      const [u, v] = dst[i];
      system[2 * i] = [x, y, 1, 0, 0, 0, -u * x, -u * y, u];
      system[2 * i + 1] = [0, 0, 0, x, y, 1, -v * x, -v * y, v];
    }
    const h = solve(system, 8);
    if (!h) return null;
    return new Homography([...h, 1]);
  }

  static fitLeastSquares(src: Point[], dst: Point[]): Homography | null {
    if (src.length !== dst.length || src.length < 4) return null;
    const tSrc = Similarity.conditioning(src);
    const tDst = Similarity.conditioning(dst);
    if (!tSrc || !tDst) return null;
    const s = src.map((p) => tSrc.apply(p));
    const d = dst.map((p) => tDst.apply(p));
    const normal: number[][] = Array.from({ length: 8 }, () => new Array(9).fill(0));
    const accumulate = (row: number[], rhs: number) => {
      for (let j = 0; j < 8; j++) {
        if (row[j] === 0) continue;
        for (let k = 0; k < 8; k++) normal[j][k] += row[j] * row[k];
        normal[j][8] += row[j] * rhs;
      }
    };
    for (let i = 0; i < s.length; i++) {
      const [x, y] = s[i];
      const [u, v] = d[i];
      accumulate([x, y, 1, 0, 0, 0, -u * x, -u * y], u);
      accumulate([0, 0, 0, x, y, 1, -v * x, -v * y], v);
    }
    const h = solve(normal, 8);
    if (!h) return null;
    const unconditioned = multiply(tDst.inverse, multiply([...h, 1], tSrc.forward));
    if (Math.abs(unconditioned[8]) <= 1e-12) return null;
    return new Homography(unconditioned.map((v) => v / unconditioned[8]));
  }

  apply(p: Point): Point {
    const [x, y] = p;
    const w = this.m[6] * x + this.m[7] * y + this.m[8];
    if (Math.abs(w) <= 1e-12) return [0, 0];
    return [
      (this.m[0] * x + this.m[1] * y + this.m[2]) / w,
      (this.m[3] * x + this.m[4] * y + this.m[5]) / w,
    ];
  }
}

export function squareCorners(size: number): Point[] {
  return [
    [0, 0],
    [size, 0],
    [size, size],
    [0, size],
  ];
}

export class SquarePose {
  constructor(
    readonly theta: number,
    readonly tx: number,
    readonly ty: number,
  ) {}

  apply(p: Point): Point {
    const c = Math.cos(this.theta);
    const s = Math.sin(this.theta);
    return [c * p[0] - s * p[1] + this.tx, s * p[0] + c * p[1] + this.ty];
  }

  static fitSquare(size: number, mapped: Point[]): { pose: SquarePose; rms: number } | null {
    if (size <= 0) return null;
    return SquarePose.fit(squareCorners(size), mapped);
  }

  static fit(locals: Point[], mapped: Point[]): { pose: SquarePose; rms: number } | null {
    if (locals.length !== mapped.length || locals.length < 2) return null;
    const n = locals.length;
    const qcx = locals.reduce((s, p) => s + p[0], 0) / n;
    const qcy = locals.reduce((s, p) => s + p[1], 0) / n;
    const pcx = mapped.reduce((s, p) => s + p[0], 0) / n;
    const pcy = mapped.reduce((s, p) => s + p[1], 0) / n;
    let dot = 0;
    let cross = 0;
    for (let i = 0; i < n; i++) {
      const qx = locals[i][0] - qcx;
      const qy = locals[i][1] - qcy;
      const px = mapped[i][0] - pcx;
      const py = mapped[i][1] - pcy;
      dot += qx * px + qy * py;
      cross += qx * py - qy * px;
    }
    if (dot === 0 && cross === 0) return null;
    const theta = Math.atan2(cross, dot);
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const pose = new SquarePose(theta, pcx - (c * qcx - s * qcy), pcy - (s * qcx + c * qcy));
    let squared = 0;
    for (let i = 0; i < n; i++) {
      const fit = pose.apply(locals[i]);
      const r = hypot(fit[0] - mapped[i][0], fit[1] - mapped[i][1]);
      squared += r * r;
    }
    return { pose, rms: Math.sqrt(squared / n) };
  }
}

export interface PhotoMeasurement {
  widthMm: number;
  heightMm: number;
  maxSideErrorRatio: number;
  rmsResidualMm: number;
  twistDegrees: number;
  confident: boolean;
}

function maxSideError(mapped: Point[], size: number): number {
  let maxError = 0;
  for (let i = 0; i < 4; i++) {
    const a = mapped[i];
    const b = mapped[(i + 1) % 4];
    const side = hypot(a[0] - b[0], a[1] - b[1]);
    maxError = Math.max(maxError, Math.abs(side - size) / size);
  }
  return maxError;
}

function residual(image: Point, target: Point, h: Homography): number {
  const mapped = h.apply(image);
  return hypot(mapped[0] - target[0], mapped[1] - target[1]);
}

function fallback(mapped: Point[], size: number, rms: number): PhotoMeasurement | null {
  const far = mapped[2];
  if (far[0] <= 1 || far[1] <= 1) return null;
  const widthMm = Math.round(far[0]);
  const heightMm = Math.round(far[1]);
  const maxSideErrorRatio = maxSideError(mapped, size);
  return {
    widthMm,
    heightMm,
    maxSideErrorRatio,
    rmsResidualMm: rms,
    twistDegrees: 0,
    confident:
      maxSideErrorRatio <= SIDE_ERROR_TOLERANCE &&
      widthMm >= MARKER_SIZE_MM &&
      heightMm >= MARKER_SIZE_MM,
  };
}

export function measureDrawer(
  topLeft: Point[],
  bottomRight: Point[],
  markerSizeMm = MARKER_SIZE_MM,
): PhotoMeasurement | null {
  const size = markerSizeMm;
  if (size <= 0 || topLeft.length !== 4 || bottomRight.length !== 4) return null;
  const tlPlane = squareCorners(size);
  let h = Homography.fit(topLeft, tlPlane);
  if (!h) return null;

  let mapped = bottomRight.map((p) => h!.apply(p));
  const fitted = SquarePose.fitSquare(size, mapped);
  if (!fitted) return null;
  let pose = fitted.pose;
  let poseResidual = fitted.rms;
  if (poseResidual > size * CONSISTENCY_TOLERANCE) {
    return fallback(mapped, size, poseResidual);
  }

  for (let i = 0; i < 512; i++) {
    const src = [...topLeft, ...bottomRight];
    const dst = [...tlPlane, ...squareCorners(size).map((p) => pose.apply(p))];
    const refit = Homography.fitLeastSquares(src, dst);
    if (!refit) break;
    h = refit;
    mapped = bottomRight.map((p) => h!.apply(p));
    const next = SquarePose.fit(squareCorners(size), mapped);
    if (!next) break;
    const deltaTheta = Math.abs(next.pose.theta - pose.theta);
    const deltaT = hypot(next.pose.tx - pose.tx, next.pose.ty - pose.ty);
    pose = next.pose;
    poseResidual = next.rms;
    if (deltaTheta < 1e-7 && deltaT < 1e-5 * size) break;
  }

  const twist = remainder(pose.theta, Math.PI / 2);
  const far = pose.apply([size, size]);
  const a = -twist / 2;
  const widthMmRaw = far[0] * Math.cos(a) - far[1] * Math.sin(a);
  const heightMmRaw = far[0] * Math.sin(a) + far[1] * Math.cos(a);
  if (widthMmRaw <= 1 || heightMmRaw <= 1) return null;

  let residualSquares = 0;
  let residualCount = 0;
  const brSquare = squareCorners(size);
  for (let i = 0; i < 4; i++) {
    const r1 = residual(topLeft[i], tlPlane[i], h);
    residualSquares += r1 * r1;
    const r2 = residual(bottomRight[i], pose.apply(brSquare[i]), h);
    residualSquares += r2 * r2;
    residualCount += 2;
  }
  const rms = Math.sqrt(residualSquares / residualCount);
  const maxSideErrorRatio = maxSideError(mapped, size);
  const widthMm = Math.round(widthMmRaw);
  const heightMm = Math.round(heightMmRaw);
  return {
    widthMm,
    heightMm,
    maxSideErrorRatio,
    rmsResidualMm: rms,
    twistDegrees: (twist * 180) / Math.PI,
    confident:
      maxSideErrorRatio <= SIDE_ERROR_TOLERANCE &&
      widthMm >= MARKER_SIZE_MM &&
      heightMm >= MARKER_SIZE_MM,
  };
}

/** Default placeholder quads when a marker was not detected. */
export function defaultQuad(kind: "topLeft" | "bottomRight", imageWidth: number, imageHeight: number): Point[] {
  const s = Math.min(imageWidth, imageHeight) * 0.18;
  if (kind === "topLeft") {
    return [
      [20, 20],
      [20 + s, 20],
      [20 + s, 20 + s],
      [20, 20 + s],
    ];
  }
  return [
    [imageWidth - 20 - s, imageHeight - 20 - s],
    [imageWidth - 20, imageHeight - 20 - s],
    [imageWidth - 20, imageHeight - 20],
    [imageWidth - 20 - s, imageHeight - 20],
  ];
}
