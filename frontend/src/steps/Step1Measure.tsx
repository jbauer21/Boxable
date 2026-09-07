import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { measureImage, refineMarkers } from "../api";
import { defaultQuad, measureDrawer } from "../lib/homography";
import type { Point } from "../lib/types";
import type { DrawerState } from "../lib/state";

interface Props {
  drawer: DrawerState;
  onChange: Dispatch<SetStateAction<DrawerState>>;
  onContinue: () => void;
}

export function Step1Measure({ drawer, onChange, onContinue }: Props) {
  const [busy, setBusy] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [error, setError] = useState("");
  const [hot, setHot] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const applyFile = useCallback(
    async (file: File) => {
      setBusy(true);
      setError("");
      const url = URL.createObjectURL(file);
      try {
        const result = await measureImage(file);
        const topLeft = result.markers.topLeft ?? defaultQuad("topLeft", result.image_width, result.image_height);
        const bottomRight =
          result.markers.bottomRight ?? defaultQuad("bottomRight", result.image_width, result.image_height);
        const live = measureDrawer(topLeft, bottomRight);
        onChange((prev) => ({
          ...prev,
          photoUrl: url,
          photoFile: file,
          imageWidth: result.image_width,
          imageHeight: result.image_height,
          topLeft,
          bottomRight,
          widthMm: live?.widthMm ?? result.width_mm ?? prev.widthMm,
          heightMm: live?.heightMm ?? result.height_mm ?? prev.heightMm,
          confident: live?.confident ?? result.confident,
          message: result.message,
        }));
      } catch (err) {
        URL.revokeObjectURL(url);
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setBusy(false);
      }
    },
    [onChange],
  );

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setHot(false);
    const file = event.dataTransfer.files[0];
    if (file) void applyFile(file);
  };

  const canContinue = drawer.widthMm > 0 && drawer.heightMm > 0 && drawer.depthMm > 0;

  const autoAdjust = async () => {
    if (!drawer.photoFile || (!drawer.topLeft && !drawer.bottomRight) || busy || adjusting) return;
    setAdjusting(true);
    setError("");
    try {
      const result = await refineMarkers(drawer.photoFile, drawer.topLeft, drawer.bottomRight);
      const topLeft = result.markers.topLeft ?? drawer.topLeft;
      const bottomRight = result.markers.bottomRight ?? drawer.bottomRight;
      const live =
        topLeft && bottomRight ? measureDrawer(topLeft, bottomRight) : null;
      onChange((prev) => ({
        ...prev,
        topLeft,
        bottomRight,
        widthMm: live?.widthMm ?? result.width_mm ?? prev.widthMm,
        heightMm: live?.heightMm ?? result.height_mm ?? prev.heightMm,
        confident: live?.confident ?? result.confident,
        message: result.message,
      }));
      if (!result.moved) {
        setError(result.message || "No nearby marker edge found. Drag the handles closer and try again.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auto Adjust failed");
    } finally {
      setAdjusting(false);
    }
  };

  return (
    <section className="panel">
      <h1>Measure the drawer</h1>
      <p className="lede">
        Print the two 100 mm markers, place TopLeft and BottomRight in opposite corners of the
        drawer floor, and upload a photo that shows both. Drag the corner handles if detection
        misses a printed edge, or use Auto Adjust to snap the outlines onto the printed squares.
        Depth is typed in — a photo cannot see it.
      </p>

      <div
        className={`dropzone${hot ? " hot" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setHot(true);
        }}
        onDragLeave={() => setHot(false)}
        onDrop={onDrop}
      >
        <p>{busy ? "Detecting markers…" : "Drop a drawer photo here, or"}</p>
        <button type="button" className="btn" onClick={() => inputRef.current?.click()} disabled={busy}>
          Choose image
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void applyFile(file);
          }}
        />
      </div>

      {error && <div className="banner warn">{error}</div>}
      {drawer.message && <div className={`banner${drawer.confident ? "" : " warn"}`}>{drawer.message}</div>}

      {drawer.photoUrl && drawer.topLeft && drawer.bottomRight && (
        <div className="overlay-scroller">
          <MarkerOverlay
            photoUrl={drawer.photoUrl}
            imageWidth={drawer.imageWidth}
            imageHeight={drawer.imageHeight}
            topLeft={drawer.topLeft}
            bottomRight={drawer.bottomRight}
            onMove={(topLeft, bottomRight) => {
              const live = measureDrawer(topLeft, bottomRight);
              onChange((prev) => ({
                ...prev,
                topLeft,
                bottomRight,
                widthMm: live?.widthMm ?? prev.widthMm,
                heightMm: live?.heightMm ?? prev.heightMm,
                confident: live?.confident ?? false,
                message: live?.confident
                  ? ""
                  : "Low confidence — keep dragging until the outlines sit on the printed corners.",
              }));
            }}
          />
        </div>
      )}

      {drawer.photoUrl && (
        <div className="row" style={{ marginTop: 14 }}>
          <button
            className="btn secondary"
            type="button"
            disabled={adjusting || busy || !drawer.photoFile}
            onClick={() => void autoAdjust()}
          >
            {adjusting ? "Adjusting…" : "Auto Adjust"}
          </button>
        </div>
      )}

      <div className="row" style={{ marginTop: 20 }}>
        <div className="field">
          <label htmlFor="width">Width mm</label>
          <input
            id="width"
            type="number"
            min={1}
            value={drawer.widthMm || ""}
            onChange={(e) => onChange((prev) => ({ ...prev, widthMm: Number(e.target.value) }))}
          />
        </div>
        <div className="field">
          <label htmlFor="height">Length mm</label>
          <input
            id="height"
            type="number"
            min={1}
            value={drawer.heightMm || ""}
            onChange={(e) => onChange((prev) => ({ ...prev, heightMm: Number(e.target.value) }))}
          />
        </div>
        <div className="field">
          <label htmlFor="depth">Usable depth mm</label>
          <input
            id="depth"
            type="number"
            min={7}
            value={drawer.depthMm || ""}
            onChange={(e) => onChange((prev) => ({ ...prev, depthMm: Number(e.target.value) }))}
          />
        </div>
        <button className="btn" type="button" disabled={!canContinue} onClick={onContinue}>
          Continue to grid
        </button>
      </div>
    </section>
  );
}

function MarkerOverlay({
  photoUrl,
  imageWidth,
  imageHeight,
  topLeft,
  bottomRight,
  onMove,
}: {
  photoUrl: string;
  imageWidth: number;
  imageHeight: number;
  topLeft: Point[];
  bottomRight: Point[];
  onMove: (topLeft: Point[], bottomRight: Point[]) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ which: "topLeft" | "bottomRight"; index: number } | null>(null);
  const tlRef = useRef(topLeft);
  const brRef = useRef(bottomRight);
  const moveRef = useRef(onMove);
  tlRef.current = topLeft;
  brRef.current = bottomRight;
  moveRef.current = onMove;

  useEffect(() => {
    const clientToImage = (clientX: number, clientY: number): Point => {
      const img = wrapRef.current?.querySelector("img");
      if (!img) return [0, 0];
      const rect = img.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * imageWidth;
      const y = ((clientY - rect.top) / rect.height) * imageHeight;
      return [Math.max(0, Math.min(imageWidth, x)), Math.max(0, Math.min(imageHeight, y))];
    };
    const move = (event: PointerEvent) => {
      if (!drag.current) return;
      const point = clientToImage(event.clientX, event.clientY);
      const nextTL = tlRef.current.map((p) => [...p] as Point);
      const nextBR = brRef.current.map((p) => [...p] as Point);
      if (drag.current.which === "topLeft") nextTL[drag.current.index] = point;
      else nextBR[drag.current.index] = point;
      moveRef.current(nextTL, nextBR);
    };
    const up = () => {
      drag.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [imageWidth, imageHeight]);

  const start = (which: "topLeft" | "bottomRight", index: number) => (event: React.PointerEvent) => {
    event.preventDefault();
    drag.current = { which, index };
  };

  const poly = (pts: Point[]) => pts.map((p) => p.join(",")).join(" ");

  return (
    <div className="overlay-wrap" ref={wrapRef}>
      <img src={photoUrl} alt="Drawer photo" />
      <svg className="overlay-svg" viewBox={`0 0 ${imageWidth} ${imageHeight}`} preserveAspectRatio="none">
        <polygon points={poly(topLeft)} fill="rgba(196,92,38,0.18)" stroke="#c45c26" strokeWidth={3} />
        <polygon points={poly(bottomRight)} fill="rgba(63,107,74,0.18)" stroke="#3f6b4a" strokeWidth={3} />
        {topLeft.map((p, i) => (
          <circle key={`tl${i}`} className="handle" cx={p[0]} cy={p[1]} r={10} onPointerDown={start("topLeft", i)} />
        ))}
        {bottomRight.map((p, i) => (
          <circle key={`br${i}`} className="handle" cx={p[0]} cy={p[1]} r={10} onPointerDown={start("bottomRight", i)} />
        ))}
      </svg>
    </div>
  );
}
