import { z } from 'zod';

// ── Raw Waze API types ───────────────────────────────────────────────────────

export const WazeLocationSchema = z.object({
  x: z.number(), // longitude
  y: z.number(), // latitude
});

export const WazeAlertSchema = z.object({
  uuid: z.string(),
  id: z.string().optional(),
  type: z.string(),
  subtype: z.string().default(''),
  location: WazeLocationSchema,
  street: z.string().optional().default(''),
  city: z.string().optional().default(''),
  country: z.string().optional().default(''),
  pubMillis: z.number(),
  reliability: z.number().default(0),
  confidence: z.number().default(0),
  reportRating: z.number().default(0),
  nThumbsUp: z.number().default(0),
  magvar: z.number().default(0),
  roadType: z.number().default(0),
  speed: z.number().default(0),
  reportMood: z.number().default(0),
  jamUuid: z.string().nullable().default(null),
});

export const WazeResponseSchema = z.object({
  alerts: z.array(WazeAlertSchema).optional().default([]),
  jams: z.array(z.unknown()).optional(),
  irregularities: z.array(z.unknown()).optional(),
  startTime: z.number().optional(),
  endTime: z.number().optional(),
});

export type WazeLocation = z.infer<typeof WazeLocationSchema>;
export type WazeAlert = z.infer<typeof WazeAlertSchema>;
export type WazeResponse = z.infer<typeof WazeResponseSchema>;

// Waze subtype constants
export const POLICE_SUBTYPES = [
  'POLICE_VISIBLE',
  'POLICE_HIDING',
  'POLICE_TRAFFIC_LIGHT_CAMERA',
  'POLICE_CAM_SPEED',
  '',
] as const;

export type PoliceSubtype = (typeof POLICE_SUBTYPES)[number];

// Session data stored in Redis
export interface WazeSession {
  cookies: string;
  userAgent: string;
  referer: string;
  capturedAt: number; // Unix ms
  strategy: 'playwright' | 'manual';
}

// Bounding box for tile queries
export interface BoundingBox {
  top: number;    // maxLat
  bottom: number; // minLat
  left: number;   // minLng
  right: number;  // maxLng
}
