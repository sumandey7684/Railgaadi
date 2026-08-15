# Literature Survey

**Project:** RailGaadi  
**Note:** This survey cites **public documentation and well-known systems**. It does not invent journal papers, DOIs, or experimental results that were not part of this work.

---

## 1. Purpose

Place RailGaadi among (a) passenger-facing train-status products, (b) web mapping and OSM tooling, (c) weather and DEM HTTP APIs, and (d) web-engineering practices used in the implementation (BFF, caching, rate limiting).

---

## 2. Existing passenger information systems

**Official / operator-adjacent status.** Indian Railways and related portals publish train running information (commonly discussed under NTES and IRCTC-adjacent apps). Those systems are authoritative for many passengers but are not APIs this repository calls. RailGaadi does **not** integrate NTES or IRCTC.

**Commercial consumer apps.** Applications such as Where is my Train and RailYatri provide maps and delays. They are closed products. This project does not reverse-engineer them.

**Gap addressed here (academic, not commercial claim):** a student-owned stack that (1) documents third-party dependence, (2) sets `dataSource` on implemented `/api/*` JSON responses, and (3) implements an application-level daily budget plus IP rate limiting. Those properties are verified in source (`types/api.ts`, route handlers, `lib/railradar-budget.ts`, `middleware.ts`), not by surveying market share.

---

## 3. Live tracking data provider used

RailGaadi’s live train provider is **RailRadar**, HTTP base URL `https://api.railradar.in/v1` (`config/env.ts`).

Documented calls in `lib/railradar.ts`:

| Path | Use |
| --- | --- |
| `GET /lookup/trains?q=` | Name/number lookup (`searchTrains`) |
| `GET /trains/{number}/live` | Live status payload (`RRLiveResponse`) |
| `GET /trains/{number}/route` | GeoJSON coordinates for the polyline |

Authentication: `Authorization: Bearer` + `RAILRADAR_API_KEY`. Timeout: 4 seconds.

The survey does not reproduce RailRadar’s internal tracking method (GNSS, crowd, or operator feed); the app consumes the JSON fields it normalises (`isActualPosition`, route delays, etc.).

---

## 4. Web maps

**MapLibre GL JS** (`maplibre-gl` in `package.json`) renders vector or raster styles in the browser. RailGaadi uses MapTiler style `dataviz-dark` when `NEXT_PUBLIC_MAPTILER_API_KEY` is set; otherwise a MapLibre style object with CARTO `dark_all` raster tiles and OSM/CARTO attribution (`features/maps/MapView.tsx`).

This is a standard pattern: a GL renderer + a tile/style vendor. The project does not implement a custom tile server.

---

## 5. OpenStreetMap and Overpass

OpenStreetMap (OSM) is a collaborative geographic database. The **Overpass API** is a read-only query service. RailGaadi POSTs a generated QL query (`lib/overpass.ts`) for bridges, tunnels, rivers, peaks, tourism nodes, and city/town places inside **corridor bounding boxes** (`corridorBboxes` in `lib/geo.ts`), not a single envelope of the whole route. User-Agent: `RailGaadi/0.1 (academic railway tracker)`. Default interpreter: `https://overpass-api.de/api/interpreter`.

---

## 6. Weather and elevation APIs

**OpenWeather** Current Weather (`data/2.5/weather`, metric units) supplies temperature, humidity, wind, and condition (`lib/openweather.ts`). Wind m/s is converted to km/h (`* 3.6`). If the key is missing or the request fails, the module returns a **fixed sample** (28 °C, Clear, etc.) labelled `fallback`.

**OpenTopography** GlobalDEM `SRTMGL3` ASCII grid samples (`lib/opentopography.ts`) provide elevation along up to eight route samples. If fewer than four valid points are obtained, a **synthetic** elevation series (`syntheticElevation`) is returned as `fallback`. This is not a substitute for a surveyed alignment.

---

## 7. Geospatial computation

