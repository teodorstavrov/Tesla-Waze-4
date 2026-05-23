import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { getLiveMarkers } from '../../db/repositories/marker.repository.js';
import { getCountryBounds, parseBboxParam } from '../../geo/bounds.js';
import type { PoliceMarker, PoliceMarkerDTO } from '../../types/marker.js';

export const policeRouter = Router();

// ── GET /police/live ─────────────────────────────────────────────────────────

const LiveQuerySchema = z.object({
  bbox: z.string().optional(),
  min_score: z.coerce.number().min(0).max(100).default(0),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
});

policeRouter.get('/live', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = LiveQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid query parameters',
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
      return;
    }

    const { bbox, min_score, limit } = parsed.data;

    let bboxParams: { minLat: number; minLng: number; maxLat: number; maxLng: number } | undefined;

    if (bbox) {
      const parsed = parseBboxParam(bbox);
      if (!parsed) {
        res.status(400).json({
          error: 'Invalid bbox format. Expected: minLat,minLng,maxLat,maxLng',
        });
        return;
      }
      bboxParams = {
        minLat: parsed.bottom,
        minLng: parsed.left,
        maxLat: parsed.top,
        maxLng: parsed.right,
      };
    }

    const markers = await getLiveMarkers({
      ...bboxParams,
      minScore: min_score,
      limit,
    });

    const dtos: PoliceMarkerDTO[] = markers.map(toDTO);

    res.json({
      count: dtos.length,
      markers: dtos,
      fetched_at: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /police/bounds ───────────────────────────────────────────────────────

policeRouter.get('/bounds', (req: Request, res: Response) => {
  const country = (req.query['country'] as string | undefined)?.toUpperCase() ?? 'BG';
  const bounds = getCountryBounds(country);

  if (!bounds) {
    res.status(404).json({ error: `No bounds configured for country: ${country}` });
    return;
  }

  res.json({
    country,
    bbox: {
      min_lat: bounds.bottom,
      min_lng: bounds.left,
      max_lat: bounds.top,
      max_lng: bounds.right,
    },
  });
});

// ── DTO mapper ───────────────────────────────────────────────────────────────

function toDTO(m: PoliceMarker): PoliceMarkerDTO {
  return {
    id: m.id,
    waze_uuid: m.waze_uuid,
    type: m.type,
    subtype: m.subtype,
    latitude: m.latitude,
    longitude: m.longitude,
    road_name: m.road_name,
    city: m.city,
    country: m.country,
    confidence: m.confidence,
    reliability: m.reliability,
    thumbs_up: m.thumbs_up,
    heading: m.heading,
    road_type: m.road_type,
    score: m.score,
    created_at: m.created_at instanceof Date ? m.created_at.toISOString() : String(m.created_at),
    expires_at: m.expires_at instanceof Date ? m.expires_at.toISOString() : String(m.expires_at),
    updated_at: m.updated_at instanceof Date ? m.updated_at.toISOString() : String(m.updated_at),
  };
}
