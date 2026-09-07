# Boxable backend

FastAPI service that measures a drawer photo, tessellates Gridfinity bins for
the 3D preview, and exports a printable 3MF. Geometry is built with
[cq-gridfinity](https://github.com/michaelgale/cq-gridfinity) + CadQuery.

## Setup

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

CadQuery pulls in the OpenCascade kernel (~500 MB); the first install takes a
few minutes.

## Run

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

The Vite frontend proxies `/api` to this port during development.

## API

- `GET /health` — readiness probe.
- `POST /measure` — multipart image upload; returns drawer size in mm plus
  marker corner quads (image-space) for the overlay editor.
- `POST /preview` — placed container specs → triangle meshes in drawer mm.
- `POST /generate` — placed container specs → a `.3mf` download.

## Tests

```bash
pytest
```

Homography and geometry tests need no CAD kernel. Detection tests synthesize
a drawer image with OpenCV. `/preview` and `/generate` tests that call
CadQuery are skipped when the kernel is not installed.
