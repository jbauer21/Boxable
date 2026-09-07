# Boxable

A website that measures a drawer from a single photo (two printed 100 mm
fiducial markers), fits a 42 mm Gridfinity grid, lets you inventory the
drawer's contents by group, then generates a packed set of Gridfinity bins
you can preview in 3D and download as a `.3mf`.

## How it works

1. Print the two markers at **100% scale** — each must measure exactly 10 × 10 cm.
   Open **Print markers** in the app, or use [TopLeft.svg](TopLeft.svg) and
   [BottomRight.svg](BottomRight.svg).
2. Place **TopLeft** in the drawer's top-left corner and **BottomRight** in the
   bottom-right corner, flat on the drawer floor, and photograph both.
3. Upload the photo. Boxable detects the markers (you can drag the corner
   handles if a marker was missed) and measures the interior.
4. Review the 42 mm grid fitted to the drawer, then add item groups: pick a
   standard type (AA batteries, hex bits, …) or enter a custom L × W × H, and
   a count.
5. Boxable sizes pocket holders for those items, packs them into the grid, and
   lets you preview the drawer and download a 3MF for your slicer.

## Run locally

```bash
# Backend (CadQuery / OpenCascade is a large first install)
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The Vite dev server proxies `/api` to the backend.

## Tests

```bash
cd backend && pytest
cd frontend && npm test
```

## Project layout

- `backend/` — FastAPI: marker detection, CadQuery bin generation, 3MF export.
- `frontend/` — React + Vite + TypeScript wizard and three.js preview.
- `TopLeft.svg` / `BottomRight.svg` — printable 100 mm fiducials.
