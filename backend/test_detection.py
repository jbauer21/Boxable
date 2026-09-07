"""Marker detection on a synthetically rendered drawer photo."""

import cv2
import numpy as np

from detection import (
    BOTTOM_RIGHT_RECTS,
    TOP_LEFT_RECTS,
    detect_and_measure,
    refine_corners,
    refine_markers,
    render_marker,
    synthesize_drawer,
)
from homography import Homography


def test_templates_are_distinct():
    tl = render_marker(TOP_LEFT_RECTS, 48)
    br = render_marker(BOTTOM_RIGHT_RECTS, 48)
    assert not np.array_equal(tl, br)
    assert tl.min() == 0 and tl.max() == 255


def test_detects_axis_aligned_drawer():
    image, _, _ = synthesize_drawer(width_mm=450, height_mm=300, pixels_per_mm=2.0)
    result = detect_and_measure(image)
    assert result.top_left is not None
    assert result.bottom_right is not None
    assert result.width_mm is not None
    assert result.height_mm is not None
    assert abs(result.width_mm - 450) <= 8
    assert abs(result.height_mm - 300) <= 8
    assert result.confident


def test_detects_perspective_drawer():
    # Mild perspective similar to the iOS test fixture.
    h = Homography([1.05, 0.08, 40, -0.04, 1.02, 30, 0.00008, 0.00005, 1])
    image, _, _ = synthesize_drawer(
        width_mm=450,
        height_mm=300,
        pixels_per_mm=2.0,
        homography=h.m,
    )
    result = detect_and_measure(image)
    assert result.top_left is not None, result.message
    assert result.bottom_right is not None, result.message
    assert result.width_mm is not None
    assert result.height_mm is not None
    assert abs(result.width_mm - 450) <= 8
    assert abs(result.height_mm - 300) <= 8


def test_empty_image_has_no_markers():
    blank = np.full((200, 300, 3), 200, dtype=np.uint8)
    result = detect_and_measure(blank)
    assert result.top_left is None
    assert result.bottom_right is None
    assert not result.confident


def test_decode_roundtrip_png():
    image, _, _ = synthesize_drawer(width_mm=420, height_mm=252, pixels_per_mm=1.5)
    ok, encoded = cv2.imencode(".png", image)
    assert ok
    decoded = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
    result = detect_and_measure(decoded)
    assert result.width_mm is not None
    assert abs(result.width_mm - 420) <= 8
    assert abs(result.height_mm - 252) <= 8


def _inset(quad, pixels=8):
    cx = sum(p[0] for p in quad) / 4
    cy = sum(p[1] for p in quad) / 4
    out = []
    for x, y in quad:
        dx, dy = cx - x, cy - y
        length = (dx * dx + dy * dy) ** 0.5
        out.append((x + dx / length * pixels, y + dy / length * pixels))
    return out


def test_refine_snaps_inset_quad_to_marker_edges():
    image, true_tl, _ = synthesize_drawer(width_mm=450, height_mm=300, pixels_per_mm=2.0)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    inset = _inset(true_tl, 10)
    before = max(
        ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5 for a, b in zip(inset, true_tl)
    )
    snapped = refine_corners(gray, inset, generous=True)
    after = max(
        ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5 for a, b in zip(snapped, true_tl)
    )
    assert after < before
    assert after <= 2.5


def test_refine_markers_moves_both_quads():
    image, true_tl, true_br = synthesize_drawer(width_mm=450, height_mm=300, pixels_per_mm=2.0)
    tl, br = refine_markers(image, _inset(true_tl, 10), _inset(true_br, 10), generous=True)
    assert tl is not None and br is not None
    for snapped, truth in ((tl, true_tl), (br, true_br)):
        err = max(((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5 for a, b in zip(snapped, truth))
        assert err <= 2.5


def _offset(quad, dx, dy):
    return [(x + dx, y + dy) for x, y in quad]


def test_refine_recovers_from_far_offsets_under_blur_and_perspective():
    # Hand-placed outlines can be well off the marker; refine must still lock
    # on. Perspective + blur + noise simulates a real phone photo.
    h = Homography([1.05, 0.08, 40, -0.04, 1.02, 30, 0.00008, 0.00005, 1])
    image, true_tl, true_br = synthesize_drawer(450, 300, 4.0, homography=h.m)
    image = cv2.GaussianBlur(image, (5, 5), 0)
    rng = np.random.default_rng(3)
    image = np.clip(
        image.astype(np.int16) + rng.normal(0, 5, image.shape).astype(np.int16), 0, 255
    ).astype(np.uint8)
    for dx, dy in ((30, -25), (-40, 35), (55, 50)):
        tl, br = refine_markers(
            image, _offset(true_tl, dx, dy), _offset(true_br, -dx, -dy), generous=True
        )
        for snapped, truth in ((tl, true_tl), (br, true_br)):
            err = max(
                ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5
                for a, b in zip(snapped, truth)
            )
            assert err <= 2.5, f"offset ({dx},{dy}) err {err:.1f}px"


def test_refine_leaves_outline_alone_when_no_marker_nearby():
    # Outline over bare drawer floor: refine must not invent a snap.
    image, _, _ = synthesize_drawer(width_mm=450, height_mm=300, pixels_per_mm=2.0)
    center_quad = [(420.0, 260.0), (520.0, 260.0), (520.0, 360.0), (420.0, 360.0)]
    tl, _ = refine_markers(image, center_quad, None, generous=True)
    drift = max(
        ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5 for a, b in zip(tl, center_quad)
    )
    assert drift <= 5.0
