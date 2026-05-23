import type { WazeAlert } from '../types/waze.js';
import { logger } from '../monitoring/metrics.js';

/**
 * Filter Waze alerts to police-only.
 *
 * Accepts:  alert.type === "POLICE"  (case-insensitive for safety)
 * Rejects:  all other types (ACCIDENT, JAM, WEATHERHAZARD, etc.)
 */
export function filterPoliceAlerts(alerts: WazeAlert[]): WazeAlert[] {
  const police = alerts.filter((a) => a.type?.toUpperCase() === 'POLICE');

  if (police.length !== alerts.length) {
    logger.debug(
      { total: alerts.length, police: police.length, filtered: alerts.length - police.length },
      'Filter: kept police alerts',
    );
  }

  return police;
}

/**
 * Remove duplicates from a merged multi-tile result set.
 * Dedup by waze_uuid (exact match).
 * Spatial dedup happens in the DB via PostGIS.
 */
export function deduplicateByUuid(alerts: WazeAlert[]): WazeAlert[] {
  const seen = new Set<string>();
  const unique: WazeAlert[] = [];

  for (const alert of alerts) {
    if (seen.has(alert.uuid)) continue;
    seen.add(alert.uuid);
    unique.push(alert);
  }

  const duplicates = alerts.length - unique.length;
  if (duplicates > 0) {
    logger.debug({ duplicates, total: alerts.length }, 'Filter: removed in-memory duplicates');
  }

  return unique;
}

/**
 * Validate that an alert has required fields.
 */
export function isValidAlert(alert: WazeAlert): boolean {
  return (
    typeof alert.uuid === 'string' &&
    alert.uuid.length > 0 &&
    typeof alert.location?.x === 'number' &&
    typeof alert.location?.y === 'number' &&
    isFinite(alert.location.x) &&
    isFinite(alert.location.y) &&
    alert.location.y >= -90 &&
    alert.location.y <= 90 &&
    alert.location.x >= -180 &&
    alert.location.x <= 180
  );
}

export function filterAndDedup(alerts: WazeAlert[]): WazeAlert[] {
  const valid = alerts.filter(isValidAlert);
  const police = filterPoliceAlerts(valid);
  return deduplicateByUuid(police);
}
