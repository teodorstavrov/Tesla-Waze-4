// ── Normalized police marker types ──────────────────────────────────────────

export interface PoliceMarker {
  id: string;
  waze_uuid: string;
  source: 'waze';
  type: 'POLICE';
  subtype: string;
  latitude: number;
  longitude: number;
  road_name: string | null;
  city: string | null;
  country: string;
  confidence: number;
  reliability: number;
  thumbs_up: number;
  heading: number;
  road_type: number;
  report_age_seconds: number;
  score: number;
  created_at: Date;
  expires_at: Date;
  ingested_at: Date;
  updated_at: Date;
  raw_payload: object;
}

// For INSERT operations (id, created_at etc. are DB-generated or set by code)
export type PoliceMarkerInsert = Omit<PoliceMarker, 'id'>;

// What the API returns to clients
export interface PoliceMarkerDTO {
  id: string;
  waze_uuid: string;
  type: 'POLICE';
  subtype: string;
  latitude: number;
  longitude: number;
  road_name: string | null;
  city: string | null;
  country: string;
  confidence: number;
  reliability: number;
  thumbs_up: number;
  heading: number;
  road_type: number;
  score: number;
  created_at: string; // ISO string
  expires_at: string;
  updated_at: string;
}

// Ingestion run record
export interface IngestionRun {
  id?: number;
  started_at: Date;
  finished_at?: Date;
  strategy?: 'http' | 'playwright';
  tiles_fetched: number;
  raw_count: number;
  police_count: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
  elapsed_ms?: number;
  success: boolean;
}

// Upsert result from DB
export interface UpsertResult {
  action: 'inserted' | 'updated' | 'skipped';
  id: string;
}

// Stats API response
export interface IngestionStats {
  total_active: number;
  last_run: {
    started_at: string;
    finished_at: string | null;
    strategy: string | null;
    inserted: number;
    updated: number;
    skipped: number;
    elapsed_ms: number | null;
    success: boolean;
  } | null;
  subtypes: Record<string, number>;
  avg_score: number;
  runs_last_24h: number;
}
