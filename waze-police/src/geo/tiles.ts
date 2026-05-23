import type { BoundingBox } from '../types/waze.js';
import { config } from '../config/index.js';

/**
 * Splits a bounding box into an N×N grid of tiles.
 * Used to divide Bulgaria into manageable chunks for the Waze API.
 */
export function splitIntoTiles(bbox: BoundingBox, gridSize: number): BoundingBox[] {
  if (gridSize < 1) throw new Error('gridSize must be >= 1');

  const latStep = (bbox.top - bbox.bottom) / gridSize;
  const lngStep = (bbox.right - bbox.left) / gridSize;

  const tiles: BoundingBox[] = [];

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      tiles.push({
        bottom: bbox.bottom + row * latStep,
        top: bbox.bottom + (row + 1) * latStep,
        left: bbox.left + col * lngStep,
        right: bbox.left + (col + 1) * lngStep,
      });
    }
  }

  return tiles;
}

/**
 * Returns the configured Bulgaria tiles.
 */
export function getBulgariaTiles(): BoundingBox[] {
  const bgBbox: BoundingBox = {
    top: config.BG_BBOX_MAX_LAT,
    bottom: config.BG_BBOX_MIN_LAT,
    left: config.BG_BBOX_MIN_LNG,
    right: config.BG_BBOX_MAX_LNG,
  };
  return splitIntoTiles(bgBbox, config.BG_TILE_GRID);
}

/**
 * Format tile for logging
 */
export function formatTile(tile: BoundingBox, index: number): string {
  return `tile[${index}] (${tile.bottom.toFixed(3)},${tile.left.toFixed(3)})→(${tile.top.toFixed(3)},${tile.right.toFixed(3)})`;
}
