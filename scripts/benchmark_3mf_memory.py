"""Run each baseline/candidate scenario in a fresh process.

Use backend/.venv/bin/python scripts/benchmark_3mf_memory.py --scenario unique.
--legacy-dir may point to copies of the original threemf.py and generators.py.
Synthetic serialization isolates export overhead from native CAD allocations.
"""
import argparse
import json
from pathlib import Path
import resource
import sys
import tempfile
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--legacy-dir", type=Path)
    parser.add_argument("--scenario", choices=["repeated", "unique", "plate", "serialization"], required=True)
    parser.add_argument("--warm", action="store_true")
    parser.add_argument("--objects", type=int, default=12)
    args = parser.parse_args()
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
    if args.legacy_dir and args.scenario != "serialization":
        font = args.legacy_dir / "fonts" / "DejaVuSans.ttf"
        if not font.is_file():
            parser.error("CAD baselines must include fonts/DejaVuSans.ttf for identical engraving")
    if args.legacy_dir:
        sys.path.insert(0, str(args.legacy_dir.resolve()))
    import threemf as writer
    from geometry import ContainerSpec
    if args.scenario == "serialization":
        def container_mesh(spec):
            return ([(float(i), float(i % 17), float(i % 31)) for i in range(60000)],
                    [(i, i + 1, i + 2) for i in range(59998)], (60000., 16., 30.))
        plate_mesh = None
    else:
        from generators import tessellate_container as container_mesh, tessellate_baseplate as plate_mesh
    count = args.objects if args.scenario in ("unique", "serialization") else 1
    specs = [ContainerSpec(str(i), f"Bin {i}" if count > 1 else "Bin", "bin", 2, 2, 3)
             for i in range(count)]
    items = [(spec, i * 2, 0, bool(i % 2)) for i, spec in enumerate(specs)]
    plates = []
    if args.scenario == "repeated":
        items *= 40
    if args.scenario == "plate":
        items, plates = [], [(5, 5, 0, 0)]
    if args.warm:
        for spec, *_ in items:
            container_mesh(spec)
        for length, width, *_ in plates:
            plate_mesh(length, width)
    started = time.monotonic()
    with tempfile.TemporaryFile() as output:
        if hasattr(writer, "write_3mf"):
            writer.write_3mf(output, items, container_mesh, plates, plate_mesh)
        else:
            meshes = {}
            for spec, *_ in items:
                key = writer.geometry_key(spec)
                if key not in meshes:
                    meshes[key] = container_mesh(spec)
            plate_meshes = {writer.baseplate_key(l, w): plate_mesh(l, w) for l, w, *_ in plates}
            output.write(writer.build_3mf(items, meshes, plates, plate_meshes))
        size = output.tell()
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    print(json.dumps({"implementation": "baseline" if args.legacy_dir else "candidate",
                      "scenario": args.scenario, "cache": "warm" if args.warm else "cold",
                      "seconds": round(time.monotonic() - started, 2),
                      "peak_mib": round(peak / (1024**2 if sys.platform == "darwin" else 1024), 2),
                      "archive_bytes": size}))


if __name__ == "__main__":
    main()
