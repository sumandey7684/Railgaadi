# Project Architecture Documentation

**Project:** RailGaadi  
**Programme:** B.Tech (CSE) minor project  
**This document** is the report-oriented architecture narrative. Detailed SRS, SDD, tests, and APIs are in sibling files.

---

## Abstract

RailGaadi is a Next.js 14 TypeScript application for browser-based Indian train tracking. It composes RailRadar (live trains), MapTiler/CARTO (maps), OpenWeather, OpenTopography, Overpass/OSM, and optional Upstash Redis. The architectural contribution for a student project is **honest degradation**: implemented `/api/*` JSON handlers set `dataSource ∈ {live, cached, fallback, unavailable}` (`dataSource` is optional on the TypeScript type); production never substitutes `generateFallbackJourney`; search prefers `TRAINS_DB`; live RailRadar usage is cached (30 s), coalesced, rate-limited (45/60 s/IP), and budgeted (`RAILRADAR_DAILY_BUDGET`, default 50 UTC units; 2 units per uncached live+route, 1 per live search). Automated tests: **46 passed** in 9 Vitest files (run 15 Aug 2026). No AI/ML components exist in the codebase.

---

## Introduction

The system is a BFF for **provider secrets and train/weather/terrain/analytics JSON**: the UI calls same-origin `/api/*` for those. The **map renderer** (`MapLibre` in the browser) loads MapTiler style/tiles or CARTO raster tiles directly. Layout (`app/layout.tsx`) wraps Inter font, theme script, `ThemeProvider`, `QueryProvider`, `Navbar`, main, `CinematicFooter`, `BottomNav`. Metadata describes “Live Indian Train Tracker”; this is product copy, not a measured SLA.

---

## Problem statement

Quota-limited live APIs, heterogeneous time/position fields, expensive search, independent failure of weather/DEM/OSM, and the risk of showing demo data as live GPS in production.

---

## Objectives

See `01-project-synopsis.md` table O1–O9 (all implemented).

---

## Scope

Implemented pages and APIs only. Out of scope: IRCTC, accounts, ML, SQL, official NTES API.

---

## Existing system

Closed official/commercial trackers; this repo does not call them. See `04-literature-survey.md`.

---

## Proposed system

Next.js App Router + adapter libraries in `lib/` + Redis-or-memory infrastructure + labelled UI (`DataSourceBadge`).

---

## Literature survey

Summarised in `04-literature-survey.md`.

---

## Requirements

Summarised in `02-srs.md`.

---

## Feasibility analysis

| Type | Result |
| --- | --- |
| Technical | Feasible with documented HTTP APIs and Next 14 |
| Economic | Feasible on provider free tiers with a **low** daily budget; not a business case study |
| Schedule | Incremental git history from `2a81e5d` first commit through infra, UI, tests, docs |
| Operational | Feasible if Redis is used for multi-instance; memory-only is single-instance |

Risks: provider 429 despite app budget; Overpass timeouts; OpenTopography sampling sparsity; homepage numeric search skip.

---

## System architecture

See `diagrams/architecture.md`. Layers: UI → Query/Zustand → middleware → routes → cache/budget → providers.

**Journey unification:** `loadCachedLiveJourney` is used by train, terrain, and analytics routes so one page load does not issue three RailRadar live pairs.

---

## Module design

| Module | Responsibility |
| --- | --- |
| `lib/train-id.ts` | `/^\d{4,5}$/` |
| `lib/trains-db.ts` | Catalogue; `searchLocalTrains` slice 15 / empty → 12 |
| `lib/railradar.ts` | Fetch, normalise, fallback generator (dev), quota errors |
| `lib/journey-loader.ts` | Cache + inflight |
| `lib/journey-state.ts` | Timeline/map views |
| `lib/geo.ts` | Turf geodesic helpers |
| `lib/openweather.ts` | Weather + static fallback |
| `lib/opentopography.ts` | DEM + syntheticElevation |
| `lib/overpass.ts` | OSM POIs + three POI fallback |
| `lib/cache.ts` / `redis.ts` | Shared cache |
| `lib/rate-limit.ts` | 45/60 |
| `lib/railradar-budget.ts` | UTC daily units |
| `lib/theme.ts` / `glass.ts` | Theme and glass class names |
| `hooks/useLiveJourney.ts` | 30 s refetch |
| `hooks/useTrainSearch.ts` | Local-first client search |
| `store/*` | Journey flags, favorites, recents |
| `features/maps/MapView.tsx` | MapLibre |
| `middleware.ts` | API rate limit |

---

## Data / API flow

See `diagrams/data-flow.md`, `diagrams/sequence-live-tracking.md`, `06-api-documentation.md`.

`cached` means origin was **live**. Cached **fallback** remains `fallback` (`fromCache` in `journey-loader.ts`; same pattern in weather/terrain/analytics).

---

## Implementation

| Area | Implementation |
| --- | --- |
| Language | TypeScript (`strict: true`) |
| UI | React 18, Tailwind 3.4 |
| Data | TanStack Query 5, Zustand 4 |
| Map | maplibre-gl 4 |
| Motion | framer-motion 11, gsap 3 |
| Redis | @upstash/redis 1.38 |
| Geo | @turf/turf 7 |
| Tests | vitest 3.2.4 |
| Package manager | pnpm (lockfile in repo); `package-lock.json` also present historically |

Normalisation details: halt collapse, passenger halt marking, delay inheritance (`delayEstimated`), position `gps` if `isActualPosition` with coordinates, else station / `interpolateAlongRoute` (via `interpolatePolyline`) / leftover origin `fallback`. `normaliseStatus` maps RailRadar `running | not-started | completed | cancelled` (default `running`). The `LiveJourney['status']` union also includes `delayed` and `on_time`, but **`normaliseLiveResponse` does not assign those values**. `speedSource` is set to `'unknown'` (no live speed field is copied from RailRadar in the normaliser).

---

## Security

- Secrets server-side except `NEXT_PUBLIC_MAPTILER_API_KEY`
- HTML escape in map popups
- Rate limiting
- No traveller authentication (favorites are not server-side secrets)
- CI does not inject real keys

Not implemented: WAF rules, CSRF tokens for GET-only APIs, audit logs, encryption at rest beyond Upstash’s service.

---

## Error and fallback handling

| Layer | Fallback |
| --- | --- |
| Redis | Memory + throttled `console.error` |
| RailRadar (dev) | `generateFallbackJourney` |
| RailRadar (prod) | `unavailable` |
| Weather | Fixed 28 °C sample |
| Elevation | `syntheticElevation` |
| Overpass | Three western-India POIs |
| Map tiles | CARTO dark_all |
| Rate/quota | 429 + badge unavailable |

---

## Testing

See `05-test-plan-and-report.md`. **46/46** Vitest passed on the documented local run.

---

## Results

Qualitative, not benchmarked:

- Examiners can search catalogue trains and open `/train/12951`.
- UI shows provenance badges.
- CI workflow exists for regression.
- Screenshots: `docs/screenshots/*.png`.

**No** FPS, TTI, or accuracy-against-GPS figures are claimed.

---

## Limitations

See `10-future-scope-and-limitations.md`.

---

## Future scope

See same document. Items there are **not** implemented.

---

## Conclusion

RailGaadi demonstrates a complete student-scale BFF for live train visualisation with explicit data provenance and quota protection. It is suitable as a CSE minor project artefact when evaluated against the implemented SRS, tests, and source—not against commercial NTES feature parity.

---

## References

See `04-literature-survey.md`.
