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

## Memory-efficient 3MF exports

`/generate` builds a completed archive on temporary disk before sending the
response. Mesh XML is written through a 64 KiB buffer directly into the ZIP;
each unique mesh is released after serialization, apart from the existing
bounded 32 MiB cache. Only object IDs, extents, and placement metadata remain
for the build section. Identical objects still share one mesh resource.

One export is generated at a time per process. Downloads release that guard
and read the completed archive in chunks. Temporary files are removed on
successful delivery, generation/send errors, and cancellation. An abrupt
process kill cannot run cleanup; temporary disk must have room for active
archives and slow downloads. The production deployment retains one worker.

The CAD construction, tolerance, normalization, welding, vertex/triangle order,
engraving, transforms, and number formatting are unchanged. ZIP metadata may
differ. OpenCascade already varies face/triangle ordering between independent
fresh runs; exact compatibility is checked using the same geometry inputs,
not by claiming independent CAD runs produce identical binary files.

`write_3mf(destination, items, container_mesh, baseplates, baseplate_mesh)` accepts
lazy mesh providers. `build_3mf(...) -> bytes` remains for existing callers;
it necessarily holds the compressed archive in memory and is not used by the
production endpoint.

Run memory scenarios in separate processes using the backend environment:

```bash
backend/.venv/bin/python scripts/benchmark_3mf_memory.py --scenario unique
backend/.venv/bin/python scripts/benchmark_3mf_memory.py --scenario unique --warm
backend/.venv/bin/python scripts/benchmark_3mf_memory.py --scenario repeated
backend/.venv/bin/python scripts/benchmark_3mf_memory.py --scenario plate
backend/.venv/bin/python scripts/benchmark_3mf_memory.py --scenario serialization
```

Use `--legacy-dir /path/to/baseline` containing the original `generators.py`,
`threemf.py`, and `fonts/DejaVuSans.ttf` to compare with the same installed
dependencies and engraving font. Peak RSS includes
imports, native CAD allocations, and warm-up; elapsed seconds cover export
only. `serialization` uses synthetic meshes without CAD to isolate packaging
memory. Actual production memory depends on geometry and the runtime platform.

### Local validation results

Compared against commit `351261e` on macOS, Python 3.13, CadQuery 2.8.0, with
the same installed dependencies and DejaVuSans engraving font. Each native
scenario ran in a separate process. These are individual measurements, not
statistical estimates or predictions of Linux/Render memory usage.

| Native CAD export | Baseline peak MiB | New peak MiB | Baseline / new seconds |
| --- | ---: | ---: | ---: |
| 40 repeated bins, cold | 464.00 | 444.50 | 11.18 / 10.93 |
| 40 repeated bins, warm | 445.47 | 447.03 | 0.05 / 0.06 |
| 12 unique engraved bins, cold | 542.45 | 486.33 | 120.94 / 126.14 |
| 12 unique engraved bins, warm | 550.11 | 499.75 | 126.90 / 123.97 |
| 5×5 baseplate, cold | 564.25 | 561.34 | 4.71 / 4.77 |
| 5×5 baseplate, warm | 565.09 | 548.38 | 0.10 / 0.13 |

The 12-object layout exceeds the cache capacity, so warm-up does not eliminate
CAD generation. Native allocations dominate small exports and the large
baseplate; the latter still exceeds 512 MiB locally.

Isolating export packaging with 24 captured real meshes and the same 32 MiB
cache reduced peak RSS from **263.95 to 65.30 MiB** (about 75%), taking 1.42
versus 1.59 seconds. The synthetic 12-object serialization benchmark reduced
peak RSS from **511.66 to 50.00 MiB**, taking 2.05 versus 2.45 seconds. Doubling
the new synthetic workload to 24 objects used 50.88 MiB, demonstrating bounded
mesh/XML overhead rather than accumulation with the entire export.

Validation included:

- All 65 tests in the full backend run, plus two subsequently added regression
  tests; the final focused export/cache suite passed all 20 tests.
- All five frontend API/download tests using the supported Node runtime.
- Exact old/new tessellation results from identical raw CAD data for divided
  bins, scoops, labels, cylindrical/hexagonal/rectangular pockets, spools, and
  blank names, including engraving with the same font.
- Byte-identical uncompressed archive entries from eight captured real meshes,
  including repeated and rotated placements and baseplates; a permanent golden
  XML test also covers Unicode, escaping, number formatting, and object order.
- Mesh-release and bounded-write checks, invalid requests, partial-generation
  failures, normal download cleanup, send errors, cancellation, and serialized
  generation with downloads outside the export lock.

Changes are local and have not been deployed.
