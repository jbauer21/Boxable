"""3MF writer tests — no CAD kernel required (uses dummy meshes)."""

import zipfile
from io import BytesIO
from xml.etree import ElementTree as ET

from geometry import ContainerSpec
from threemf import baseplate_key, build_3mf, geometry_key


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
    # 3MF spec: identity 3x3, then translation in m30 m31 m32.
    assert transform[0:9] == ["1", "0", "0", "0", "1", "0", "0", "0", "1"]
    assert transform[11] == "0"


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
    # 90° about z as 3MF row-vector matrix: x'=-y+ey+dx, y'=x+dy, z'=z
    assert transform[0:9] == ["0", "1", "0", "-1", "0", "0", "0", "0", "1"]
    assert transform[11] == "0"


def _apply_3mf(transform: str, x: float, y: float, z: float) -> tuple[float, float, float]:
    m00, m01, m02, m10, m11, m12, m20, m21, m22, m30, m31, m32 = (
        float(v) for v in transform.split()
    )
    return (
        x * m00 + y * m10 + z * m20 + m30,
        x * m01 + y * m11 + z * m21 + m31,
        x * m02 + y * m12 + z * m22 + m32,
    )


def test_unrotated_transform_translates_vertices():
    spec = _spec()
    mesh = _mesh(sx=80, sy=40, sz=21)
    payload = build_3mf([(spec, 1, 0, False)], {geometry_key(spec): mesh})
    transform = _parse_model(payload).find("m:build/m:item", NS).get("transform")
    # col=1, unrotated 2×1 bin on a 42 mm grid, 80×40 mm mesh → dx=44, dy=1.
    x, y, z = _apply_3mf(transform, 0, 0, 0)
    assert (round(x, 4), round(y, 4), round(z, 4)) == (44.0, 1.0, 0.0)
    x, y, z = _apply_3mf(transform, 80, 40, 21)
    assert (round(x, 4), round(y, 4), round(z, 4)) == (124.0, 41.0, 21.0)


def test_unit_is_millimeter():
    spec = _spec()
    payload = build_3mf([(spec, 0, 0, False)], {geometry_key(spec): _mesh()})
    root = _parse_model(payload)
    assert root.get("unit") == "millimeter"


def test_baseplates_share_mesh_and_place_on_grid():
    spec = _spec()
    mesh = _mesh()
    plate = _mesh(sx=210, sy=210, sz=5)
    payload = build_3mf(
        [(spec, 0, 0, False)],
        {geometry_key(spec): mesh},
        [(5, 5, 0, 0), (5, 5, 5, 0), (2, 1, 0, 5)],
        {baseplate_key(5, 5): plate, baseplate_key(2, 1): _mesh(sx=84, sy=42, sz=5)},
    )
    root = _parse_model(payload)
    objects = root.findall("m:resources/m:object", NS)
    assert len(objects) == 3
    names = [obj.get("name") for obj in objects]
    assert names[0] == "AA Batteries"
    assert "Baseplate 5×5" in names
    assert "Baseplate 2×1" in names
    items = root.findall("m:build/m:item", NS)
    assert len(items) == 4
    plate_ids = {objects[i].get("id") for i, name in enumerate(names) if name.startswith("Baseplate")}
    plate_items = [item for item in items if item.get("objectid") in plate_ids]
    assert len(plate_items) == 3
    five_id = next(obj.get("id") for obj in objects if obj.get("name") == "Baseplate 5×5")
    five_items = [item for item in plate_items if item.get("objectid") == five_id]
    assert len(five_items) == 2
    origins = [
        _apply_3mf(item.get("transform"), 0, 0, 0) for item in five_items
    ]
    assert (0.0, 0.0, 0.0) in {(round(x, 4), round(y, 4), round(z, 4)) for x, y, z in origins}
    assert (210.0, 0.0, 0.0) in {(round(x, 4), round(y, 4), round(z, 4)) for x, y, z in origins}


def test_baseplates_only_without_containers():
    plate = _mesh(sx=168, sy=126, sz=5)
    payload = build_3mf(
        [],
        {},
        [(4, 3, 0, 0)],
        {baseplate_key(4, 3): plate},
    )
    root = _parse_model(payload)
    objects = root.findall("m:resources/m:object", NS)
    assert len(objects) == 1
    assert objects[0].get("name") == "Baseplate 4×3"
    items = root.findall("m:build/m:item", NS)
    assert len(items) == 1
