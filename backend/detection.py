"""OpenCV fiducial-marker detection for the two printed Gridfinity markers.

Port of BOX_PROTO MarkerDetector + MarkerMatcher: find convex quads, rectify
each to a square, match against the two 6x6 black/white templates, then
measure the drawer with the joint homography.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import cv2
import numpy as np

from homography import MARKER_SIZE_MM, Point, measure_drawer

GRID_UNITS = 6
HALF_UNITS = 12
MINIMUM_CONTRAST = 0.15
MINIMUM_SCORE = 0.74

# White rects in SVG unit coordinates, matching scripts/generate_markers.py.
TOP_LEFT_RECTS = [
    (1, 2, 1.5, 1), (1, 2, 1, 1.5), (2, 2, 1.5, 1), (3, 2, 1.5, 1),
    (4, 2, 1, 1), (4, 2, 1, 1.5), (1, 3, 1, 1), (1, 3, 1, 1.5),
    (4, 3, 1, 1), (1, 4, 1, 1), (3, 4, 1, 1),
]
BOTTOM_RIGHT_RECTS = [
    (1, 1, 1, 1), (3, 1, 1.5, 1), (4, 1, 1, 1), (4, 1, 1, 1.5),
    (2, 2, 1, 1), (4, 2, 1, 1), (4, 2, 1, 1.5), (3, 3, 1.5, 1),
    (3, 3, 1, 1.5), (4, 3, 1, 1), (3, 4, 1, 1),
]


def _template(rects) -> np.ndarray:
    """12x12 bool bitmap; True = white printed area. Row 0 is the top."""
    bitmap = np.zeros((HALF_UNITS, HALF_UNITS), dtype=bool)
    for y in range(HALF_UNITS):
        for x in range(HALF_UNITS):
            unit_x = (x + 0.5) / HALF_UNITS * GRID_UNITS
            unit_y = (y + 0.5) / HALF_UNITS * GRID_UNITS
            for rx, ry, rw, rh in rects:
                if rx <= unit_x < rx + rw and ry <= unit_y < ry + rh:
                    bitmap[y, x] = True
                    break
    return bitmap


TEMPLATE_TOP_LEFT = _template(TOP_LEFT_RECTS)
TEMPLATE_BOTTOM_RIGHT = _template(BOTTOM_RIGHT_RECTS)


def _rotate_clockwise(bitmap: np.ndarray, times: int) -> np.ndarray:
    result = bitmap
    for _ in range(times % 4):
        result = np.rot90(result, k=-1)
    return result


def _best_match(samples: np.ndarray, template: np.ndarray) -> tuple[float, int] | None:
    """Binarize luminance samples and score against four rotations of template."""
    n = template.shape[0]
    if samples.shape != (n, n):
        return None
    min_lum = float(samples.min())
    max_lum = float(samples.max())
    if max_lum - min_lum < MINIMUM_CONTRAST:
        return None
    threshold = (min_lum + max_lum) / 2
    bits = samples > threshold
    best: tuple[float, int] | None = None
    for rotation in range(4):
        rotated = _rotate_clockwise(template, rotation)
        score = float(np.mean(bits == rotated))
        if best is None or score > best[0]:
            best = (score, rotation)
    return best


def _order_quad(pts: np.ndarray) -> list[Point]:
    """Order four points as TL, TR, BR, BL in image coordinates (y down)."""
    pts = pts.reshape(4, 2).astype(float)
    sums = pts[:, 0] + pts[:, 1]
    diffs = pts[:, 0] - pts[:, 1]
    tl = pts[np.argmin(sums)]
    br = pts[np.argmax(sums)]
    tr = pts[np.argmax(diffs)]
    bl = pts[np.argmin(diffs)]
    return [(float(tl[0]), float(tl[1])), (float(tr[0]), float(tr[1])),
            (float(br[0]), float(br[1])), (float(bl[0]), float(bl[1]))]


def _rotate_quad(corners: list[Point], times: int) -> list[Point]:
    """Reorder so index 0 is the marker's printed top-left.

    If the rectified patch matched the template rotated k*90° clockwise, the
    printed top-left sits at displayed corner k (same as MarkerDetector.orientedQuad).
    """
    k = times % 4
    return [corners[(k + i) % 4] for i in range(4)]


def _quad_area(corners: list[Point]) -> float:
    # Shoelace.
    s = 0.0
    for i in range(4):
        x1, y1 = corners[i]
        x2, y2 = corners[(i + 1) % 4]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2


def _is_convex_quad(corners: list[Point]) -> bool:
    pts = np.array(corners, dtype=np.float32)
    hull = cv2.convexHull(pts)
    return hull.shape[0] == 4


def _sample_rectified(gray: np.ndarray, corners: list[Point], size: int = 48) -> np.ndarray:
    src = np.array(corners, dtype=np.float32)
    dst = np.array([[0, 0], [size - 1, 0], [size - 1, size - 1], [0, size - 1]], dtype=np.float32)
    matrix = cv2.getPerspectiveTransform(src, dst)
    warped = cv2.warpPerspective(gray, matrix, (size, size), flags=cv2.INTER_AREA)
    # Downsample to the 12x12 template grid by averaging cells.
    cell = size // HALF_UNITS
    samples = warped.reshape(HALF_UNITS, cell, HALF_UNITS, cell).mean(axis=(1, 3))
    return samples.astype(np.float64) / 255.0


def _quad_from_contour(contour, image_area: float) -> list[Point] | None:
    peri = cv2.arcLength(contour, True)
    if peri < 40:
        return None
    for eps in (0.02, 0.03, 0.04, 0.05):
        approx = cv2.approxPolyDP(contour, eps * peri, True)
        if len(approx) == 4:
            break
    else:
        # Fall back to the min-area rectangle when the contour is a rounded square.
        rect = cv2.minAreaRect(contour)
        box = cv2.boxPoints(rect)
        w_r, h_r = rect[1]
        if min(w_r, h_r) < 20:
            return None
        if max(w_r, h_r) / max(min(w_r, h_r), 1e-6) > 1.6:
            return None
        approx = box
    corners = _order_quad(np.array(approx, dtype=np.float32))
    if not _is_convex_quad(corners):
        return None
    area = _quad_area(corners)
    if area < image_area * 0.004 or area > image_area * 0.35:
        return None
    # Reject skinny quads; markers are squares.
    xs = [p[0] for p in corners]
    ys = [p[1] for p in corners]
    bw, bh = max(xs) - min(xs), max(ys) - min(ys)
    if bw < 20 or bh < 20:
        return None
    if max(bw, bh) / max(min(bw, bh), 1e-6) > 1.7:
        return None
    return corners


def _binarizations(gray: np.ndarray) -> list[np.ndarray]:
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    adaptive = cv2.adaptiveThreshold(
        blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 51, 2
    )
    _, otsu = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    edges = cv2.Canny(blurred, 40, 120)
    edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=1)
    # Invert so a black marker on a light drawer becomes a solid blob.
    return [adaptive, cv2.bitwise_not(adaptive), otsu, cv2.bitwise_not(otsu), edges]


def _find_quad_candidates(gray: np.ndarray) -> list[list[Point]]:
    """Find convex quadrilaterals that could be printed markers.

    A few pixels of padding are added first so a marker flush with the photo
    edge still forms a closed contour.
    """
    pad = 16
    padded = cv2.copyMakeBorder(gray, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=int(gray.mean()))
    h, w = padded.shape
    image_area = float(h * w)
    candidates: list[list[Point]] = []
    seen: list[tuple[int, int, float]] = []  # cx, cy, area

    def consider(corners: list[Point]) -> None:
        shifted = [(x - pad, y - pad) for x, y in corners]
        cx = int(sum(p[0] for p in shifted) / 4)
        cy = int(sum(p[1] for p in shifted) / 4)
        area = _quad_area(shifted)
        for i, (sx, sy, sarea) in enumerate(seen):
            if abs(cx - sx) < 20 and abs(cy - sy) < 20:
                if area > sarea:
                    seen[i] = (cx, cy, area)
                    candidates[i] = shifted
                return
        seen.append((cx, cy, area))
        candidates.append(shifted)

    for binary in _binarizations(padded):
        for mode in (cv2.RETR_LIST, cv2.RETR_EXTERNAL):
            contours, _ = cv2.findContours(binary, mode, cv2.CHAIN_APPROX_SIMPLE)
            for contour in contours:
                corners = _quad_from_contour(contour, image_area)
                if corners:
                    consider(corners)

    candidates.sort(key=_quad_area, reverse=True)
    return candidates[:32]


@dataclass
class DetectionResult:
    width_mm: float | None
    height_mm: float | None
    top_left: list[Point] | None
    bottom_right: list[Point] | None
    confidence: float
    confident: bool
    rms_residual_mm: float | None = None
    twist_degrees: float | None = None
    max_side_error_ratio: float | None = None
    message: str = ""


def detect_and_measure(image_bgr: np.ndarray) -> DetectionResult:
    if image_bgr is None or image_bgr.size == 0:
        return DetectionResult(
            width_mm=None, height_mm=None, top_left=None, bottom_right=None,
            confidence=0.0, confident=False, message="empty image",
        )
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY) if image_bgr.ndim == 3 else image_bgr
    candidates = _find_quad_candidates(gray)

    matches: list[tuple[float, str, list[Point], int]] = []
    for corners in candidates:
        samples = _sample_rectified(gray, corners)
        tl = _best_match(samples, TEMPLATE_TOP_LEFT)
        br = _best_match(samples, TEMPLATE_BOTTOM_RIGHT)
        if tl and tl[0] >= MINIMUM_SCORE:
            matches.append((tl[0], "topLeft", corners, tl[1]))
        if br and br[0] >= MINIMUM_SCORE:
            matches.append((br[0], "bottomRight", corners, br[1]))

    matches.sort(key=lambda m: m[0], reverse=True)
    best_tl: tuple[float, list[Point]] | None = None
    best_br: tuple[float, list[Point]] | None = None
    used: list[tuple[int, int]] = []
    for score, kind, corners, rotation in matches:
        cx = int(sum(p[0] for p in corners) / 4)
        cy = int(sum(p[1] for p in corners) / 4)
        if any(abs(cx - ux) < 20 and abs(cy - uy) < 20 for ux, uy in used):
            continue
        oriented = _rotate_quad(corners, rotation)
        if kind == "topLeft" and best_tl is None:
            best_tl = (score, oriented)
            used.append((cx, cy))
        elif kind == "bottomRight" and best_br is None:
            best_br = (score, oriented)
            used.append((cx, cy))

    top_left = refine_corners(gray, best_tl[1], generous=False) if best_tl else None
    bottom_right = refine_corners(gray, best_br[1], generous=False) if best_br else None
    score = 0.0
    if best_tl:
        score += best_tl[0]
    if best_br:
        score += best_br[0]
    confidence = score / 2 if (best_tl and best_br) else score * 0.5

    if top_left is None or bottom_right is None:
        missing = []
        if top_left is None:
            missing.append("TopLeft")
        if bottom_right is None:
            missing.append("BottomRight")
        return DetectionResult(
            width_mm=None, height_mm=None,
            top_left=top_left, bottom_right=bottom_right,
            confidence=confidence, confident=False,
            message=f"could not find marker(s): {', '.join(missing)}. Drag the corners onto the printed markers.",
        )

    measurement = measure_drawer(top_left, bottom_right)
    if measurement is None:
        return DetectionResult(
            width_mm=None, height_mm=None,
            top_left=top_left, bottom_right=bottom_right,
            confidence=confidence, confident=False,
            message="markers found but measurement failed; adjust the corners.",
        )
    return DetectionResult(
        width_mm=measurement.width_mm,
        height_mm=measurement.height_mm,
        top_left=top_left,
        bottom_right=bottom_right,
        confidence=confidence,
        confident=measurement.confident,
        rms_residual_mm=measurement.rms_residual_mm,
        twist_degrees=measurement.twist_degrees,
        max_side_error_ratio=measurement.max_side_error_ratio,
        message="" if measurement.confident else "low confidence — drag the corner handles onto the printed marker corners.",
    )


# Minimum luminance gradient (0...255) for an edge transition to count.
_EDGE_GRADIENT_MIN = 18.0


def _sample_bilinear(gray_f: np.ndarray, xs: np.ndarray, ys: np.ndarray) -> np.ndarray:
    """Bilinear samples at float coordinates, clamped to the image bounds."""
    return cv2.remap(
        gray_f,
        xs.astype(np.float32),
        ys.astype(np.float32),
        interpolation=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REPLICATE,
    )


def _quad_is_positively_oriented(corners: list[Point]) -> bool:
    """Shoelace sign for the TL/TR/BR/BL order in image coords (y down)."""
    s = 0.0
    for i in range(4):
        x1, y1 = corners[i]
        x2, y2 = corners[(i + 1) % 4]
        s += x1 * y2 - x2 * y1
    return s >= 0


def _localize_edges_along_side(
    gray_f: np.ndarray,
    a: Point,
    b: Point,
    inward: Point,
    radius: float,
) -> list[Point]:
    """Sub-pixel edge points along the side a-b.

    Samples a stations x offsets grid along the side's inward normal and, per
    station, picks the strongest transition that goes light -> dark toward
    the marker interior (the outer edge's polarity). This keeps the search
    from latching onto the white artwork inside the marker. Falls back to the
    strongest unsigned transition when nothing has the expected polarity.
    """
    step = 0.5
    stations = 25
    ts = 0.12 + 0.76 * np.arange(stations) / (stations - 1)
    base_x = a[0] + (b[0] - a[0]) * ts
    base_y = a[1] + (b[1] - a[1]) * ts

    offsets = np.arange(-radius, radius + step / 2, step)
    nx, ny = inward
    px = base_x[:, None] + nx * offsets[None, :]
    py = base_y[:, None] + ny * offsets[None, :]
    ahead = _sample_bilinear(gray_f, px + nx, py + ny)
    behind = _sample_bilinear(gray_f, px - nx, py - ny)
    # signed < 0 where luminance drops going inward: the marker's outer edge.
    signed = ahead - behind

    points: list[Point] = []
    for s in range(stations):
        g = signed[s]
        peak = int(np.argmin(g))
        if g[peak] > -_EDGE_GRADIENT_MIN:
            grad_abs = np.abs(g)
            peak = int(np.argmax(grad_abs))
            if grad_abs[peak] <= _EDGE_GRADIENT_MIN:
                continue
        grad = np.abs(g)

        # Contiguous bump above half the peak; centroid = blur-symmetric
        # midpoint of the edge (same localization as the iOS detector).
        floor_level = grad[peak] / 2
        lo = hi = peak
        while lo > 0 and grad[lo - 1] >= floor_level:
            lo -= 1
        while hi < len(grad) - 1 and grad[hi + 1] >= floor_level:
            hi += 1

        sub_offset = float(offsets[peak])
        if hi - lo >= 2:
            weights = grad[lo : hi + 1] - floor_level
            weight_sum = float(weights.sum())
            if weight_sum > 1e-9:
                sub_offset = float((weights * offsets[lo : hi + 1]).sum() / weight_sum)
        elif 0 < peak < len(grad) - 1:
            g0, g1, g2 = float(grad[peak - 1]), float(grad[peak]), float(grad[peak + 1])
            denom = g0 - 2 * g1 + g2
            if abs(denom) > 1e-9:
                shift = min(max(0.5 * (g0 - g2) / denom, -1), 1)
                sub_offset += step * shift
        points.append(
            (float(base_x[s] + nx * sub_offset), float(base_y[s] + ny * sub_offset))
        )
    return points


def _fit_line(points: list[Point]) -> tuple[Point, Point]:
    n = len(points)
    cx = sum(p[0] for p in points) / n
    cy = sum(p[1] for p in points) / n
    sxx = sxy = syy = 0.0
    for x, y in points:
        dx, dy = x - cx, y - cy
        sxx += dx * dx
        sxy += dx * dy
        syy += dy * dy
    theta = 0.5 * math.atan2(2 * sxy, sxx - syy)
    return (cx, cy), (math.cos(theta), math.sin(theta))


def _fit_line_robust(points: list[Point]) -> tuple[Point, Point] | None:
    """Total-least-squares line with one outlier-trim pass.

    A station that latched onto artwork or a shadow shows up as a residual
    outlier relative to the median; drop those and refit.
    """
    if len(points) < 6:
        return None
    (cx, cy), (dx, dy) = _fit_line(points)
    residuals = [abs((x - cx) * dy - (y - cy) * dx) for x, y in points]
    med = sorted(residuals)[len(residuals) // 2]
    cutoff = max(1.0, 3 * med)
    inliers = [p for p, r in zip(points, residuals) if r <= cutoff]
    if len(inliers) < 6:
        return None
    if len(inliers) < len(points):
        return _fit_line(inliers)
    return (cx, cy), (dx, dy)


def _intersect(l1: tuple[Point, Point], l2: tuple[Point, Point]) -> Point | None:
    p1, d1 = l1
    p2, d2 = l2
    det = d1[0] * d2[1] - d1[1] * d2[0]
    if abs(det) <= 1e-9:
        return None
    dx, dy = p2[0] - p1[0], p2[1] - p1[1]
    t = (dx * d2[1] - dy * d2[0]) / det
    return (p1[0] + t * d1[0], p1[1] + t * d1[1])


def _refine_once(
    gray_f: np.ndarray, corners: list[Point], radius_factor: float
) -> list[Point] | None:
    """One snap pass: locate each side's edge line, intersect adjacent lines.

    `radius_factor` is the normal-search radius as a fraction of each side's
    length, so the capture range scales with the marker size in the photo.
    """
    orientation = 1.0 if _quad_is_positively_oriented(corners) else -1.0
    lines = []
    for i in range(4):
        a, b = corners[i], corners[(i + 1) % 4]
        side = math.hypot(b[0] - a[0], b[1] - a[1])
        if side <= 8:
            return None
        direction = ((b[0] - a[0]) / side, (b[1] - a[1]) / side)
        # For the printed TL/TR/BR/BL order the quad is clockwise in image
        # coordinates and (-dy, dx) points into the marker.
        inward = (-direction[1] * orientation, direction[0] * orientation)
        radius = max(3.0, side * radius_factor)
        points = _localize_edges_along_side(gray_f, a, b, inward, radius)
        line = _fit_line_robust(points)
        if line is None:
            return None
        lines.append(line)

    refined: list[Point] = []
    for i in range(4):
        point = _intersect(lines[(i + 3) % 4], lines[i])
        if point is None:
            return None
        refined.append(point)
    return refined


def refine_corners(gray: np.ndarray, corners: list[Point], generous: bool = False) -> list[Point]:
    """Snap a marker quad onto nearby printed edges.

    `generous` (the Auto Adjust button) starts with a wide, side-relative
    capture pass so hand-placed outlines well off the marker still lock on;
    detection-time refinement uses a tight radius. Later iterations always
    use the tight radius so the snap converges to a fixed point. Returns the
    input unchanged when no consistent edge is found.
    """
    if len(corners) != 4:
        return corners
    gray_f = gray.astype(np.float32) if gray.dtype != np.float32 else gray
    mean_side = sum(
        math.hypot(
            corners[(i + 1) % 4][0] - corners[i][0],
            corners[(i + 1) % 4][1] - corners[i][1],
        )
        for i in range(4)
    ) / 4
    max_shift = max(60.0, mean_side * 0.35) if generous else max(25.0, mean_side * 0.12)

    current = list(corners)
    started = False
    for iteration in range(6):
        if iteration == 0 and generous:
            # Wide capture pass; if it misses, try once more even wider.
            refined = _refine_once(gray_f, current, radius_factor=0.18)
            if refined is None:
                refined = _refine_once(gray_f, current, radius_factor=0.30)
        else:
            refined = _refine_once(gray_f, current, radius_factor=0.05)
        if refined is None:
            return current if started else corners
        if any(
            math.hypot(refined[i][0] - corners[i][0], refined[i][1] - corners[i][1]) > max_shift
            for i in range(4)
        ):
            return current if started else corners
        delta = max(
            math.hypot(refined[i][0] - current[i][0], refined[i][1] - current[i][1])
            for i in range(4)
        )
        current = refined
        started = True
        if delta < 0.05:
            break
    return current


def _score_quad(gray: np.ndarray, corners: list[Point], template: np.ndarray) -> float:
    """How well the rectified quad matches the marker template (0...1)."""
    samples = _sample_rectified(gray, corners)
    match = _best_match(samples, template)
    return match[0] if match else 0.0


def _redetect_near(
    gray: np.ndarray, corners: list[Point], template: np.ndarray
) -> list[Point] | None:
    """Re-run marker detection in a window around a hand-placed outline.

    Rescues Auto Adjust when the outline is too far off for edge snapping:
    crop generously around the quad, find candidate quads, keep the one that
    best matches the expected template, then snap it for sub-pixel accuracy.
    """
    h, w = gray.shape[:2]
    xs = [p[0] for p in corners]
    ys = [p[1] for p in corners]
    span = max(max(xs) - min(xs), max(ys) - min(ys), 40.0)
    margin = max(span * 0.9, 80.0)
    x0 = int(max(0, min(xs) - margin))
    y0 = int(max(0, min(ys) - margin))
    x1 = int(min(w, max(xs) + margin))
    y1 = int(min(h, max(ys) + margin))
    if x1 - x0 < 30 or y1 - y0 < 30:
        return None
    crop = gray[y0:y1, x0:x1]

    best: tuple[float, list[Point]] | None = None
    for candidate in _find_quad_candidates(crop):
        match = _best_match(_sample_rectified(crop, candidate), template)
        if match and match[0] >= MINIMUM_SCORE and (best is None or match[0] > best[0]):
            best = (match[0], _rotate_quad(candidate, match[1]))
    if best is None:
        return None
    full = [(x + x0, y + y0) for x, y in best[1]]
    return refine_corners(gray, full, generous=False)


# A correctly snapped quad matches its template near-perfectly even under
# heavy blur/noise, while wrong snaps top out around 0.83, so 0.9 separates
# them cleanly.
_SNAP_ACCEPT_SCORE = 0.9


def _refine_single(
    gray: np.ndarray, corners: list[Point], template: np.ndarray, generous: bool
) -> list[Point]:
    snapped = refine_corners(gray, corners, generous=generous)
    if _score_quad(gray, snapped, template) >= _SNAP_ACCEPT_SCORE:
        return snapped
    if generous:
        redetected = _redetect_near(gray, corners, template)
        if redetected is not None:
            return redetected
    # Neither snap nor re-detection produced a convincing marker. Keep the
    # snap only if it clearly resembles the marker more than the hand-placed
    # outline; otherwise leave the user's outline untouched.
    if _score_quad(gray, snapped, template) > _score_quad(gray, corners, template) + 0.02:
        return snapped
    return list(corners)


def refine_markers(
    image_bgr: np.ndarray,
    top_left: list[Point] | None,
    bottom_right: list[Point] | None,
    generous: bool = True,
) -> tuple[list[Point] | None, list[Point] | None]:
    """Snap both quads onto printed marker edges. Used by Auto Adjust."""
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY) if image_bgr.ndim == 3 else image_bgr
    tl = (
        _refine_single(gray, top_left, TEMPLATE_TOP_LEFT, generous)
        if top_left
        else None
    )
    br = (
        _refine_single(gray, bottom_right, TEMPLATE_BOTTOM_RIGHT, generous)
        if bottom_right
        else None
    )
    return tl, br


def render_marker(rects, pixels: int = 240) -> np.ndarray:
    """Black square with white rects, used by tests to synthesize a drawer photo."""
    img = np.zeros((pixels, pixels), dtype=np.uint8)
    unit = pixels / GRID_UNITS
    for rx, ry, rw, rh in rects:
        x0 = int(round(rx * unit))
        y0 = int(round(ry * unit))
        x1 = int(round((rx + rw) * unit))
        y1 = int(round((ry + rh) * unit))
        img[y0:y1, x0:x1] = 255
    return img


def synthesize_drawer(
    width_mm: float = 450,
    height_mm: float = 300,
    pixels_per_mm: float = 2.0,
    homography: list[float] | None = None,
) -> tuple[np.ndarray, list[Point], list[Point]]:
    """Render a white drawer with both markers, optionally warped by a homography.

    Returns (BGR image, top-left quad in image space, bottom-right quad).
    """
    w_px = int(round(width_mm * pixels_per_mm))
    h_px = int(round(height_mm * pixels_per_mm))
    marker_px = int(round(MARKER_SIZE_MM * pixels_per_mm))
    margin = max(24, marker_px // 8)
    canvas = np.full((h_px + 2 * margin, w_px + 2 * margin), 240, dtype=np.uint8)
    canvas[margin:margin + h_px, margin:margin + w_px] = 220
    tl_marker = render_marker(TOP_LEFT_RECTS, marker_px)
    br_marker = render_marker(BOTTOM_RIGHT_RECTS, marker_px)
    canvas[margin:margin + marker_px, margin:margin + marker_px] = tl_marker
    canvas[margin + h_px - marker_px:margin + h_px, margin + w_px - marker_px:margin + w_px] = br_marker
    bgr = cv2.cvtColor(canvas, cv2.COLOR_GRAY2BGR)

    tl_plane = [
        (float(margin), float(margin)),
        (float(margin + marker_px), float(margin)),
        (float(margin + marker_px), float(margin + marker_px)),
        (float(margin), float(margin + marker_px)),
    ]
    br_plane = [
        (float(margin + w_px - marker_px), float(margin + h_px - marker_px)),
        (float(margin + w_px), float(margin + h_px - marker_px)),
        (float(margin + w_px), float(margin + h_px)),
        (float(margin + w_px - marker_px), float(margin + h_px)),
    ]

    if homography is None:
        return bgr, tl_plane, br_plane

    h_mat = np.array(homography, dtype=np.float64).reshape(3, 3)
    src_h, src_w = bgr.shape[:2]
    corners = np.array([[0, 0], [src_w, 0], [src_w, src_h], [0, src_h]], dtype=np.float32)
    ones = np.ones((4, 1), dtype=np.float32)
    projected = (h_mat @ np.hstack([corners, ones]).T).T
    projected = projected[:, :2] / projected[:, 2:3]
    min_xy = projected.min(axis=0)
    max_xy = projected.max(axis=0)
    out_w = int(math.ceil(max_xy[0] - min_xy[0])) + 40
    out_h = int(math.ceil(max_xy[1] - min_xy[1])) + 40
    shift = np.array([[1, 0, 20 - min_xy[0]], [0, 1, 20 - min_xy[1]], [0, 0, 1]], dtype=np.float64)
    warped_h = shift @ h_mat
    warped = cv2.warpPerspective(bgr, warped_h, (out_w, out_h), borderValue=(240, 240, 240))

    def warp_pts(pts: list[Point]) -> list[Point]:
        arr = np.array(pts, dtype=np.float64)
        ones = np.ones((len(pts), 1))
        p = (warped_h @ np.hstack([arr, ones]).T).T
        p = p[:, :2] / p[:, 2:3]
        return [(float(x), float(y)) for x, y in p]

    return warped, warp_pts(tl_plane), warp_pts(br_plane)
