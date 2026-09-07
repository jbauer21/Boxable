"""3MF writer tests — no CAD kernel required (uses dummy meshes)."""

import zipfile
from io import BytesIO
from xml.etree import ElementTree as ET

from geometry import ContainerSpec
from threemf import build_3mf, geometry_key


def _spec(**overrides):
    base = dict(
        id="a",
        name="AA Batteries",
        kind="bin",
        length_u=2,
        width_u=1,
        height_u=3,
    )
    base.update(overrides)
    return ContainerSpec(**base)


def _mesh(sx=80.0, sy=40.0, sz=21.0):
    vertices = [
        (0, 0, 0), (sx, 0, 0), (sx, sy, 0), (0, sy, 0),
        (0, 0, sz), (sx, 0, sz), (sx, sy, sz), (0, sy, sz),
    ]
    triangles = [
        (0, 1, 2), (0, 2, 3),
        (4, 6, 5), (4, 7, 6),
        (0, 4, 5), (0, 5, 1),
        (1, 5, 6), (1, 6, 2),
        (2, 6, 7), (2, 7, 3),
        (3, 7, 4), (3, 4, 0),
    ]
    return vertices, triangles, (sx, sy, sz)


NS = {"m": "http://schemas.microsoft.com/3dmanufacturing/core/2015/02"}


def _parse_model(payload: bytes):
    with zipfile.ZipFile(BytesIO(payload)) as archive:
        names = set(archive.namelist())
        assert "[Content_Types].xml" in names
        assert "_rels/.rels" in names
        assert "3D/3dmodel.model" in names
        xml = archive.read("3D/3dmodel.model")
    return ET.fromstring(xml)


def test_geometry_key_ignores_id_and_quantity():
    a = _spec(id="1", quantity=2)
    b = _spec(id="2", quantity=9)
    assert geometry_key(a) == geometry_key(b)


def test_single_unrotated_object():
    spec = _spec()
    mesh = _mesh()
    payload = build_3mf([(spec, 0, 0, False)], {geometry_key(spec): mesh})
    root = _parse_model(payload)
    objects = root.findall("m:resources/m:object", NS)
    assert len(objects) == 1
    assert objects[0].get("name") == "AA Batteries"
    verts = objects[0].findall("m:mesh/m:vertices/m:vertex", NS)
    assert len(verts) == 8
    items = root.findall("m:build/m:item", NS)
    assert len(items) == 1
    assert items[0].get("objectid") == "1"
    transform = items[0].get("transform").split()
    assert len(transform) == 12
    # Unrotated: identity linear part.
    assert transform[0:3] == ["1", "0", "0"]
    assert transform[4:7] == ["0", "1", "0"]
    assert transform[8:11] == ["0", "0", "1"]


def test_identical_geometry_shared_object():
    a = _spec(id="a")
    b = _spec(id="b")
    mesh = _mesh()
    payload = build_3mf(
        [(a, 0, 0, False), (b, 2, 0, False)],
        {geometry_key(a): mesh},
    )
    root = _parse_model(payload)
    assert len(root.findall("m:resources/m:object", NS)) == 1
    items = root.findall("m:build/m:item", NS)
    assert len(items) == 2
    assert items[0].get("objectid") == items[1].get("objectid") == "1"


def test_rotated_transform_swaps_axes():
    spec = _spec()
    mesh = _mesh(sx=80, sy=40, sz=21)
    payload = build_3mf([(spec, 1, 2, True)], {geometry_key(spec): mesh})
    root = _parse_model(payload)
    transform = root.find("m:build/m:item", NS).get("transform").split()
    # 90° about z: [0, -1, 0, ...], [1, 0, 0, ...], [0, 0, 1, 0]
    assert transform[0:3] == ["0", "-1", "0"]
    assert transform[4:7] == ["1", "0", "0"]
    assert transform[8:12] == ["0", "0", "1", "0"]


def test_unit_is_millimeter():
    spec = _spec()
    payload = build_3mf([(spec, 0, 0, False)], {geometry_key(spec): _mesh()})
    root = _parse_model(payload)
    assert root.get("unit") == "millimeter"
