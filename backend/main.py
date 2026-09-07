"""Boxable FastAPI service: measure a drawer photo, preview bins, export 3MF.

Run with:  uvicorn main:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import json

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field

from detection import detect_and_measure, refine_markers
from geometry import GRID_UNIT_MM, ContainerSpec
from homography import measure_drawer
from threemf import build_3mf, geometry_key

app = FastAPI(title="Boxable", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ContainerRequest(BaseModel):
    id: str
    name: str
    kind: str
    length_u: int
    width_u: int
    height_u: int
    quantity: int = 1
    length_div: int = 0
    width_div: int = 0
    scoops: bool = False
    labels: bool = False
    pocket_rows: int = 0
    pocket_cols: int = 0
    pocket_depth_mm: float = 0.0
    pocket_diam_mm: float = 0.0
    pocket_length_mm: float = 0.0
    pocket_width_mm: float = 0.0

    def to_spec(self) -> ContainerSpec:
        return ContainerSpec(**self.model_dump())


class PreviewItem(BaseModel):
    spec: ContainerRequest
    col: int
    row: int
    rotated: bool = False


class PreviewRequest(BaseModel):
    items: list[PreviewItem] = Field(min_length=1)


class GenerateRequest(BaseModel):
    items: list[PreviewItem] = Field(min_length=1)


@app.get("/health")
def health():
    return {"status": "ok", "service": "boxable"}


@app.post("/measure")
async def measure(file: UploadFile = File(...)):
    image = _decode_upload(await file.read())
    result = detect_and_measure(image)
    return {
        "width_mm": result.width_mm,
        "height_mm": result.height_mm,
        "markers": {
            "topLeft": result.top_left,
            "bottomRight": result.bottom_right,
        },
        "confidence": result.confidence,
        "confident": result.confident,
        "rms_residual_mm": result.rms_residual_mm,
        "twist_degrees": result.twist_degrees,
        "max_side_error_ratio": result.max_side_error_ratio,
        "message": result.message,
        "image_width": int(image.shape[1]),
        "image_height": int(image.shape[0]),
    }


def _decode_upload(data: bytes):
    if not data:
        raise HTTPException(status_code=400, detail="empty upload")
    arr = np.frombuffer(data, dtype=np.uint8)
    image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail="could not decode image")
    return image


def _parse_quad(raw: str, name: str):
    try:
        points = json.loads(raw)
        if points is None:
            return None
        if not isinstance(points, list) or len(points) != 4:
            raise ValueError("need 4 corners")
        return [(float(p[0]), float(p[1])) for p in points]
    except (TypeError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail=f"invalid {name} quad: {exc}") from exc


@app.post("/refine")
async def refine(
    file: UploadFile = File(...),
    topLeft: str = Form("null"),
    bottomRight: str = Form("null"),
):
    """Snap the current overlay quads onto nearby printed marker edges."""
    image = _decode_upload(await file.read())
    top_left = _parse_quad(topLeft, "topLeft")
    bottom_right = _parse_quad(bottomRight, "bottomRight")
    if top_left is None and bottom_right is None:
        raise HTTPException(status_code=400, detail="no marker quads to refine")
    refined_tl, refined_br = refine_markers(image, top_left, bottom_right, generous=True)
    measurement = None
    if refined_tl and refined_br:
        measurement = measure_drawer(refined_tl, refined_br)
    moved = refined_tl != top_left or refined_br != bottom_right
    confident = measurement.confident if measurement else False
    if measurement and confident:
        message = ""
    elif not moved:
        message = "Couldn't find a sharp edge near every side. Drag the handles closer to the printed corners and try again."
    else:
        message = "Snapped to nearby edges — check the outlines, then continue."
    return {
        "width_mm": measurement.width_mm if measurement else None,
        "height_mm": measurement.height_mm if measurement else None,
        "markers": {
            "topLeft": refined_tl,
            "bottomRight": refined_br,
        },
        "confident": confident,
        "rms_residual_mm": measurement.rms_residual_mm if measurement else None,
        "twist_degrees": measurement.twist_degrees if measurement else None,
        "max_side_error_ratio": measurement.max_side_error_ratio if measurement else None,
        "moved": moved,
        "message": message,
    }


def _validate(specs: list[ContainerSpec]) -> None:
    problems = []
    for spec in specs:
        for issue in spec.validate():
            problems.append(f"{spec.name}: {issue}")
    if problems:
        raise HTTPException(status_code=422, detail=problems)


def _place_vertices(vertices, extents, spec: ContainerSpec, col: int, row: int, rotated: bool):
    if rotated:
        placed = [(extents[1] - y, x, z) for x, y, z in vertices]
        span_x = spec.width_u * GRID_UNIT_MM
        span_y = spec.length_u * GRID_UNIT_MM
        extent_x, extent_y = extents[1], extents[0]
    else:
        placed = vertices
        span_x = spec.length_u * GRID_UNIT_MM
        span_y = spec.width_u * GRID_UNIT_MM
        extent_x, extent_y = extents[0], extents[1]
    dx = col * GRID_UNIT_MM + (span_x - extent_x) / 2
    dy = row * GRID_UNIT_MM + (span_y - extent_y) / 2
    return [(round(x + dx, 2), round(y + dy, 2), round(z, 2)) for x, y, z in placed]


@app.post("/preview")
def preview(request: PreviewRequest):
    specs = [item.spec.to_spec() for item in request.items]
    _validate(specs)

    from generators import tessellate_container

    meshes: dict[str, tuple] = {}
    items = []
    for item, spec in zip(request.items, specs):
        key = geometry_key(spec)
        if key not in meshes:
            meshes[key] = tessellate_container(spec)
        vertices, triangles, extents = meshes[key]
        items.append({
            "id": spec.id,
            "name": spec.name,
            "vertices": _place_vertices(vertices, extents, spec, item.col, item.row, item.rotated),
            "triangles": triangles,
        })
    return {"items": items}


@app.post("/generate")
def generate(request: GenerateRequest):
    specs = [item.spec.to_spec() for item in request.items]
    _validate(specs)

    from generators import tessellate_container

    meshes: dict[str, tuple] = {}
    placed: list[tuple[ContainerSpec, int, int, bool]] = []
    for item, spec in zip(request.items, specs):
        key = geometry_key(spec)
        if key not in meshes:
            meshes[key] = tessellate_container(spec)
        placed.append((spec, item.col, item.row, item.rotated))

    payload = build_3mf(placed, meshes)
    return Response(
        content=payload,
        media_type="model/3mf",
        headers={"Content-Disposition": 'attachment; filename="boxable.3mf"'},
    )
