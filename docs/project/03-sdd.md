# System Design Document (SDD)

**Project:** RailGaadi  
**Companion diagrams:** `diagrams/` in this folder

---

## 1. Design goals

1. Keep RailRadar usage bounded (budget, cache, coalescing, local-first search).
2. One normalised journey model for map, timeline, weather, and analytics.
3. Never promote fallback payloads to `dataSource: cached`.
4. Degrade Redis → process memory; degrade providers → labelled fallback or `unavailable`.
5. Do not ship server secrets to the browser except the documented public MapTiler key.

---

## 2. Architectural style

- **Next.js App Router** (React Server Components for layout; client pages for interactive views).
- **BFF (Backend for Frontend):** browser calls same-origin `/api/*` only.
- **Optional shared cache** (Upstash Redis REST).
- **Provider adapters** in `lib/` (`railradar`, `openweather`, `opentopography`, `overpass`).

Logical tiers:

| Tier | Location |
| --- | --- |
| Presentation | `app/`, `components/`, `features/` |
| Client state | Zustand stores; TanStack Query |
| Application API | `app/api/*/route.ts`, `middleware.ts` |
| Domain | `lib/journey-loader.ts`, `lib/journey-state.ts`, `lib/geo.ts` |
| Infrastructure | `lib/cache.ts`, `lib/redis.ts`, `lib/rate-limit.ts`, `lib/railradar-budget.ts` |

---

## 3. Static structure

```
app/page.tsx                  Home search
app/train/[id]/page.tsx       Journey (tabs)
app/share/[id]/page.tsx       Share
app/favorites/page.tsx        Favorites
app/api/search/route.ts
app/api/train/[id]/route.ts
app/api/weather/route.ts
app/api/terrain/route.ts
app/api/analytics/[id]/route.ts
lib/railradar.ts              searchTrains, getLiveJourney, normaliseLiveResponse
lib/journey-loader.ts         30s cache + inflight Map
lib/trains-db.ts              TRAINS_DB, searchLocalTrains
```

---

## 4. Dynamic behaviour

### 4.1 Live tracking

See `diagrams/sequence-live-tracking.md`.

`loadCachedLiveJourney(trainId)`:

1. `parseTrainId` → else 400 `UNAVAILABLE`.
2. `getCached('live:'+id)` → `fromCache` (`cached` or `fallback`).
3. Else join `inflight` Map or start `getLiveJourney`.
4. On `ok`, `setCached` 30 s with `{ journey, originSource }`.

`getLiveJourney`:

1. No `RAILRADAR_API_KEY`: non-production → `generateFallbackJourney` / `fallback`; production → 503 `unavailable`.
2. `tryConsumeRailRadarBudget(2)` else 429 `QUOTA_EXCEEDED`.
3. Parallel `rrFetch` live + route GeoJSON (route downsampled if > 200 points).
4. 404 / missing data → `NOT_FOUND`; provider 429 → quota; other errors → non-production fallback or 503.

### 4.2 Search

See SRS FR-S*. Client vs server differ: **numeric IDs never trigger live search from `useTrainSearch`**.

### 4.3 Weather / terrain / analytics

`GET /api/weather` does **not** call `loadCachedLiveJourney`; the client passes `lat`/`lng`. Terrain and analytics **do** call `loadCachedLiveJourney`, so they share the 30 s journey cache. Analytics response `dataSource` is the **elevation** source (`live` or `fallback`), not the journey source.

---

## 5. Journey-state design

`lib/journey-state.ts` is the single view-model:

| Function | Role |
| --- | --- |
| `haltStations` | `isHalt` filter |
| `stationArrivalView` / `stationDepartureView` | prefer actual → expected → scheduled |
| `delayLabel` | On Time / `+Nm` / `+Nm est.` |
| `mapPosition` | lat/lng + `PositionSource` |
| `journeyProgress` | km and `ProgressSource` |

Normalisation lives in `normaliseLiveResponse` (`lib/railradar.ts`): `collapseStationStatuses`, `markPassengerHalts`, `assignTimeSources`, `applyExpectedDelay`, GPS vs station vs interpolate vs fallback position (`lib/geo.ts` `interpolateAlongRoute`, `progressAlongRoute`).

---

## 6. Caching and quota design

| Mechanism | Key / constant | Notes |
| --- | --- | --- |
| Journey cache | `rg:cache:live:{id}`, 30 s | Also always written to memory |
| Search live | `search:live:{q}`, 600 s | |
| Weather | `weather:{lat2}:{lng2}`, 900 s | |
| Analytics | `analytics:{id}`, 300 s | |
| Terrain | `terrain:{id}`, 86400 s | |
| Rate limit | `rg:ratelimit:{ip}` | INCR + EXPIRE 60 s; max 45 |
| Budget | `rg:budget:railradar:YYYY-MM-DD` | INCRBY; overshoot DECRBY refund |

In-flight coalescing is **process-local** (`Map` in `journey-loader.ts`), not Redis.

---

## 7. Geospatial design

`lib/geo.ts` uses `@turf/turf`: `distance`, `length`, `along`, `nearestPointOnLine`, `lineString`.

- `corridorBboxes`: split route into padded boxes (`maxSpanDeg` default 2, `padDeg` 0.06) for Overpass.
- OpenTopography: 8 geodesic samples, concurrency 4, accept live if ≥ 4 elevations; else `syntheticElevation`.
- Overpass query timeout 25 s; cap ~30 unique features.

---

## 8. UI design

- `QueryProvider`: default `staleTime` 25 s, `refetchOnWindowFocus` true.
- Journey map loaded with `next/dynamic` `ssr: false`.
- Zustand `useJourneyStore`: `autoRefresh` (default true), `followTrainMode` (default true), `selectedStationCode`.
- Glass hierarchy documented in `lib/glass.ts`; map style is dark even in light UI.

---

## 9. Error handling design

| Situation | Design |
| --- | --- |
| Rate limited | 429 JSON, `Retry-After`, `dataSource: unavailable` |
| Quota | 429, `QUOTA_EXCEEDED` message, no fake journey |
| Invalid id | 400 |
| Not found | 404 |
| Missing key (prod) | 503 |
| Weather fail | static weather object, `fallback` (HTTP 200) |
| Overpass fail | three fixed POIs, `fallback` |
| OpenTopography fail/missing key | sine-like synthetic profile, `fallback` |
| Redis fail | log (throttled 10 s), memory |

UI: `ErrorCard` on journey/share for quota, rate limit, 404.

---

## 10. Security design

- Bearer token only on server `rrFetch`.
- `escapeHtml` for map popups.
- No authentication/authorization of travellers.
- `scripts/verify-redis.mjs` lists `rg:*` keys without printing tokens.
- CI injects empty RailRadar keys and a MapTiler placeholder `ci-placeholder`.

---

## 11. Deployment view

See `diagrams/deployment.md` and `07-deployment-and-configuration.md`. Single Node process serving Next.js. No Dockerfile or `render.yaml` in the repository.

---

## 12. Design decisions (as implemented)

| Decision | Alternative not taken |
| --- | --- |
| Local-first search | Always hitting RailRadar lookup |
| Two budget units per live+route | Fetching route only when map mounts (would still cost if uncached) |
| Fallback origin stays `fallback` when cached | Would mislabel estimated data as cached-live |
| No production synthetic journey | Always showing demo trains in production |
| Memory fallback for Redis | Hard-fail without Redis |
