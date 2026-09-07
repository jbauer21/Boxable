/**
 * Typed access to boxable_object_catalog.json: the searchable object catalog
 * plus the storage-generation metadata used to size containers.
 */
import rawCatalog from "../../../boxable_object_catalog.json";

export interface CatalogBoundingBox {
  x: number;
  y: number;
  z: number;
}

export interface CatalogNesting {
  supported: boolean;
  base_height_mm: number;
  additional_item_height_mm: number;
  typical_items_per_set: number;
  max_typical_stack: number;
}

export interface CatalogGeometry {
  shape: string;
  average_volume_mm3: number;
  geometry_source: string;
  confidence: string;
  size_variance_fraction: number;
  diameter_mm?: number;
  length_mm?: number;
  bounding_box_mm?: CatalogBoundingBox;
}

export type QuantityMode =
  | "individual"
  | "bulk"
  | "set"
  | "nested"
  | "bundle"
  | "pair"
  | "roll";

/** The five generator kinds implemented in backend/generators.py. */
export type BackendGenerator =
  | "divided_bin"
  | "cylindrical_pockets"
  | "hex_pockets"
  | "rectangular_pockets"
  | "spool";

export type SupportLevel = "native" | "parameterized" | "fallback";

export interface CatalogStorage {
  strategy: string;
  preferred_template: string;
  quantity_mode: QuantityMode;
  packing_factor: number;
  clearance_mm: number;
  keep_as_set: boolean;
  strategy_role?: string;
  preferred_template_role?: string;
  backend_generator?: BackendGenerator;
  allowed_orientations?: string[];
  default_orientation?: string;
  nesting?: CatalogNesting;
}

/** How the object is actually manufactured with today's backend generators. */
export interface CatalogGeneration {
  backend_generator: BackendGenerator;
  support_level: SupportLevel;
  sizing_mode: string;
  semantic_strategy: string;
  semantic_template: string;
  implemented_now: boolean;
  future_geometry?: string;
  fallback_reason?: string;
  limitation?: string;
}

export interface CatalogObject {
  id: string;
  name: string;
  aliases: string[];
  category: string;
  geometry: CatalogGeometry;
  storage: CatalogStorage;
  generation: CatalogGeneration;
  notes?: string;
}

interface CatalogCategory {
  id: string;
  name: string;
  object_count: number;
  object_ids: string[];
}

interface BoxableCatalog {
  catalog_name: string;
  version: string;
  units: string;
  categories: CatalogCategory[];
  objects: CatalogObject[];
}

const catalog = rawCatalog as unknown as BoxableCatalog;

export const CATALOG_OBJECTS: CatalogObject[] = catalog.objects;

const OBJECTS_BY_ID = new Map(catalog.objects.map((o) => [o.id, o]));
const CATEGORY_NAMES = new Map(catalog.categories.map((c) => [c.id, c.name]));

export function getCatalogObject(id: string): CatalogObject | undefined {
  return OBJECTS_BY_ID.get(id);
}

export function categoryDisplayName(categoryId: string): string {
  return CATEGORY_NAMES.get(categoryId) ?? categoryId;
}

/** Label for the count field, derived from how quantity is interpreted. */
export function quantityLabel(mode: QuantityMode): string {
  switch (mode) {
    case "bulk":
      return "pieces";
    case "set":
      return "sets";
    case "nested":
      return "items in stack";
    case "pair":
      return "pairs";
    case "roll":
      return "rolls";
    case "bundle":
    case "individual":
      return "items";
  }
}

function normalize(text: string): string {
  return text.toLowerCase().trim();
}

function isWordChar(ch: string): boolean {
  return /[a-z0-9]/.test(ch);
}

/** Exact 100, prefix 80, word-boundary substring 60, substring 40, none 0. */
function matchScore(text: string, query: string): number {
  const t = normalize(text);
  if (t === query) return 100;
  if (t.startsWith(query)) return 80;
  const idx = t.indexOf(query);
  if (idx > 0 && !isWordChar(t[idx - 1])) return 60;
  if (idx >= 0) return 40;
  return 0;
}

/** All query tokens are prefixes of words in the text (e.g. "usb c" → "USB-C Cable"). */
function tokensMatch(text: string, tokens: string[]): boolean {
  const words = normalize(text)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return tokens.every((tok) => words.some((w) => w.startsWith(tok)));
}

function objectScore(obj: CatalogObject, query: string, tokens: string[]): number {
  let best = 0;
  for (const text of [obj.name, ...obj.aliases]) {
    best = Math.max(best, matchScore(text, query));
    if (best === 100) return best;
  }
  if (best < 55 && tokens.length > 1) {
    if (tokensMatch([obj.name, ...obj.aliases].join(" "), tokens)) best = 55;
  }
  if (best === 0) {
    const catScore = matchScore(categoryDisplayName(obj.category), query);
    if (catScore >= 100) best = 20;
    else if (catScore >= 80) best = 15;
    else if (catScore > 0) best = 10;
  }
  return best;
}

export function searchCatalog(query: string, limit = 8): CatalogObject[] {
  const q = normalize(query);
  if (!q) return [];
  const tokens = q.split(/\s+/).filter(Boolean);

  const scored: { obj: CatalogObject; score: number }[] = [];
  for (const obj of CATALOG_OBJECTS) {
    const score = objectScore(obj, q, tokens);
    if (score > 0) scored.push({ obj, score });
  }
  scored.sort((a, b) => b.score - a.score || a.obj.name.localeCompare(b.obj.name));
  return scored.slice(0, limit).map((s) => s.obj);
}
