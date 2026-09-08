"""Builds cadquery solids for each container spec kind.

Divided bins come straight from cq-gridfinity. Pocket holders start from a
solid cq-gridfinity box and subtract cylinder / hex / rectangular pockets, and
the cable spool subtracts an annular channel that leaves a center post to coil
a cable around.
"""

import math
import threading
from pathlib import Path

import cadquery as cq
from cqgridfinity import GridfinityBaseplate, GridfinityBox

from geometry import (
    POCKET_EDGE_MM,
    ContainerSpec,
    clamped_pocket_depth,
    max_pocket_depth,
    pocket_centers,
)

# Recessed label cut into one outer side wall (readable from outside).
_ENGRAVE_DEPTH_MM = 0.5
_ENGRAVE_FONT_PATH = Path(__file__).resolve().parent / "fonts" / "DejaVuSans.ttf"
# Approximate DejaVu Sans advance width as a fraction of fontsize.
_ENGRAVE_CHAR_WIDTH = 0.6
_ENGRAVE_WALL_MARGIN_MM = 8.0
_ENGRAVE_FONT_MIN_MM = 4.0
_ENGRAVE_FONT_MAX_MM = 10.0
# Ignore Gridfinity base skirt faces near z=0 when picking a side wall.
_ENGRAVE_SIDE_MIN_Z_MM = 5.0


def build_container(spec: ContainerSpec) -> cq.Workplane:
    problems = spec.validate()
    if problems:
        raise ValueError(f"{spec.name}: " + "; ".join(problems))

    if spec.kind == "bin":
        solid = _build_bin(spec)
    elif spec.kind in ("cyl_pockets", "hex_pockets", "rect_pockets"):
        solid = _build_pocket_holder(spec)
    elif spec.kind == "spool":
        solid = _build_spool(spec)
    else:
        raise ValueError(f"unknown kind '{spec.kind}'")
    return _engrave_name(solid, spec)


def _engrave_fontsize(max_width_mm: float, wall_height_mm: float) -> float:
    by_width = max_width_mm * 0.12
    by_height = wall_height_mm * 0.35
    return max(_ENGRAVE_FONT_MIN_MM, min(_ENGRAVE_FONT_MAX_MM, by_width, by_height))


def _fit_engrave_label(name: str, max_width_mm: float, fontsize: float) -> str:
    """Truncate with an ellipsis when the name won't fit the wall width."""
    name = name.strip()
    if not name:
        return ""

    def text_width(s: str) -> float:
        return len(s) * fontsize * _ENGRAVE_CHAR_WIDTH

    if text_width(name) <= max_width_mm:
        return name
    ellipsis = "…"
    for n in range(len(name), 0, -1):
        candidate = name[:n].rstrip() + ellipsis
        if text_width(candidate) <= max_width_mm:
            return candidate
    return ellipsis


def _outer_side_wall_point(solid: cq.Workplane):
    """Center of the largest outer vertical wall above the Gridfinity base skirt."""
    best_area = 0.0
    best_center = None
    best_normal = None
    for face in solid.faces().vals():
        normal = face.normalAt()
        if abs(normal.z) > 0.25:
            continue
        center = face.Center()
        if center.z < _ENGRAVE_SIDE_MIN_Z_MM:
            continue
        area = face.Area()
        if area > best_area:
            best_area = area
            best_center = (center.x, center.y, center.z)
            best_normal = (normal.x, normal.y, normal.z)
    if best_center is None:
        return None
    return best_center, best_normal


