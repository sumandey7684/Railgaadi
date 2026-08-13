export const env = {
  // RailRadar — server-side only
  RAILRADAR_API_KEY: process.env.RAILRADAR_API_KEY || '',
  RAILRADAR_BASE_URL: 'https://api.railradar.in/v1',
  /** Soft daily outbound RailRadar HTTP call budget (shared via Redis). Default 50. */
  RAILRADAR_DAILY_BUDGET: process.env.RAILRADAR_DAILY_BUDGET || '50',

  // MapTiler — public (safe to expose)
  MAPTILER_API_KEY: process.env.NEXT_PUBLIC_MAPTILER_API_KEY || '',

  // OpenWeather — server-side only
  OPENWEATHER_API_KEY: process.env.OPENWEATHER_API_KEY || '',

  // OpenTopography — server-side only
  OPENTOPOGRAPHY_API_KEY: process.env.OPENTOPOGRAPHY_API_KEY || '',

  // Overpass (public OSM interpreter)
  OVERPASS_API_URL: process.env.OVERPASS_API_URL || 'https://overpass-api.de/api/interpreter',

  // Upstash Redis (server-only shared cache + rate limiting)
  UPSTASH_REDIS_REST_URL: (process.env.UPSTASH_REDIS_REST_URL || '').trim(),
  UPSTASH_REDIS_REST_TOKEN: (process.env.UPSTASH_REDIS_REST_TOKEN || '').trim(),
};
