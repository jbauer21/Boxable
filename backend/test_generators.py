"""CAD generator tests — requires cadquery / cq-gridfinity."""

from geometry import ContainerSpec
from generators import (
    _MESH_CACHE,
    _fit_engrave_label,
    _build_bin,
    build_container,
    tessellate_container,
)


def _bin(**overrides):
    base = dict(
        id="a",
        name="Fork",
        kind="bin",
        length_u=2,
        width_u=1,
        height_u=3,
    )
    base.update(overrides)
    return ContainerSpec(**base)


def test_fit_engrave_label_passes_short_names():
    assert _fit_engrave_label("Fork", 40.0, 6.0) == "Fork"


def test_fit_engrave_label_truncates_long_names():
    label = _fit_engrave_label("Very Long Utensil Name", 20.0, 8.0)
    assert label.endswith("…")
    assert len(label) < len("Very Long Utensil Name")


def test_engrave_reduces_volume():
    """Cutting text into a side wall removes solid material."""
    _MESH_CACHE.clear()
    spec = _bin(name="Fork")
    plain_vol = _build_bin(spec).val().Volume()
    engraved_vol = build_container(spec).val().Volume()
    assert engraved_vol < plain_vol


def test_different_names_produce_different_meshes():
    _MESH_CACHE.clear()
    a = tessellate_container(_bin(id="1", name="Fork"))
    b = tessellate_container(_bin(id="2", name="Knife"))
    assert a[1] != b[1] or a[0] != b[0]


def test_empty_name_skips_engraving():
    _MESH_CACHE.clear()
    named_vol = build_container(_bin(name="Fork")).val().Volume()
    blank_vol = build_container(_bin(name="   ")).val().Volume()
    plain_vol = _build_bin(_bin(name="   ")).val().Volume()
    assert abs(blank_vol - plain_vol) < 1e-6
    assert named_vol < blank_vol


def test_pocket_holder_engraves_once_on_side():
    """Multi-slot holders get one side label, not per-pocket floor marks."""
    from generators import _build_pocket_holder

    _MESH_CACHE.clear()
    spec = ContainerSpec(
        id="aa",
        name="AA Batteries",
        kind="cyl_pockets",
        length_u=2,
        width_u=1,
        height_u=3,
        pocket_rows=1,
        pocket_cols=4,
        pocket_depth_mm=12,
        pocket_diam_mm=14.5,
    )
    plain = _build_pocket_holder(spec)
    engraved = build_container(spec)
    delta = plain.val().Volume() - engraved.val().Volume()
    assert delta > 1.0
    # One label of this size removes tens of mm³, not hundreds (× pockets).
    assert delta < 120.0


def test_labels_flag_still_defaults_off_in_bin_builder():
    """Paper-label flange must stay off; engraving is separate."""
    solid = build_container(_bin(labels=False))
    assert solid.val().Volume() > 0
