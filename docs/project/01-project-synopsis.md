# Project Synopsis / Proposal

**Project title:** RailGaadi — Live Indian Train Tracking Web Application  
**Programme:** Bachelor of Technology (Computer Science and Engineering)  
**Nature of work:** Minor project  
**Repository:** https://github.com/sumandey7684/Railgaadi  
**Software version in `package.json`:** 0.1.0  
**Git tag:** `v1.0.0` (points at the snapshot tagged on the `main` branch; later documentation commits may exist after the tag)

---

## Abstract

RailGaadi is a Next.js 14 web application that presents live Indian Railways journey information in a browser. Users search for a train by number or name, open a journey view with a MapLibre map and halt timeline, and optionally inspect weather at selected stations, an elevation profile, and OpenStreetMap-derived terrain features along the route.

Live train data is obtained from the RailRadar HTTP API. Maps use MapTiler vector styles when `NEXT_PUBLIC_MAPTILER_API_KEY` is set, otherwise CARTO dark raster tiles. Weather uses OpenWeather; elevation uses OpenTopography SRTMGL3 samples; terrain uses the Overpass API. Optional Upstash Redis stores a short-lived journey cache, an IP rate-limit counter, and a UTC daily RailRadar request budget.

The design problem is not only visualisation. RailRadar calls are quota-limited. The implementation therefore coalesces in-flight fetches, caches live journeys for 30 seconds, rate-limits `/api/*` at 45 requests per 60 seconds per IP, and exposes an explicit `dataSource` of `live | cached | fallback | unavailable` so cached, catalogue, synthetic, and missing data are not presented as live GPS.

This synopsis proposes RailGaadi as a software-engineering minor project: a working full-stack system with documented APIs, automated Vitest coverage (46 tests in 9 files at the time of this document), and GitHub Actions CI (typecheck, lint, test, production build).

---

## Introduction

Passengers commonly need a single view of where a train is, which stations remain, whether it is late, and contextual weather or terrain. Official and commercial trackers exist, but a student implementation that **labels data provenance**, **protects a third-party quota**, and **degrades without fabricating production journeys** is a valid CSE minor-project scope.

RailGaadi is a client–server Next.js application. The browser never holds `RAILRADAR_API_KEY`, `OPENWEATHER_API_KEY`, `OPENTOPOGRAPHY_API_KEY`, or Upstash credentials. Only `NEXT_PUBLIC_MAPTILER_API_KEY` is public by design.

---

## Problem statement

1. Live operator APIs are rate- and quota-limited; naive polling from every UI tab exhausts the budget.
2. Provider payloads are heterogeneous (scheduled vs actual vs expected times; GPS vs station vs interpolated position).
3. Search of the full national timetable via live lookup is expensive; a local catalogue can answer popular queries without consuming quota.
4. Secondary layers (weather, DEM, OSM) fail independently of train tracking; the UI must still distinguish live vs estimated content.
5. In production (`NODE_ENV === 'production'`), a missing RailRadar key or provider error must **not** show a synthetic Mumbai–Delhi journey as if it were live.

---

## Objectives

| ID | Objective | Status in codebase |
| --- | --- | --- |
| O1 | Search trains from a bundled `TRAINS_DB` and, on miss, from RailRadar lookup | Implemented |
| O2 | Display a normalised `LiveJourney` with map and halt timeline | Implemented |
| O3 | Label `dataSource` on API responses and in the UI (`DataSourceBadge`) | Implemented |
| O4 | Cache live journeys (30 s), coalesce in-flight RailRadar calls | Implemented |
| O5 | Rate-limit API routes; enforce a daily RailRadar budget (default 50 UTC units) | Implemented |
| O6 | Optional Redis for shared cache, limits, and budget | Implemented |
| O7 | Weather, elevation, and Overpass terrain as separate API routes | Implemented |
| O8 | Light/dark theme, PWA manifest, favorites and recents in `localStorage` | Implemented |
| O9 | Automated tests and CI without requiring production secrets | Implemented |

---

## Scope

**In scope:** pages `/`, `/train/[id]`, `/share/[id]`, `/favorites`; API routes listed in the API document; MapLibre map; journey-state views; middleware rate limiting; Vitest; GitHub Actions.

**Out of scope (not implemented):** user accounts, payments, booking, official IRCTC integration, machine learning, native mobile apps, a project-owned SQL database, light-themed map styles, moving the `v1.0.0` tag automatically after later commits.

---

## Existing system

Passengers use NTES-style official status pages, IRCTC-related apps, and commercial trackers (for example Where is my Train, RailYatri). Those products are closed source from this project’s perspective. Typical limitations for a student team are opaque data provenance, no inspectable quota policy, and no local-first search catalogue under the student’s control.

---

## Proposed system

A Next.js App Router application with:

- Server-side RailRadar access (`lib/railradar.ts`) and `loadCachedLiveJourney` (`lib/journey-loader.ts`).
- Explicit envelope `ApiResponse<T>` (`types/api.ts`).
- Local-first search (`lib/trains-db.ts`, `app/api/search/route.ts`, `hooks/useTrainSearch.ts`).
- Shared halt/time/position helpers (`lib/journey-state.ts`) used by timeline and map.
- Geospatial helpers via Turf (`lib/geo.ts`).
- Optional Upstash Redis (`lib/redis.ts`, `lib/cache.ts`, `lib/rate-limit.ts`, `lib/railradar-budget.ts`).

---

## Feasibility (summary)

| Dimension | Assessment |
| --- | --- |
| Technical | Next.js 14, TypeScript, documented third-party HTTP APIs, pnpm, Node 20 (CI). |
| Operational | Daily RailRadar budget is a **soft application cap**, not a guarantee against provider 429s. Redis is optional; without it, counters are per process and ephemeral. |
| Economic | Relies on provider free/paid tiers; keys are not in git. |
| Legal / academic | Independent student project; not affiliated with Indian Railways or IRCTC. |

---

## High-level architecture

See `diagrams/architecture.md`. Browser → Next.js middleware → route handlers → Redis or memory → RailRadar / OpenWeather / OpenTopography / Overpass / MapTiler.

---

## Deliverables for evaluation

1. Source repository and tagged snapshot `v1.0.0`.
2. Running application (`pnpm dev` / `pnpm build` && `pnpm start`).
3. This documentation set under `docs/project/`.
4. Vitest suite and CI workflow `.github/workflows/ci.yml`.
5. Screenshots in `docs/screenshots/`.

---

## References (synopsis)

1. Next.js documentation, https://nextjs.org/docs  
2. RailRadar API base URL as configured: `https://api.railradar.in/v1` (`config/env.ts`)  
3. MapLibre GL JS, https://maplibre.org/  
4. OpenWeather Current Weather API, https://openweathermap.org/api  
5. OpenTopography GlobalDEM API, https://opentopography.org/  
6. Overpass API, https://overpass-api.de/  
7. Upstash Redis, https://upstash.com/  

Full citations: `04-literature-survey.md`.
