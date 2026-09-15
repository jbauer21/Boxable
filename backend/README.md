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

## Troubleshooting exports on Render

The production image installs Fontconfig and DejaVu fonts, and checks font
discovery as the application user during the build. Rebuild the image if logs
show `Fontconfig error: Cannot load default config file`.

Exports log a request identifier, each geometry being built, archive assembly,
and completion time. A restart without completion should be checked against
Render's service events and memory metrics; a 502 alone does not establish why
the process stopped. Container names are not included in these progress logs.

The mesh cache retains at most approximately 32 MiB of mesh data. Active
requests and CAD kernel allocations consume additional memory. A local macOS
5×5 baseplate run peaked at about 553 MiB; Linux usage may differ. Large exports
can still exceed the free service's memory allowance despite the cache limit.
Validate a representative layout after deployment before relying on that tier.

## Tests

```bash
pytest
```

Homography and geometry tests need no CAD kernel. Detection tests synthesize
a drawer image with OpenCV. `/preview` and `/generate` tests that call
CadQuery are skipped when the kernel is not installed.
