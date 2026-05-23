import type { WazeAlert } from '../types/waze.js';
import type { PoliceMarkerInsert } from '../types/marker.js';
import { calculateScore } from './score.js';
import { config } from '../config/index.js';

/**
 * Normalizes a Waze POLICE alert into our PoliceMarkerInsert shape.
 */
export function normalizeAlert(alert: WazeAlert): PoliceMarkerInsert {
  const now = new Date();
  const pubMs = alert.pubMillis;
  const reportAgeSeconds = Math.max(0, Math.floor((Date.now() - pubMs) / 1000));
  const expiresAt = new Date(now.getTime() + config.MARKER_TTL_MINUTES * 60 * 1000);

  const score = calculateScore({
    reliability: alert.reliability,
    confidence: alert.confidence,
    thumbsUp: alert.nThumbsUp,
    ageSeconds: reportAgeSeconds,
  });

  return {
    waze_uuid: alert.uuid,
    source: 'waze',
    type: 'POLICE',
    subtype: normalizeSubtype(alert.subtype),
    latitude: alert.location.y,
    longitude: alert.location.x,
    road_name: trimOrNull(alert.street),
    city: trimOrNull(alert.city),
    country: alert.country?.toUpperCase() ?? '',
    confidence: clampInt(alert.confidence),
    reliability: clampInt(alert.reliability),
    thumbs_up: clampInt(alert.nThumbsUp),
    heading: clampInt(alert.magvar),
    road_type: clampInt(alert.roadType),
    report_age_seconds: reportAgeSeconds,
    score,
    created_at: now,
    expires_at: expiresAt,
    ingested_at: now,
    updated_at: now,
    raw_payload: alert as unknown as object,
  };
}

function normalizeSubtype(subtype: string | undefined | null): string {
  if (!subtype) return '';
  const upper = subtype.toUpperCase().trim();

  const KNOWN = [
    'POLICE_VISIBLE',
    'POLICE_HIDING',
    'POLICE_TRAFFIC_LIGHT_CAMERA',
    'POLICE_CAM_SPEED',
  ];

  return KNOWN.includes(upper) ? upper : upper;
}

function trimOrNull(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function clampInt(value: number | undefined | null): number {
  if (value === undefined || value === null || !isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

export function normalizeAlerts(alerts: WazeAlert[]): PoliceMarkerInsert[] {
  return alerts.map(normalizeAlert);
}
