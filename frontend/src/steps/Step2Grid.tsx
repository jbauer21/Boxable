import type { GridLayout } from "../lib/gridLayout";
import type { DrawerState } from "../lib/state";

interface Props {
  drawer: DrawerState;
  grid: GridLayout;
  onBack: () => void;
  onContinue: () => void;
}

export function Step2Grid({ drawer, grid, onBack, onContinue }: Props) {
  const pad = 24;
  const svgW = 800;
  const scale = (svgW - pad * 2) / Math.max(drawer.widthMm, 1);
  const svgH = drawer.heightMm * scale + pad * 2;
  const ox = pad;
  const oy = pad;

  return (
    <section className="panel">
      <h1>Meet your drawer’s grid</h1>
      <p className="lede">
        Boxable fits as many 42 × 42 mm Gridfinity cells as the measured interior allows, then
        centers the grid in the leftover margin.
      </p>

      {grid.cols === 0 || grid.rows === 0 ? (
        <div className="banner warn">
          The drawer is smaller than one Gridfinity cell. Check the measurement or marker placement.
        </div>
      ) : (
        <>
          <p>
            <strong>
              {grid.cols} × {grid.rows}
            </strong>{" "}
            cells ({grid.gridWidthMm} × {grid.gridHeightMm} mm), margins {grid.marginXMm.toFixed(1)} mm ×{" "}
            {grid.marginYMm.toFixed(1)} mm. Usable depth {drawer.depthMm} mm → max height{" "}
            {Math.max(2, Math.floor(drawer.depthMm / 7))}U.
          </p>
          <svg className="grid-svg" viewBox={`0 0 ${svgW} ${svgH}`} role="img" aria-label="Drawer grid">
            <rect
              x={ox}
              y={oy}
              width={drawer.widthMm * scale}
              height={drawer.heightMm * scale}
              fill="#f7f1e4"
              stroke="#1a1712"
              strokeWidth="2"
            />
            {Array.from({ length: grid.rows }, (_, r) =>
              Array.from({ length: grid.cols }, (_, c) => {
                const x = ox + (grid.marginXMm + c * grid.unitMm) * scale;
                const y = oy + (grid.marginYMm + r * grid.unitMm) * scale;
                const s = grid.unitMm * scale;
                return (
                  <rect
                    key={`${c}-${r}`}
                    x={x}
                    y={y}
                    width={s}
                    height={s}
                    fill={((c + r) % 2 === 0) ? "rgba(112,72,246,0.14)" : "rgba(194,242,74,0.35)"}
                    stroke="#1a1712"
                    strokeWidth="0.6"
                  />
                );
              }),
            )}
            <text x={ox + (drawer.widthMm * scale) / 2} y={oy - 6} textAnchor="middle" fontSize="12">
              {drawer.widthMm} mm
            </text>
            <text
              x={ox - 8}
              y={oy + (drawer.heightMm * scale) / 2}
              textAnchor="middle"
              fontSize="12"
              transform={`rotate(-90 ${ox - 8} ${oy + (drawer.heightMm * scale) / 2})`}
            >
              {drawer.heightMm} mm
            </text>
          </svg>
        </>
      )}

      <div className="row" style={{ marginTop: 20 }}>
        <button className="btn secondary" type="button" onClick={onBack}>
          Back
        </button>
        <button className="btn" type="button" disabled={grid.cols === 0 || grid.rows === 0} onClick={onContinue}>
          Add item groups
        </button>
      </div>
    </section>
  );
}
