"""HTTP-level tests for /measure (no CAD kernel)."""

import json

import cv2
from fastapi.testclient import TestClient

from detection import synthesize_drawer
from main import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["service"] == "boxable"


def test_measure_synthetic_drawer():
    image, _, _ = synthesize_drawer(width_mm=450, height_mm=300, pixels_per_mm=2.0)
    ok, encoded = cv2.imencode(".png", image)
    assert ok
    response = client.post(
        "/measure",
        files={"file": ("drawer.png", encoded.tobytes(), "image/png")},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["width_mm"] is not None
    assert data["height_mm"] is not None
    assert abs(data["width_mm"] - 450) <= 8
    assert abs(data["height_mm"] - 300) <= 8
    assert data["markers"]["topLeft"] is not None
    assert data["markers"]["bottomRight"] is not None
    assert data["image_width"] > 0


def test_refine_endpoint_snaps_inset_quads():
    image, true_tl, true_br = synthesize_drawer(width_mm=450, height_mm=300, pixels_per_mm=2.0)
    ok, encoded = cv2.imencode(".png", image)
    assert ok

    def inset(quad, pixels=10):
        cx = sum(p[0] for p in quad) / 4
        cy = sum(p[1] for p in quad) / 4
        out = []
        for x, y in quad:
            dx, dy = cx - x, cy - y
            length = (dx * dx + dy * dy) ** 0.5
            out.append([x + dx / length * pixels, y + dy / length * pixels])
        return out

    response = client.post(
        "/refine",
        files={"file": ("drawer.png", encoded.tobytes(), "image/png")},
        data={
            "topLeft": json.dumps(inset(true_tl)),
            "bottomRight": json.dumps(inset(true_br)),
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["moved"] is True
    assert data["markers"]["topLeft"] is not None
    for snapped, truth in (
        (data["markers"]["topLeft"], true_tl),
        (data["markers"]["bottomRight"], true_br),
    ):
        err = max(((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5 for a, b in zip(snapped, truth))
        assert err <= 2.5
