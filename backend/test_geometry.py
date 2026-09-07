"""Tests for the CAD-free spec math. Run with `pytest` from backend/."""

import pytest

from geometry import (
    ContainerSpec,
    clamped_pocket_depth,
    max_pocket_depth,
    pocket_centers,
    safe_filename,
)


def make_spec(**overrides):
    base = dict(
        id="t1",
        name="AA Batteries",
        kind="cyl_pockets",
        length_u=2,
        width_u=2,
        height_u=7,
        pocket_rows=4,
        pocket_cols=4,
        pocket_diam_mm=15.5,
        pocket_depth_mm=38.5,
    )
    base.update(overrides)
    return ContainerSpec(**base)


class TestValidation:
    def test_valid_cylinder_holder(self):
        assert make_spec().validate() == []

    def test_valid_bin(self):
        spec = make_spec(kind="bin", length_div=2, width_div=1, scoops=True)
        assert spec.validate() == []

    def test_valid_spool(self):
        spec = make_spec(kind="spool")
        assert spec.validate() == []

    def test_unknown_kind(self):
        problems = make_spec(kind="teleporter").validate()
        assert any("unknown kind" in p for p in problems)

    def test_footprint_out_of_range(self):
        problems = make_spec(length_u=0).validate()
        assert any("footprint" in p for p in problems)
        problems = make_spec(width_u=13).validate()
        assert any("footprint" in p for p in problems)

    def test_pocket_grid_required(self):
        problems = make_spec(pocket_rows=0).validate()
        assert any("pocket grid" in p for p in problems)

    def test_rect_pockets_need_dimensions(self):
        spec = make_spec(kind="rect_pockets", pocket_diam_mm=0)
        problems = spec.validate()
        assert any("rectangular" in p for p in problems)

    def test_overpacked_grid_rejected(self):
        # 10x10 pockets of 15.5 mm cannot fit a 2x2 unit footprint.
        problems = make_spec(pocket_rows=10, pocket_cols=10).validate()
        assert any("do not fit" in p for p in problems)


class TestPocketCenters:
    def test_count_and_bounds(self):
        spec = make_spec()
        centers = pocket_centers(spec)
        assert len(centers) == 16
        # All centers must leave room for the pocket radius plus the edge wall.
        half = spec.length_u * 42.0 / 2
        for cx, cy in centers:
            assert abs(cx) + spec.pocket_diam_mm / 2 < half
            assert abs(cy) + spec.pocket_diam_mm / 2 < half

    def test_grid_is_symmetric(self):
        centers = pocket_centers(make_spec())
        xs = sorted({round(c[0], 6) for c in centers})
        assert xs == sorted(-x for x in xs)

    def test_single_pocket_is_centered(self):
        spec = make_spec(pocket_rows=1, pocket_cols=1)
        assert pocket_centers(spec) == [(0.0, 0.0)]

    def test_too_tight_raises(self):
        spec = make_spec(pocket_rows=10, pocket_cols=10)
        with pytest.raises(ValueError):
            pocket_centers(spec)


class TestDepth:
    def test_depth_clamped_to_keep_floor(self):
        spec = make_spec(height_u=4, pocket_depth_mm=100)
        assert clamped_pocket_depth(spec) == max_pocket_depth(spec) == 4 * 7 - 8

    def test_requested_depth_kept_when_it_fits(self):
        spec = make_spec(height_u=7, pocket_depth_mm=38.5)
        assert clamped_pocket_depth(spec) == 38.5


class TestFilenames:
    def test_name_is_sanitized(self):
        spec = make_spec(name="AA Batteries (drawer #2)")
        assert safe_filename(spec) == "AA_Batteries__drawer__2_2x2x7.stl"

    def test_empty_name_falls_back(self):
        spec = make_spec(name="///")
        assert safe_filename(spec) == "container_2x2x7.stl"
