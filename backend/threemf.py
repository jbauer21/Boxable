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
from collections.abc import Callable
from os import PathLike
from typing import BinaryIO
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


def baseplate_key(length_u: int, width_u: int) -> str:
    return f"baseplate|{length_u}x{width_u}"


def _fmt(value: float) -> str:
    return f"{value:.4f}".rstrip("0").rstrip(".")


def _write_mesh(write, vertices, triangles):
    write("      <mesh>\n        <vertices>\n")
    for i, (x, y, z) in enumerate(vertices):
        if i:
            write("\n")
        write(f'          <vertex x="{_fmt(x)}" y="{_fmt(y)}" z="{_fmt(z)}"/>')
    write("\n        </vertices>\n        <triangles>\n")
    for i, (a, b, c) in enumerate(triangles):
        if i:
            write("\n")
        write(f'          <triangle v1="{a}" v2="{b}" v3="{c}"/>')
    write("\n        </triangles>\n      </mesh>")


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
    """3MF ST_Matrix3D: m00 m01 m02 m10 m11 m12 m20 m21 m22 m30 m31 m32.

    Spec applies this as a row vector [x y z 1] times the 4x4 whose last
    column is 0 0 0 1, so translation belongs in m30 m31 m32 — not in the
    4th value of each 3x4 row (the layout we used to emit).

    Rotation maps (x, y, z) -> (extent_y - y, x, z) so the mesh's y extent
    becomes the x extent, matching the /preview endpoint.
    """
    if rotated:
        return (
            f"0 1 0 -1 0 0 0 0 1 "
            f"{_fmt(extents[1] + dx)} {_fmt(dy)} 0"
        )
    return f"1 0 0 0 1 0 0 0 1 {_fmt(dx)} {_fmt(dy)} 0"


def write_3mf(
    destination: str | PathLike | BinaryIO,
    items: list[tuple[ContainerSpec, int, int, bool]],
    container_mesh: Callable[[ContainerSpec], tuple],
    baseplates: list[tuple[int, int, int, int]] | None = None,
    baseplate_mesh: Callable[[int, int], tuple] | None = None,
) -> None:
    """Write to a path or binary file, resolving one unique mesh at a time.

    Providers accept a ContainerSpec or (length_u, width_u), respectively.
    Only IDs and extents survive serialization; providers may use a bounded cache.
    The caller owns destination and handles partial-file cleanup on failure.
    """
    key_to_id = {}
    extents_by_key = {}
    plate_key_to_id = {}
    plates = baseplates or []
    with zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", CONTENT_TYPES)
        archive.writestr("_rels/.rels", RELS)
        with archive.open("3D/3dmodel.model", "w", force_zip64=True) as entry:
            with io.BufferedWriter(entry, buffer_size=64 * 1024) as buffer:
                def write(text):
                    # Bound encoded writes even for unusually long names.
                    for offset in range(0, len(text), 16 * 1024):
                        buffer.write(text[offset:offset + 16 * 1024].encode("utf-8"))

                write('<?xml version="1.0" encoding="UTF-8"?>\n'
                      '<model unit="millimeter" xml:lang="en-US" '
                      'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n'
                      '  <metadata name="Application">Boxable</metadata>\n'
                      '  <resources>\n')
                count = 0
                for spec, *_ in items:
                    key = geometry_key(spec)
                    if key in key_to_id:
                        continue
                    count += 1
                    key_to_id[key] = count
                    if count > 1:
                        write("\n")
                    vertices, triangles, extents = container_mesh(spec)
                    extents_by_key[key] = extents
                    write(f'    <object id="{count}" name="{escape(spec.name)}" type="model">\n')
                    _write_mesh(write, vertices, triangles)
                    write("\n    </object>")
                    del vertices, triangles
                for length_u, width_u, *_ in plates:
                    key = baseplate_key(length_u, width_u)
                    if key in plate_key_to_id:
                        continue
                    count += 1
                    plate_key_to_id[key] = count
                    if count > 1:
                        write("\n")
                    vertices, triangles, _ = baseplate_mesh(length_u, width_u)
                    write(f'    <object id="{count}" name="Baseplate {length_u}×{width_u}" type="model">\n')
                    _write_mesh(write, vertices, triangles)
                    write("\n    </object>")
                    del vertices, triangles
                write("\n  </resources>\n  <build>\n")
                first = True
                for spec, col, row, rotated in items:
                    key = geometry_key(spec)
                    extents = extents_by_key[key]
                    dx, dy = _placement_offset(spec, col, row, rotated, extents)
                    transform = _transform(dx, dy, rotated, extents)
                    if not first:
                        write("\n")
                    first = False
                    write(f'      <item objectid="{key_to_id[key]}" transform="{transform}"/>')
                for length_u, width_u, col, row in plates:
                    key = baseplate_key(length_u, width_u)
                    transform = _transform(col * GRID_UNIT_MM, row * GRID_UNIT_MM, False, (0., 0., 0.))
                    if not first:
                        write("\n")
                    first = False
                    write(f'      <item objectid="{plate_key_to_id[key]}" transform="{transform}"/>')
                write("\n  </build>\n</model>\n")


def build_3mf(
    items: list[tuple[ContainerSpec, int, int, bool]],
    meshes: dict[str, tuple],
    baseplates: list[tuple[int, int, int, int]] | None = None,
    baseplate_meshes: dict[str, tuple] | None = None,
) -> bytes:
    """Compatibility API; production uses write_3mf to avoid a RAM archive."""
    buffer = io.BytesIO()
    plate_meshes = baseplate_meshes or {}
    write_3mf(buffer, items, lambda spec: meshes[geometry_key(spec)], baseplates,
              lambda length, width: plate_meshes[baseplate_key(length, width)])
    return buffer.getvalue()
