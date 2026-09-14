FROM node:24-bookworm-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
COPY boxable_object_catalog.json /build/boxable_object_catalog.json
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_GOOGLE_AUTH_BACKEND=true
RUN npm run build

FROM python:3.13-slim-bookworm
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglu1-mesa libglib2.0-0 libxrender1 libxext6 libsm6 libgomp1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY --from=frontend /build/frontend/dist /app/frontend/dist
RUN useradd --create-home boxable
USER boxable
EXPOSE 10000
CMD ["sh", "-c", "exec uvicorn web:app --host 0.0.0.0 --port ${PORT:-10000} --workers 1 --no-access-log"]
