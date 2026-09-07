"""Planar homography + joint two-marker drawer measurement.

Faithful port of BOX_PROTO/GridfinityScanner/CV/Homography.swift. Kept free of
OpenCV so the measurement math can be unit-tested on synthetic corners.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

MARKER_SIZE_MM = 100.0
SIDE_ERROR_TOLERANCE = 0.12
CONSISTENCY_TOLERANCE = 0.08


Point = tuple[float, float]


def _hypot(dx: float, dy: float) -> float:
    return math.hypot(dx, dy)


def _solve(system: list[list[float]], n: int) -> list[float] | None:
    """Gaussian elimination with partial pivoting on an n x (n+1) matrix."""
    a = [row[:] for row in system]
    for col in range(n):
        pivot = col
        for row in range(col + 1, n):
            if abs(a[row][col]) > abs(a[pivot][col]):
                pivot = row
        if abs(a[pivot][col]) <= 1e-12:
            return None
        a[col], a[pivot] = a[pivot], a[col]
        p = a[col][col]
        for j in range(col, n + 1):
            a[col][j] /= p
        for row in range(n):
            if row == col:
                continue
            f = a[row][col]
            if f == 0:
                continue
            for j in range(col, n + 1):
                a[row][j] -= f * a[col][j]
    return [a[i][n] for i in range(n)]


def _multiply(a: list[float], b: list[float]) -> list[float]:
    out = [0.0] * 9
    for r in range(3):
        for c in range(3):
            out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]
    return out


class Homography:
    """A 3x3 planar projective transform (row-major)."""

    def __init__(self, m: list[float]):
        if len(m) != 9:
            raise ValueError("homography needs 9 elements")
        self.m = m

    @staticmethod
    def fit(src: list[Point], dst: list[Point]) -> Homography | None:
        if len(src) != 4 or len(dst) != 4:
            return None
        system = [[0.0] * 9 for _ in range(8)]
        for i in range(4):
            x, y = src[i]
            u, v = dst[i]
            system[2 * i] = [x, y, 1, 0, 0, 0, -u * x, -u * y, u]
            system[2 * i + 1] = [0, 0, 0, x, y, 1, -v * x, -v * y, v]
        h = _solve(system, 8)
        if h is None:
            return None
        return Homography(h + [1.0])

    @staticmethod
    def fit_least_squares(src: list[Point], dst: list[Point]) -> Homography | None:
        if len(src) != len(dst) or len(src) < 4:
            return None
        t_src = _Similarity.conditioning(src)
        t_dst = _Similarity.conditioning(dst)
        if t_src is None or t_dst is None:
            return None
        s = [t_src.apply(p) for p in src]
        d = [t_dst.apply(p) for p in dst]

        normal = [[0.0] * 9 for _ in range(8)]

        def accumulate(row: list[float], rhs: float) -> None:
            for j in range(8):
                if row[j] == 0:
                    continue
                for k in range(8):
                    normal[j][k] += row[j] * row[k]
                normal[j][8] += row[j] * rhs

        for i in range(len(s)):
            x, y = s[i]
            u, v = d[i]
            accumulate([x, y, 1, 0, 0, 0, -u * x, -u * y], u)
            accumulate([0, 0, 0, x, y, 1, -v * x, -v * y], v)

        h = _solve(normal, 8)
        if h is None:
            return None
        unconditioned = _multiply(t_dst.inverse, _multiply(h + [1.0], t_src.forward))
        if abs(unconditioned[8]) <= 1e-12:
            return None
        return Homography([v / unconditioned[8] for v in unconditioned])

    def apply(self, p: Point) -> Point:
        x, y = p
        w = self.m[6] * x + self.m[7] * y + self.m[8]
        if abs(w) <= 1e-12:
            return (0.0, 0.0)
        return (
            (self.m[0] * x + self.m[1] * y + self.m[2]) / w,
            (self.m[3] * x + self.m[4] * y + self.m[5]) / w,
        )


@dataclass
class _Similarity:
    scale: float
    cx: float
    cy: float

    @staticmethod
    def conditioning(points: list[Point]) -> _Similarity | None:
        n = len(points)
        mx = sum(p[0] for p in points) / n
        my = sum(p[1] for p in points) / n
        mean_distance = sum(_hypot(p[0] - mx, p[1] - my) for p in points) / n
        if mean_distance <= 1e-9:
            return None
        return _Similarity(scale=math.sqrt(2.0) / mean_distance, cx=mx, cy=my)

    def apply(self, p: Point) -> Point:
        return ((p[0] - self.cx) * self.scale, (p[1] - self.cy) * self.scale)

    @property
    def forward(self) -> list[float]:
        return [self.scale, 0, -self.scale * self.cx, 0, self.scale, -self.scale * self.cy, 0, 0, 1]

    @property
    def inverse(self) -> list[float]:
        return [1 / self.scale, 0, self.cx, 0, 1 / self.scale, self.cy, 0, 0, 1]


def square_corners(size: float) -> list[Point]:
    return [(0.0, 0.0), (size, 0.0), (size, size), (0.0, size)]


@dataclass
class SquarePose:
    theta: float
    tx: float
    ty: float

    def apply(self, p: Point) -> Point:
        c, s = math.cos(self.theta), math.sin(self.theta)
        return (c * p[0] - s * p[1] + self.tx, s * p[0] + c * p[1] + self.ty)

    @staticmethod
    def fit_square(size: float, mapped: list[Point]) -> tuple[SquarePose, float] | None:
        if size <= 0:
            return None
        return SquarePose.fit(square_corners(size), mapped)

    @staticmethod
    def fit(locals_: list[Point], mapped: list[Point]) -> tuple[SquarePose, float] | None:
        if len(locals_) != len(mapped) or len(locals_) < 2:
            return None
        n = len(locals_)
        qcx = sum(p[0] for p in locals_) / n
        qcy = sum(p[1] for p in locals_) / n
        pcx = sum(p[0] for p in mapped) / n
        pcy = sum(p[1] for p in mapped) / n
        dot = 0.0
        cross = 0.0
        for i in range(n):
            qx, qy = locals_[i][0] - qcx, locals_[i][1] - qcy
            px, py = mapped[i][0] - pcx, mapped[i][1] - pcy
            dot += qx * px + qy * py
            cross += qx * py - qy * px
        if dot == 0 and cross == 0:
            return None
        theta = math.atan2(cross, dot)
        c, s = math.cos(theta), math.sin(theta)
        pose = SquarePose(
            theta=theta,
            tx=pcx - (c * qcx - s * qcy),
            ty=pcy - (s * qcx + c * qcy),
        )
        squared = 0.0
        for i in range(n):
            fit = pose.apply(locals_[i])
            r = _hypot(fit[0] - mapped[i][0], fit[1] - mapped[i][1])
            squared += r * r
        return pose, math.sqrt(squared / n)


@dataclass
class PhotoMeasurement:
    width_mm: float
    height_mm: float
    max_side_error_ratio: float
    rms_residual_mm: float
    twist_degrees: float
    confident: bool


def _max_side_error(mapped: list[Point], size: float) -> float:
    max_error = 0.0
    for i in range(4):
        a, b = mapped[i], mapped[(i + 1) % 4]
        side = _hypot(a[0] - b[0], a[1] - b[1])
        max_error = max(max_error, abs(side - size) / size)
    return max_error


def _residual(image: Point, target: Point, h: Homography) -> float:
    mapped = h.apply(image)
    return _hypot(mapped[0] - target[0], mapped[1] - target[1])


def _fallback(mapped: list[Point], size: float, rms: float) -> PhotoMeasurement | None:
    far = mapped[2]
    width_mm, height_mm = far[0], far[1]
    if width_mm <= 1 or height_mm <= 1:
        return None
    return PhotoMeasurement(
        width_mm=round(width_mm),
        height_mm=round(height_mm),
        max_side_error_ratio=_max_side_error(mapped, size),
        rms_residual_mm=rms,
        twist_degrees=0.0,
        confident=False,
    )


def measure_drawer(
    top_left: list[Point],
    bottom_right: list[Point],
    marker_size_mm: float = MARKER_SIZE_MM,
) -> PhotoMeasurement | None:
    """Joint two-marker measurement from ordered TL/TR/BR/BL quads."""
    size = marker_size_mm
    if size <= 0 or len(top_left) != 4 or len(bottom_right) != 4:
        return None
    tl_plane = square_corners(size)
    h = Homography.fit(top_left, tl_plane)
    if h is None:
        return None

    mapped = [h.apply(p) for p in bottom_right]
    fitted = SquarePose.fit_square(size, mapped)
    if fitted is None:
        return None
    pose, pose_residual = fitted
    if pose_residual > size * CONSISTENCY_TOLERANCE:
        fallback = _fallback(mapped, size, pose_residual)
        if fallback is None:
            return None
        fallback.confident = (
            fallback.max_side_error_ratio <= SIDE_ERROR_TOLERANCE
            and fallback.width_mm >= MARKER_SIZE_MM
            and fallback.height_mm >= MARKER_SIZE_MM
        )
        return fallback

    for _ in range(512):
        src = list(top_left) + list(bottom_right)
        dst = list(tl_plane) + [pose.apply(p) for p in square_corners(size)]
        refit = Homography.fit_least_squares(src, dst)
        if refit is None:
            break
        h = refit
        mapped = [h.apply(p) for p in bottom_right]
        next_fit = SquarePose.fit(square_corners(size), mapped)
        if next_fit is None:
            break
        next_pose, pose_residual = next_fit
        delta_theta = abs(next_pose.theta - pose.theta)
        delta_t = _hypot(next_pose.tx - pose.tx, next_pose.ty - pose.ty)
        pose = next_pose
        if delta_theta < 1e-7 and delta_t < 1e-5 * size:
            break

    twist = math.remainder(pose.theta, math.pi / 2)
    far = pose.apply((size, size))
    a = -twist / 2
    width_mm = far[0] * math.cos(a) - far[1] * math.sin(a)
    height_mm = far[0] * math.sin(a) + far[1] * math.cos(a)
    if width_mm <= 1 or height_mm <= 1:
        return None

    residual_squares = 0.0
    residual_count = 0
    br_square = square_corners(size)
    for i in range(4):
        r = _residual(top_left[i], tl_plane[i], h)
        residual_squares += r * r
        r = _residual(bottom_right[i], pose.apply(br_square[i]), h)
        residual_squares += r * r
        residual_count += 2
    rms = math.sqrt(residual_squares / residual_count)
    side_error = _max_side_error(mapped, size)
    width_r = round(width_mm)
    height_r = round(height_mm)
    confident = (
        side_error <= SIDE_ERROR_TOLERANCE
        and width_r >= MARKER_SIZE_MM
        and height_r >= MARKER_SIZE_MM
    )
    return PhotoMeasurement(
        width_mm=width_r,
        height_mm=height_r,
        max_side_error_ratio=side_error,
        rms_residual_mm=rms,
        twist_degrees=twist * 180 / math.pi,
        confident=confident,
    )
