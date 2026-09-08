import type {
  BaseplatePlacement,
  MeasureResponse,
  Point,
  PreviewItemPayload,
  PreviewMesh,
  RefineResponse,
} from "./lib/types";

const BASE = "/api";

export async function measureImage(file: File): Promise<MeasureResponse> {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(`${BASE}/measure`, { method: "POST", body });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `measure failed (${response.status})`);
  }
  return response.json();
}

export async function refineMarkers(
  file: File,
  topLeft: Point[] | null,
  bottomRight: Point[] | null,
): Promise<RefineResponse> {
  const body = new FormData();
  body.append("file", file);
  body.append("topLeft", JSON.stringify(topLeft));
  body.append("bottomRight", JSON.stringify(bottomRight));
  const response = await fetch(`${BASE}/refine`, { method: "POST", body });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `refine failed (${response.status})`);
  }
  return response.json();
}

export async function previewMeshes(
  items: PreviewItemPayload[],
  signal?: AbortSignal,
): Promise<PreviewMesh[]> {
  const response = await fetch(`${BASE}/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
    signal,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `preview failed (${response.status})`);
  }
  const data = (await response.json()) as { items: PreviewMesh[] };
  return data.items;
}

export async function download3mf(
  items: PreviewItemPayload[],
  baseplates: BaseplatePlacement[] = [],
): Promise<Blob> {
  const response = await fetch(`${BASE}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items, baseplates }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `generate failed (${response.status})`);
  }
  return response.blob();
}

export async function health(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE}/health`);
    return response.ok;
  } catch {
    return false;
  }
}
