"""Homography + joint two-marker measurement tests.

Mirrors BOX_PROTO GridfinityScannerTests/HomographyTests.swift.
"""

from homography import Homography, SquarePose, measure_drawer


UNIT_SQUARE = [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)]


def apply_matrix(m, p):
    return Homography(m).apply(p)


class TestHomographyFit:
    def test_identity_fit(self):
        h = Homography.fit(UNIT_SQUARE, UNIT_SQUARE)
        assert h is not None
        for p in [(0.3, 0.7), (0.9, 0.1), (2.0, -1.0)]:
            mapped = h.apply(p)
            assert abs(mapped[0] - p[0]) < 1e-9
            assert abs(mapped[1] - p[1]) < 1e-9

    def test_recovers_known_perspective(self):
        truth = Homography([1.2, 0.1, 5, -0.05, 0.9, 10, 0.0005, 0.0002, 1])
        src = [(0.0, 0.0), (100.0, 0.0), (100.0, 100.0), (0.0, 100.0)]
        dst = [truth.apply(p) for p in src]
        fitted = Homography.fit(src, dst)
        assert fitted is not None
        for p in [(25.0, 60.0), (80.0, 15.0), (150.0, 200.0)]:
            expected = truth.apply(p)
            actual = fitted.apply(p)
            assert abs(actual[0] - expected[0]) < 1e-6
            assert abs(actual[1] - expected[1]) < 1e-6

    def test_degenerate_corners_return_none(self):
        collinear = [(0.0, 0.0), (1.0, 1.0), (2.0, 2.0), (0.0, 1.0)]
        assert Homography.fit(collinear, UNIT_SQUARE) is None

    def test_least_squares_matches_exact_fit(self):
        truth = Homography([1.2, 0.1, 5, -0.05, 0.9, 10, 0.0005, 0.0002, 1])
        src = [(0.0, 0.0), (100.0, 0.0), (100.0, 100.0), (0.0, 100.0)]
        dst = [truth.apply(p) for p in src]
        fitted = Homography.fit_least_squares(src, dst)
        assert fitted is not None
        for p in [(25.0, 60.0), (80.0, 15.0), (150.0, 200.0)]:
            expected = truth.apply(p)
            actual = fitted.apply(p)
            assert abs(actual[0] - expected[0]) < 1e-6
            assert abs(actual[1] - expected[1]) < 1e-6


class TestSquarePose:
    def test_recovers_pose(self):
        truth = SquarePose(theta=0.07, tx=350, ty=210)
        size = 100.0
        corners = [(0.0, 0.0), (size, 0.0), (size, size), (0.0, size)]
        mapped = [truth.apply(p) for p in corners]
        fit = SquarePose.fit_square(size, mapped)
        assert fit is not None
        pose, rms = fit
        assert abs(pose.theta - truth.theta) < 1e-9
        assert abs(pose.tx - truth.tx) < 1e-6
        assert abs(pose.ty - truth.ty) < 1e-6
        assert abs(rms) < 1e-6


class TestPhotoMeasurer:
    def test_recovers_size_under_perspective(self):
        plane_to_image = Homography([3.1, 0.4, 220, -0.2, 2.8, 180, 0.0006, 0.0004, 1])
        size = 100.0
        tl_plane = [(0.0, 0.0), (size, 0.0), (size, size), (0.0, size)]
        br_plane = [(350.0, 200.0), (450.0, 200.0), (450.0, 300.0), (350.0, 300.0)]
        top_left = [plane_to_image.apply(p) for p in tl_plane]
        bottom_right = [plane_to_image.apply(p) for p in br_plane]
        result = measure_drawer(top_left, bottom_right)
        assert result is not None
        assert abs(result.width_mm - 450) < 0.1
        assert abs(result.height_mm - 300) < 0.1
        assert result.max_side_error_ratio < 0.01
        assert result.confident

    def test_flags_inconsistent_quads(self):
        plane_to_image = Homography([3.1, 0.4, 220, -0.2, 2.8, 180, 0.0006, 0.0004, 1])
        size = 100.0
        tl_plane = [(0.0, 0.0), (size, 0.0), (size, size), (0.0, size)]
        br_plane = [(390.0, 240.0), (450.0, 240.0), (450.0, 300.0), (390.0, 300.0)]
        top_left = [plane_to_image.apply(p) for p in tl_plane]
        bottom_right = [plane_to_image.apply(p) for p in br_plane]
        result = measure_drawer(top_left, bottom_right)
        assert result is not None
        assert result.max_side_error_ratio > 0.12
        assert not result.confident