def _engrave_name(solid: cq.Workplane, spec: ContainerSpec) -> cq.Workplane:
    """Cut `spec.name` into one outer side wall. On failure, return `solid` unchanged."""
    raw = (spec.name or "").strip()
    if not raw:
        return solid
    if not _ENGRAVE_FONT_PATH.is_file():
        return solid

    try:
        picked = _outer_side_wall_point(solid)
        if picked is None:
            return solid
        wall, normal = picked
        outward = cq.Vector(*normal)
        world_up = cq.Vector(0, 0, 1)
        # Outside viewer looks along -outward (toward the face). Camera right = forward × up.
        view_forward = outward.multiply(-1.0)
        camera_right = view_forward.cross(world_up)
        if camera_right.Length < 1e-6:
            return solid
        camera_right = camera_right.normalized()

        bb = solid.val().BoundingBox()
        # Text runs along the wall's long horizontal axis.
        if abs(normal[1]) >= abs(normal[0]):
            max_width = bb.xlen - _ENGRAVE_WALL_MARGIN_MM
        else:
            max_width = bb.ylen - _ENGRAVE_WALL_MARGIN_MM
        if max_width < _ENGRAVE_FONT_MIN_MM:
            return solid

        wall_height = max(bb.zlen - _ENGRAVE_SIDE_MIN_Z_MM, _ENGRAVE_FONT_MIN_MM)
        fontsize = _engrave_fontsize(max_width, wall_height)
        label = _fit_engrave_label(raw, max_width, fontsize)
        if not label:
            return solid

        # Right-handed outward frame: upright + LTR for CAD/3MF outside viewing.
        plane = cq.Plane(origin=cq.Vector(*wall), xDir=camera_right, normal=outward)
        text = (
            cq.Workplane(plane)
            .text(
                label,
                fontsize,
                -_ENGRAVE_DEPTH_MM,
                fontPath=str(_ENGRAVE_FONT_PATH),
                combine=False,
                halign="center",
                valign="center",
            )
        )
        return solid.cut(text)
    except Exception:
        return solid


def export_stl(solid: cq.Workplane, path: str):
    cq.exporters.export(solid, path)


# Serializes CAD work across FastAPI threadpool workers. Concurrent first-time
# parses of cadquery string selectors (e.g. ">Z") corrupt pyparsing's lazy
# arity-resolution state, permanently wedging the grammar for the process
# (TypeError: atom_callback() missing 1 required positional argument: 'res').
# The OCC kernel is not thread-safe either.
_CAD_LOCK = threading.Lock()

# Tessellation takes seconds per geometry; identical specs are requested
# repeatedly (every preview refresh re-sends the same payload). Cache results
# across requests, keyed by geometry. Checked inside _CAD_LOCK so a
# duplicate request waits for the first compute and then reuses it.
_MESH_CACHE: dict[str, tuple] = {}


def _weld_mesh(vertices, triangles, digits=4):
    """Merge vertices that OCC duplicated on shared face boundaries.

    shape.tessellate() triangulates each face independently, so edges that
    are geometrically coincident do not share indices. 3MF consumers then
    report tens of thousands of open edges.
    """
    key_to_new: dict[tuple, int] = {}
    new_verts: list = []
    remap = [0] * len(vertices)
    for i, vertex in enumerate(vertices):
        key = (round(vertex[0], digits), round(vertex[1], digits), round(vertex[2], digits))
        index = key_to_new.get(key)
        if index is None:
            index = len(new_verts)
            key_to_new[key] = index
            new_verts.append(vertex)
        remap[i] = index
    new_tris = []
    for a, b, c in triangles:
        ia, ib, ic = remap[a], remap[b], remap[c]
        if ia != ib and ib != ic and ic != ia:
            new_tris.append((ia, ib, ic))
    return new_verts, new_tris


def _tessellate_shape(shape, cache_key: str, tolerance: float):
    cached = _MESH_CACHE.get(cache_key)
    if cached is not None:
        return cached
    bb = shape.BoundingBox()
    raw_vertices, triangles = shape.tessellate(tolerance)
    vertices = [(v.x - bb.xmin, v.y - bb.ymin, v.z - bb.zmin) for v in raw_vertices]
    vertices, welded_tris = _weld_mesh(vertices, [tuple(t) for t in triangles])
    extents = (bb.xlen, bb.ylen, bb.zlen)
    result = (vertices, welded_tris, extents)
    _MESH_CACHE[cache_key] = result
    return result