Distances and interpolation use **Turf.js** (`@turf/turf`): geodesic `distance`, line `length`, `along`, `nearestPointOnLine`. This is library usage of standard geodesic formulae, not a novel algorithm contribution. Unit tests in `tests/geo.test.ts` check Mumbai–Delhi haversine magnitude (greater than 1100 km and less than 1500 km) and interpolation monotonicity—not a published accuracy study.

---

## 8. Web application architecture literature (practices used)

**REST-style JSON APIs.** Same-origin `GET` routes return a uniform envelope (`success`, `data`, `error`, `timestamp`, optional `cached`, optional `dataSource`). Implemented handlers set `dataSource`. This is an application convention, not a claim of full REST maturity (no HATEOAS).

**Backend for Frontend.** The Next.js server hides provider keys and aggregates live + route fetches.

**Caching.** Short TTL (30 s) for live trains matches rapidly changing positions; longer TTLs for weather (900 s), analytics (300 s), terrain (86400 s), and live search (600 s).

**Rate limiting.** Fixed window 45/60 s/IP (`lib/rate-limit.ts`), Redis INCR when available.

**Request coalescing.** In-process promise map for identical train ids (`lib/journey-loader.ts`).

**React Query / TanStack Query v5.** Client cache, `staleTime`, interval refetch.

These are established engineering patterns; RailGaadi applies them to a quota-constrained train API.

---

## 9. Frontend state and UI

**Zustand** holds journey UI flags and persisted favorites/recents. **Tailwind CSS** and project glass tokens implement the visual system. **Framer Motion** and **GSAP** are used for motion (including the footer). Theme persistence follows `localStorage` + `prefers-color-scheme` (`lib/theme.ts`).

No machine-learning models appear in `package.json` or source.

---

## 10. Testing and CI literature (as applied)

**Vitest** runs Node unit/contract tests. **GitHub Actions** (`ci.yml`) runs `tsc --noEmit`, `next lint`, `pnpm test`, and `pnpm build` on `main` pushes and pull requests, with empty provider secrets. This matches common open-source CI practice; it is not a substitute for ISTQB-certified process.

---

## 11. Comparison table (honest)

| Aspect | Typical consumer tracker | This project |
| --- | --- | --- |
| Live feed | Proprietary | RailRadar HTTP |
| Provenance UI | Often implicit | Explicit `dataSource` badge |
| Quota policy | Opaque | `RAILRADAR_DAILY_BUDGET`, tests |
| Search | Full index (assumed) | Local catalogue + miss-path lookup |
| Code | Closed | GitHub repository |
| Affiliation | Varies | None with IR / IRCTC |

---

## 12. References

1. Next.js documentation. https://nextjs.org/docs  
2. React documentation. https://react.dev  
3. TanStack Query. https://tanstack.com/query/latest  
4. Zustand. https://github.com/pmndrs/zustand  
5. MapLibre GL JS. https://maplibre.org/maplibre-gl-js/docs/  
6. MapTiler. https://www.maptiler.com/  
7. CARTO basemaps. https://carto.com/basemaps  
8. OpenStreetMap. https://www.openstreetmap.org/copyright  
9. Overpass API. https://overpass-api.de/  
10. OpenWeather Current weather data. https://openweathermap.org/current  
11. OpenTopography. https://opentopography.org/  
12. Shuttle Radar Topography Mission (SRTM) as used by OpenTopography `SRTMGL3` product naming in this codebase.  
13. Turf.js. https://turfjs.org/  
14. Upstash Redis. https://upstash.com/docs/redis/overall/getstarted  
15. Redis. https://redis.io/docs/  
16. Tailwind CSS. https://tailwindcss.com/docs  
17. Vitest. https://vitest.dev/  
18. GitHub Actions. https://docs.github.com/en/actions  
19. RailRadar API host as used in code: https://api.railradar.in  
20. Fielding, R. T. *Architectural Styles and the Design of Network-based Software Architectures*. Doctoral dissertation, University of California, Irvine, 2000. (REST)  
21. IEEE Std 830-1998, *IEEE Recommended Practice for Software Requirements Specifications* (document structure influence only).

No fabricated empirical studies of RailGaadi’s tracking accuracy are cited; none were conducted for this submission beyond the automated tests in `tests/`.
