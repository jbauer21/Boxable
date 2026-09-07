"""Write a 3MF archive from tessellated Gridfinity containers.

The 3MF is a zip with:
  [Content_Types].xml
  _rels/.rels
  3D/3dmodel.model

Identical geometries are stored once as <object> meshes; each packed
placement becomes a <build><item> with a 4x3 transform that moves the
mesh into drawer coordinates (x along columns, y along rows, z up, mm).
"""

from __future__ import annotations

import io
import zipfile
from dataclasses import asdict
from xml.sax.saxutils import escape

from geometry import GRID_UNIT_MM, ContainerSpec

CONTENT_TYPES = """\
<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>
"""

RELS = """\
<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>
"""


def geometry_key(spec: ContainerSpec) -> str:
    fields = asdict(spec)
    fields.pop("id")
    fields.pop("quantity")
    fields.pop("errors", None)
    return repr(sorted(fields.items()))


def _fmt(value: float) -> str:
    return f"{value:.4f}".rstrip("0").rstrip(".")


def _mesh_xml(vertices, triangles) -> str:
    verts = "\n".join(
        f'          <vertex x="{_fmt(x)}" y="{_fmt(y)}" z="{_fmt(z)}"/>'
        for x, y, z in vertices
    )
    tris = "\n".join(
        f'          <triangle v1="{a}" v2="{b}" v3="{c}"/>'
        for a, b, c in triangles
    )
    return (
        "      <mesh>\n"
        "        <vertices>\n"
        f"{verts}\n"
        "        </vertices>\n"
        "        <triangles>\n"
        f"{tris}\n"
        "        </triangles>\n"
        "      </mesh>"
    )


def _placement_offset(spec: ContainerSpec, col: int, row: int, rotated: bool,
                      extents: tuple[float, float, float]) -> tuple[float, float]:
    if rotated:
        span_x = spec.width_u * GRID_UNIT_MM
        span_y = spec.length_u * GRID_UNIT_MM
        extent_x, extent_y = extents[1], extents[0]
    else:
        span_x = spec.length_u * GRID_UNIT_MM
        span_y = spec.width_u * GRID_UNIT_MM
        extent_x, extent_y = extents[0], extents[1]
    dx = col * GRID_UNIT_MM + (span_x - extent_x) / 2
    dy = row * GRID_UNIT_MM + (span_y - extent_y) / 2
    return dx, dy


def _transform(dx: float, dy: float, rotated: bool, extents: tuple[float, float, float]) -> str:
    """4x3 row-major transform: 90° about z when rotated, then translate.

    Rotation maps (x, y, z) -> (extent_y - y, x, z) so the mesh's y extent
    becomes the x extent, matching the /preview endpoint.
    """
    if rotated:
        return (
            f"0 -1 0 {_fmt(extents[1] + dx)} "
            f"1 0 0 {_fmt(dy)} "
            f"0 0 1 0"
        )
    return f"1 0 0 {_fmt(dx)} 0 1 0 {_fmt(dy)} 0 0 1 0"


def build_3mf(
    items: list[tuple[ContainerSpec, int, int, bool]],
    meshes: dict[str, tuple],
) -> bytes:
    """Assemble a 3MF from placed containers.

    `items` is (spec, col, row, rotated) for each packed instance.
    `meshes` maps geometry_key(spec) -> (vertices, triangles, extents).
    """
    key_to_id: dict[str, int] = {}
    object_xml: list[str] = []
    for spec, *_ in items:
        key = geometry_key(spec)
        if key in key_to_id:
            continue
        oid = len(key_to_id) + 1
        key_to_id[key] = oid
        vertices, triangles, _ = meshes[key]
        object_xml.append(
            f'    <object id="{oid}" name="{escape(spec.name)}" type="model">\n'
            f"{_mesh_xml(vertices, triangles)}\n"
            "    </object>"
        )

    build_items = []
    for spec, col, row, rotated in items:
        key = geometry_key(spec)
        oid = key_to_id[key]
        extents = meshes[key][2]
        dx, dy = _placement_offset(spec, col, row, rotated, extents)
        transform = _transform(dx, dy, rotated, extents)
        build_items.append(f'      <item objectid="{oid}" transform="{transform}"/>')

    model = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<model unit="millimeter" xml:lang="en-US" '
        'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n'
        "  <metadata name=\"Application\">Boxable</metadata>\n"
        "  <resources>\n"
        + "\n".join(object_xml)
        + "\n  </resources>\n"
        "  <build>\n"
        + "\n".join(build_items)
        + "\n  </build>\n"
        "</model>\n"
    )

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", CONTENT_TYPES)
        archive.writestr("_rels/.rels", RELS)
        archive.writestr("3D/3dmodel.model", model)
    return buffer.getvalue()
