-- ─────────────────────────────────────────────
--  Waze Police Ingestion — Initial Schema
--  Migration: 001_init.sql
-- ─────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Police markers ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS police_markers (
  id                   UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  waze_uuid            VARCHAR(255) UNIQUE NOT NULL,
  source               VARCHAR(50)  NOT NULL DEFAULT 'waze',
  type                 VARCHAR(50)  NOT NULL DEFAULT 'POLICE',
  subtype              VARCHAR(100),
  geom                 GEOMETRY(POINT, 4326) NOT NULL,
  latitude             DOUBLE PRECISION NOT NULL,
  longitude            DOUBLE PRECISION NOT NULL,
  road_name            TEXT,
  city                 TEXT,
  country              VARCHAR(10),
  confidence           SMALLINT     DEFAULT 0,
  reliability          SMALLINT     DEFAULT 0,
  thumbs_up            SMALLINT     DEFAULT 0,
  heading              SMALLINT     DEFAULT 0,
  road_type            SMALLINT     DEFAULT 0,
  report_age_seconds   INTEGER      DEFAULT 0,
  score                DOUBLE PRECISION DEFAULT 0,
  raw_payload          JSONB,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  expires_at           TIMESTAMPTZ  NOT NULL,
  ingested_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Spatial index (GIST) — essential for ST_DWithin dedup queries
CREATE INDEX IF NOT EXISTS idx_police_markers_geom
  ON police_markers USING GIST (geom);

-- Fast expiration sweeps
CREATE INDEX IF NOT EXISTS idx_police_markers_expires
  ON police_markers (expires_at);

-- API listing (newest first)
CREATE INDEX IF NOT EXISTS idx_police_markers_created
  ON police_markers (created_at DESC);

-- Dedup lookup
CREATE INDEX IF NOT EXISTS idx_police_markers_waze_uuid
  ON police_markers (waze_uuid);

-- Score-based ranking
CREATE INDEX IF NOT EXISTS idx_police_markers_score
  ON police_markers (score DESC);

-- expires_at index covers active-marker queries (partial index with NOW() not allowed)

-- ── Ingestion run audit log ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ingestion_runs (
  id             SERIAL       PRIMARY KEY,
  started_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  finished_at    TIMESTAMPTZ,
  strategy       VARCHAR(20),
  tiles_fetched  SMALLINT     DEFAULT 0,
  raw_count      INTEGER      DEFAULT 0,
  police_count   INTEGER      DEFAULT 0,
  inserted       INTEGER      DEFAULT 0,
  updated        INTEGER      DEFAULT 0,
  skipped        INTEGER      DEFAULT 0,
  errors         INTEGER      DEFAULT 0,
  elapsed_ms     INTEGER,
  success        BOOLEAN      DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_ingestion_runs_started
  ON ingestion_runs (started_at DESC);

-- ── Schema version tracking ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     VARCHAR(50)  PRIMARY KEY,
  applied_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (version) VALUES ('001_init')
  ON CONFLICT (version) DO NOTHING;