def tessellate_container(spec: ContainerSpec, tolerance: float = 0.5):
    """Triangle mesh of the container for the app's 3D preview.

    Returns (vertices, triangles, extents) with the footprint corner moved to
    the origin and the base resting on z=0, so callers can place the mesh in
    drawer coordinates.
    """
    from threemf import geometry_key

    cache_key = f"{geometry_key(spec)}|tol={tolerance}"
    with _CAD_LOCK:
        cached = _MESH_CACHE.get(cache_key)
        if cached is not None:
            return cached
        return _tessellate_shape(build_container(spec).val(), cache_key, tolerance)


def tessellate_baseplate(length_u: int, width_u: int, tolerance: float = 0.5):
    """Triangle mesh of a Gridfinity baseplate, origin at the footprint corner."""
    if not 1 <= length_u <= 5 or not 1 <= width_u <= 5:
        raise ValueError(f"baseplate {length_u}x{width_u} is outside 1x1–5x5")
    cache_key = f"baseplate|{length_u}x{width_u}|tol={tolerance}"
    with _CAD_LOCK:
        cached = _MESH_CACHE.get(cache_key)
        if cached is not None:
            return cached
        return _tessellate_shape(
            GridfinityBaseplate(length_u, width_u).render().val(),
            cache_key,
            tolerance,
        )


def _build_bin(spec: ContainerSpec) -> cq.Workplane:
    box = GridfinityBox(
        spec.length_u,
        spec.width_u,
        spec.height_u,
        length_div=spec.length_div,
        width_div=spec.width_div,
        scoops=spec.scoops,
        labels=spec.labels,
        holes=False,
    )
    return box.render()


def _solid_box(spec: ContainerSpec) -> cq.Workplane:
    box = GridfinityBox(
        spec.length_u,
        spec.width_u,
        spec.height_u,
        solid=True,
        no_lip=True,
        holes=False,
    )
    return box.render()


def _footprint_center(solid: cq.Workplane):
    bb = solid.val().BoundingBox()
    return (bb.xmin + bb.xmax) / 2, (bb.ymin + bb.ymax) / 2, bb.zmax


def _build_pocket_holder(spec: ContainerSpec) -> cq.Workplane:
    solid = _solid_box(spec)
    cx, cy, top_z = _footprint_center(solid)
    depth = clamped_pocket_depth(spec)
    points = [(cx + px, cy + py) for px, py in pocket_centers(spec)]

    wp = cq.Workplane("XY", origin=(0, 0, top_z)).pushPoints(points)
    if spec.kind == "cyl_pockets":
        cutter = wp.circle(spec.pocket_diam_mm / 2).extrude(-depth)
    elif spec.kind == "hex_pockets":
        # polygon() takes the circumscribed diameter; spec carries across-flats.
        across_corners = spec.pocket_diam_mm / math.cos(math.pi / 6)
        cutter = wp.polygon(6, across_corners).extrude(-depth)
    else:
        cutter = wp.rect(spec.pocket_length_mm, spec.pocket_width_mm).extrude(-depth)
    return solid.cut(cutter)


def _build_spool(spec: ContainerSpec) -> cq.Workplane:
    solid = _solid_box(spec)
    bb = solid.val().BoundingBox()
    cx, cy, top_z = _footprint_center(solid)

    outer_r = min(bb.xlen, bb.ylen) / 2 - POCKET_EDGE_MM
    post_r = max(outer_r * 0.4, 7.0)
    depth = clamped_pocket_depth(spec) if spec.pocket_depth_mm > 0 else max_pocket_depth(spec)

    channel = (
        cq.Workplane("XY", origin=(cx, cy, top_z))
        .circle(outer_r)
        .circle(post_r)
        .extrude(-depth)
    )
    result = solid.cut(channel)

    # Entry slot through the rim so the cable end can be tucked in.
    slot = (
        cq.Workplane("XY", origin=(cx + (outer_r + bb.xlen / 4) / 2, cy, top_z))
        .rect(bb.xlen / 2, 6.0)
        .extrude(-depth / 2)
    )
    return result.cut(slot)
