"""Production entry point: same-origin API and built React application."""
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from main import app as api
from google_auth import router as google_router


def create_app(dist: Path | None = None):
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    app.include_router(google_router, prefix="/api/auth/google")
    app.mount("/api", api)
    dist = (dist or Path(os.environ.get("FRONTEND_DIST", Path(__file__).resolve().parents[1] / "frontend/dist"))).resolve()
    if (dist / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/{path:path}")
    def frontend(path: str):
        candidate = (dist / path).resolve()
        if not candidate.is_relative_to(dist):
            raise HTTPException(404)
        if candidate.is_file():
            return FileResponse(candidate)
        if path and path != "auth/google/callback":
            raise HTTPException(404)
        if not (dist / "index.html").is_file():
            raise HTTPException(503, "Build the frontend before starting the production server")
        return FileResponse(dist / "index.html", headers={
            "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
        })

    return app


app = create_app()
