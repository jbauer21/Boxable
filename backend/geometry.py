"""Pure-math helpers for container generation (no CAD dependencies).

Kept free of cadquery imports so spec validation and pocket-layout math can be
unit-tested without a CAD kernel installed.
"""

from dataclasses import dataclass, field

GRID_UNIT_MM = 42.0
HEIGHT_UNIT_MM = 7.0

# Wall the solid box keeps around the pocket field, per side.
POCKET_EDGE_MM = 5.0
# Minimum solid material between two adjacent pockets.
POCKET_WALL_MM = 2.0
# Solid floor preserved under the deepest pocket.
POCKET_FLOOR_MM = 8.0

VALID_KINDS = ("bin", "cyl_pockets", "hex_pockets", "rect_pockets", "spool")


@dataclass
class ContainerSpec:
    id: str
    name: str
    kind: str
    length_u: int
    width_u: int
    height_u: int
    quantity: int = 1
    # bin
    length_div: int = 0
    width_div: int = 0
    scoops: bool = False
    labels: bool = False
    # pocket grids
    pocket_rows: int = 0
    pocket_cols: int = 0
    pocket_depth_mm: float = 0.0
    pocket_diam_mm: float = 0.0    # cyl diameter / hex across-flats
    pocket_length_mm: float = 0.0  # rect pocket size along box length (x)
    pocket_width_mm: float = 0.0   # rect pocket size along box width (y)

    errors: list = field(default_factory=list, repr=False)

    def validate(self):
        """Returns a list of human-readable problems; empty when the spec is sound."""
        problems = []
        if self.kind not in VALID_KINDS:
            problems.append(f"unknown kind '{self.kind}'")
            return problems
        if not (1 <= self.length_u <= 12 and 1 <= self.width_u <= 12):
            problems.append("footprint must be 1-12 units per side")
        if not (1 <= self.height_u <= 20):
            problems.append("height must be 1-20 units")
        if self.quantity < 1:
            problems.append("quantity must be at least 1")
        if self.kind == "bin":
            if self.length_div < 0 or self.width_div < 0:
                problems.append("divider counts cannot be negative")
        elif self.kind in ("cyl_pockets", "hex_pockets", "rect_pockets"):
            if self.pocket_rows < 1 or self.pocket_cols < 1:
                problems.append("pocket grid needs at least 1 row and 1 column")
            if self.pocket_depth_mm <= 0:
                problems.append("pocket depth must be positive")
            if self.kind in ("cyl_pockets", "hex_pockets") and self.pocket_diam_mm <= 0:
                problems.append("pocket diameter must be positive")
            if self.kind == "rect_pockets" and (
                self.pocket_length_mm <= 0 or self.pocket_width_mm <= 0
            ):
                problems.append("rectangular pockets need positive length and width")
            if not problems:
                try:
                    pocket_centers(self)
                except ValueError as exc:
                    problems.append(str(exc))
        return problems

    @property
    def pocket_size_x(self) -> float:
        if self.kind == "rect_pockets":
            return self.pocket_length_mm
        return self.pocket_diam_mm

    @property
    def pocket_size_y(self) -> float:
        if self.kind == "rect_pockets":
            return self.pocket_width_mm
        return self.pocket_diam_mm


def pocket_centers(spec: ContainerSpec):
    """Centers of a rows x cols pocket grid, relative to the box footprint
    center, spread evenly inside the available solid area.

    Raises ValueError when the pockets do not physically fit.
    """
    total_x = spec.length_u * GRID_UNIT_MM
    total_y = spec.width_u * GRID_UNIT_MM
    usable_x = total_x - 2 * POCKET_EDGE_MM
    usable_y = total_y - 2 * POCKET_EDGE_MM

    pitch_x = usable_x / spec.pocket_cols
    pitch_y = usable_y / spec.pocket_rows
    if pitch_x < spec.pocket_size_x + POCKET_WALL_MM or pitch_y < spec.pocket_size_y + POCKET_WALL_MM:
        raise ValueError(
            f"{spec.pocket_cols}x{spec.pocket_rows} pockets of "
            f"{spec.pocket_size_x:.1f}x{spec.pocket_size_y:.1f} mm do not fit a "
            f"{spec.length_u}x{spec.width_u} unit footprint"
        )

    centers = []
    for row in range(spec.pocket_rows):
        cy = -usable_y / 2 + pitch_y * (row + 0.5)
        for col in range(spec.pocket_cols):
            cx = -usable_x / 2 + pitch_x * (col + 0.5)
            centers.append((cx, cy))
    return centers


def max_pocket_depth(spec: ContainerSpec) -> float:
    """Deepest pocket the box height allows while keeping a solid floor."""
    return spec.height_u * HEIGHT_UNIT_MM - POCKET_FLOOR_MM


def clamped_pocket_depth(spec: ContainerSpec) -> float:
    return max(1.0, min(spec.pocket_depth_mm, max_pocket_depth(spec)))


def safe_filename(spec: ContainerSpec) -> str:
    base = "".join(c if c.isalnum() or c in "-_" else "_" for c in spec.name.strip())
    base = base.strip("_") or "container"
    return f"{base}_{spec.length_u}x{spec.width_u}x{spec.height_u}.stl"
