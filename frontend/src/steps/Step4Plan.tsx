import { useEffect, useMemo, useState } from "react";
import { download3mf, previewMeshes } from "../api";
import type { DrawerState, ItemGroup } from "../lib/state";
import { tileBaseplates } from "../lib/baseplateTiler";
import { packContainers, usedCells } from "../lib/containerPacker";
import type { GridLayout } from "../lib/gridLayout";
import { specsForGroup } from "../lib/groupSpecs";
import { placedCols, placedRows, type ContainerSpec, type PreviewItemPayload, type PreviewMesh } from "../lib/types";
import { DrawerPreview3D } from "../components/DrawerPreview3D";

const COLORS = ["#7048f6", "#496913", "#3856c7", "#a92959", "#825b0e", "#55555b", "#9c3c21", "#16655d"];

interface Props {
  drawer: DrawerState;
  grid: GridLayout;
  groups: ItemGroup[];
  onBack: () => void;
}

function colorFor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length];
}

export function Step4Plan({ drawer, grid, groups, onBack }: Props) {
  const maxHeightU = Math.max(2, Math.floor(drawer.depthMm / 7));
  const maxFootprintU = Math.max(1, Math.min(6, Math.max(grid.cols, grid.rows)));

  const { pack, skipped } = useMemo(() => {
    const skippedNames: string[] = [];
    const all: ContainerSpec[] = [];
    for (const group of groups) {
      const made = specsForGroup(group, maxHeightU, maxFootprintU);
      if (made.length === 0) {
        skippedNames.push(group.name);
      }
      all.push(...made);
    }
    return {
      pack: packContainers(all, grid.cols, grid.rows),
      skipped: skippedNames,
    };
  }, [groups, maxHeightU, maxFootprintU, grid.cols, grid.rows]);

  const payload = useMemo<PreviewItemPayload[]>(
    () =>
      pack.placed.map((p) => ({
        spec: p.spec,
        col: p.col,
        row: p.row,
        rotated: p.rotated,
      })),
    [pack],
  );
  const baseplates = useMemo(() => tileBaseplates(grid.cols, grid.rows), [grid.cols, grid.rows]);
  const payloadKey = payload.map((p) => `${p.spec.id}:${p.col}:${p.row}:${p.rotated}`).join("|");

  const [meshes, setMeshes] = useState<PreviewMesh[] | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (payload.length === 0) {
      setMeshes([]);
      return;
    }
    const controller = new AbortController();
    setPreviewError("");
    previewMeshes(payload, controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) setMeshes(items);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setPreviewError(err instanceof Error ? err.message : "Preview failed");
      });
    return () => {
      controller.abort();
    };
  }, [payload, payloadKey]);

  const manifest = pack.placed
    .reduce<Record<string, { name: string; size: string; count: number }>>((acc, p) => {
      const key = `${p.spec.name}|${p.spec.length_u}x${p.spec.width_u}x${p.spec.height_u}|${p.spec.kind}`;
      if (!acc[key]) {
        acc[key] = {
          name: p.spec.name,
          size: `${p.spec.length_u}×${p.spec.width_u}×${p.spec.height_u}U`,
          count: 0,
        };
      }
      acc[key].count += 1;
      return acc;
    }, {});

  const baseManifest = baseplates.reduce<Record<string, { size: string; count: number }>>((acc, plate) => {
    const key = `${plate.length_u}x${plate.width_u}`;
    if (!acc[key]) acc[key] = { size: `${plate.length_u}×${plate.width_u}`, count: 0 };
    acc[key].count += 1;
    return acc;
  }, {});

  const manifestText = [
    ...Object.values(manifest).map((row) => `print ${row.count} × ${row.name}  (${row.size})`),
    ...Object.values(baseManifest).map((row) => `print ${row.count} × Baseplate  (${row.size})`),
  ].join("\n");

  const onDownload = async () => {
    setBusy(true);
    setPreviewError("");
    try {
      const blob = await download3mf(payload, baseplates);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "boxable.3mf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setBusy(false);
    }
  };

  const svgW = 800;
  const pad = 16;
  const scale = (svgW - pad * 2) / Math.max(grid.cols * grid.unitMm, 1);
  const svgH = grid.rows * grid.unitMm * scale + pad * 2;

  return (
    <section className="panel">
      <h1>Everything in its place.</h1>
      <p className="lede">
        Bins are sized from each group's standard (or entered) dimensions, then packed into the
        measured grid. Preview the drawer and download a 3MF for your slicer.
      </p>

      {skipped.length > 0 && (
        <div className="banner warn">
          These objects do not fit the drawer height or a 6-unit footprint: {skipped.join(", ")}.
        </div>
      )}
      {pack.unplaced.length > 0 && (
        <div className="banner warn">
          {pack.unplaced.length} container{pack.unplaced.length === 1 ? "" : "s"} did not fit the
          grid. Remove items or use a larger drawer.
        </div>
      )}

      <p>
        Packed {pack.placed.length} bins, {usedCells(pack)} of {grid.cols * grid.rows} cells used.
      </p>

      <div className="split">
        <svg className="grid-svg" viewBox={`0 0 ${svgW} ${svgH}`} role="img" aria-label="Packed layout">
          <rect
            x={pad}
            y={pad}
            width={grid.cols * grid.unitMm * scale}
            height={grid.rows * grid.unitMm * scale}
            fill="#f7f1e4"
            stroke="#1a1712"
          />
          {pack.placed.map((p) => {
            const x = pad + p.col * grid.unitMm * scale;
            const y = pad + p.row * grid.unitMm * scale;
            const w = placedCols(p) * grid.unitMm * scale;
            const h = placedRows(p) * grid.unitMm * scale;
            const fill = colorFor(p.spec.name);
            return (
              <g key={p.spec.id}>
                <rect x={x} y={y} width={w} height={h} fill={fill} stroke="#1a1712" strokeWidth="1.2" />
                <text
                  x={x + w / 2}
                  y={y + h / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#fff"
                  fontSize={Math.max(9, Math.min(14, w / 8))}
                >
                  {p.spec.name}
                </text>
              </g>
            );
          })}
          {baseplates.map((plate) => (
            <rect
              key={`base-${plate.col}-${plate.row}-${plate.length_u}x${plate.width_u}`}
              x={pad + plate.col * grid.unitMm * scale}
              y={pad + plate.row * grid.unitMm * scale}
              width={plate.length_u * grid.unitMm * scale}
              height={plate.width_u * grid.unitMm * scale}
              fill="none"
              stroke="#1a1712"
              strokeOpacity="0.45"
              strokeWidth="2"
            />
          ))}
        </svg>
        <div>
          {previewError && <div className="banner warn">{previewError}</div>}
          {meshes && meshes.length > 0 ? (
            <DrawerPreview3D meshes={meshes} placed={payload} />
          ) : (
            <div className="preview-3d" style={{ display: "grid", placeItems: "center", color: "#f4ead6" }}>
              {payload.length === 0 ? "Nothing packed yet" : previewError ? "3D preview unavailable. Check the error above." : "Loading 3D preview…"}
            </div>
          )}
        </div>
      </div>

      {manifestText && <pre className="manifest">{manifestText}</pre>}

      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn secondary" type="button" onClick={onBack}>
          Back
        </button>
        <button className="btn" type="button" disabled={(baseplates.length === 0 && payload.length === 0) || busy} onClick={() => void onDownload()}>
          {busy ? "Building 3MF…" : "Download 3MF"}
        </button>
      </div>
    </section>
  );
}
