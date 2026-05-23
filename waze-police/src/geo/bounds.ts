import type { BoundingBox } from '../types/waze.js';

// Country bounds registry
const COUNTRY_BOUNDS: Record<string, BoundingBox> = {
  BG: {
    top: 44.215,
    bottom: 41.235,
    left: 22.360,
    right: 28.609,
  },
  // Expandable for other countries
};

export function getCountryBounds(country: string): BoundingBox | null {
  return COUNTRY_BOUNDS[country.toUpperCase()] ?? null;
}

export function parseBboxParam(param: string): BoundingBox | null {
  // Format: "minLat,minLng,maxLat,maxLng"
  const parts = param.split(',').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return null;
  const [minLat, minLng, maxLat, maxLng] = parts as [number, number, number, number];
  return { bottom: minLat, left: minLng, top: maxLat, right: maxLng };
}

export function isValidBbox(bbox: BoundingBox): boolean {
  return (
    bbox.bottom < bbox.top &&
    bbox.left < bbox.right &&
    bbox.bottom >= -90 &&
    bbox.top <= 90 &&
    bbox.left >= -180 &&
    bbox.right <= 180
  );
}
