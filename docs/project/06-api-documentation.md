# API Documentation

**Base URL (local):** `http://localhost:3000`  
**Envelope:** `ApiResponse<T>` in `types/api.ts`

```ts
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string; // ISO
  cached?: boolean;
  dataSource?: 'live' | 'cached' | 'fallback' | 'unavailable';
}
```

All routes below are `GET`. Middleware (`middleware.ts`) may return **429** before the handler:

```json
{
  "success": false,
  "error": "RATE_LIMITED: Too many requests. Please wait before retrying.",
  "timestamp": "<iso>",
  "dataSource": "unavailable"
}
```

Header `Retry-After` is set to seconds. Limit: **45 requests per 60 seconds per IP** (`x-forwarded-for` first hop, else `x-real-ip`, else `local`).

---

## 1. `GET /api/search`

**Query:** `query` (string, optional).

**Logic (server):**

| Condition | `dataSource` | HTTP |
| --- | --- | --- |
| Empty `query` | `fallback` (first 12 local trains) | 200 |
| Local catalogue hits | `fallback` | 200 |
| Live lookup cache hit | `cached` | 200 |
| Live lookup success, matches | `live` | 200 |
| Live lookup success, zero matches | `unavailable`, `data: []` | 200 |
| `RailRadarQuotaError` | `unavailable` | 429 |
| Live error, no local | `unavailable`, `data: []` | 200 |

Live lookup: `searchTrains` → RailRadar `/lookup/trains?q=`, budget **1**, cache key `search:live:{lowercase query}`, TTL **600 s**, max 15 entries, then substring filter.

**200 body (success):** `data: SearchResult[]`  
`SearchResult`: `id`, `number`, `name`, `origin {code,name}`, `destination {code,name}`, optional `runsOn`, `duration`, `departureTime`, `arrivalTime`. Live lookup often leaves origin/destination names empty.

---

## 2. `GET /api/train/{id}`

**Path:** `id` — must be 4–5 digits after trim (`parseTrainId`).

| Outcome | HTTP | `dataSource` |
| --- | --- | --- |
| Missing id | 400 | `unavailable` |
| Invalid id | 400 | `unavailable` |
| Cache / live / fallback success | 200 | `cached` / `live` / `fallback` |
| Quota | 429 | `unavailable` |
| Not found | 404 | `unavailable` |
| Unavailable (e.g. no key in production) | 503 | `unavailable` |

**200 `data`:** `LiveJourney` (`types/train.ts`), including `stations[]`, `currentLocation.source`, `speedSource`, `progressSource`, `etaEstimated`, optional `routeGeometry` as `[lng, lat][]`. After `normaliseLiveResponse`, `speedSource` is `'unknown'`. Journey `status` from the mapper is `running | not_started | completed | cancelled` (unknown RailRadar strings become `running`). The type also allows `delayed` and `on_time`; those are not produced by `normaliseStatus`.

Cache: `live:{id}`, **30 s**. In-flight coalescing per process.

Budget on uncached live fetch: **2** units (live + route).

---

## 3. `GET /api/weather`

**Query:** `lat` (required), `lng` (required), `name`, `code` (labels).

Missing lat/lng → **400** `unavailable`.

Cache: `weather:{lat.toFixed(2)}:{lng.toFixed(2)}`, **900 s**. Cached fallback remains `fallback`.

**200 `data` (`WeatherData`):** `tempC`, `feelsLikeC`, `humidity`, `windSpeedKmh`, `condition`, `icon`, optional `rainChancePercent`, `stationName`, `stationCode`. On a live OpenWeather hit, `rainChancePercent` is **80** if `data.rain` is present, else **10** — not a provider probability of precipitation.

Provider: OpenWeather; on failure or missing `OPENWEATHER_API_KEY`, `getWeatherForLocation` returns a static sample with `fallback` (HTTP **200**). The route `catch` would return **500** `unavailable` only if that function threw; it does not throw in the current implementation.

`lat`/`lng` are parsed with `parseFloat`. The handler rejects them with **400** when `!lat || !lng` (so `0` is treated as missing).

---

## 4. `GET /api/terrain`

**Query:** `trainId` (required). Missing → **400**.

Loads journey via `loadCachedLiveJourney` (same errors as train API). Then Overpass along route or station coordinates. Distances from origin via `haversineKm`. Sorted by `distanceKm`. Cache `terrain:{trainId}`, **86400 s**.

**200 `data`:** `TerrainFeature[]` — `type`: `bridge | tunnel | river | mountain | tourist | city`; `name`, `lat`, `lng`, optional `distanceKm`.

Overpass failure: three hardcoded features (Tapti River, Kota Railway Bridge, Aravalli Hills), `fallback`. Empty Overpass success: `live` with `[]`.

---

## 5. `GET /api/analytics/{id}`

Same journey loader as train. Elevation via `getElevationProfile`. Cache `analytics:{id}`, **300 s**.

**200 `data` (`AnalyticsResponse`):**

| Field | Meaning |
| --- | --- |
| `trainId` | Path id |
| `totalDistanceKm`, `distanceCoveredKm`, `remainingDistanceKm`, `completionPercentage` | From journey |
| `highestElevationM` | `Math.max` of profile |
| `elevationProfile` | `{ distanceKm, elevationM }[]` |
| `delayHistory` | `{ stationCode, stationName, delayMinutes }[]` (`delayMinutes ?? 0`) |

`dataSource` is **elevation** `live` or `fallback`, not the journey source.

---

## 6. Pages (not JSON APIs)

| Path | Role |
| --- | --- |
| `/` | Search UI |
| `/train/{id}` | Journey |
| `/share/{id}` | Shareable journey |
| `/favorites` | Local favorites |

---

## 7. External APIs (server)

Documented for architecture, not for public browser CORS:

| Provider | Auth env | Notes |
| --- | --- | --- |
| RailRadar | `RAILRADAR_API_KEY` | Bearer; 4 s timeout |
| OpenWeather | `OPENWEATHER_API_KEY` | Query `appid` |
| OpenTopography | `OPENTOPOGRAPHY_API_KEY` | Query `API_Key` |
| Overpass | none | `OVERPASS_API_URL` |
| MapTiler | `NEXT_PUBLIC_MAPTILER_API_KEY` | Browser style URL |
| Upstash | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | REST |

Do not place secret values in this document.
