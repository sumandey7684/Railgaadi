# Software Requirements Specification (SRS)

**Document type:** Software Requirements Specification  
**Project:** RailGaadi  
**Basis:** Implemented behaviour in the repository (not a forward-looking wish list)

This SRS follows a simplified IEEE 830-style structure. Requirements are tagged **FR** (functional), **NFR** (non-functional), and **CON** (constraints). Priority **M** means implemented and required for the submitted system; **O** means optional configuration.

---

## 1. Introduction

### 1.1 Purpose

Specify what RailGaadi does as built, so examiners, developers, and testers share one contract.

### 1.2 Scope

Web application for searching trains and viewing a live (or labelled non-live) journey with map, timeline, weather, terrain, and analytics panels. No booking, no authenticated user accounts.

### 1.3 Definitions

| Term | Meaning in this project |
| --- | --- |
| `dataSource` | `live`, `cached`, `fallback`, or `unavailable` (`types/api.ts`) |
| `live` | Fresh provider response on this request |
| `cached` | Cache hit of a payload whose origin was live (not fallback) |
| `fallback` | Local catalogue, synthetic, or estimated content |
| `unavailable` | No usable payload |
| `LiveJourney` | Normalised journey object (`types/train.ts`) |
| `TRAINS_DB` | Static popular-train catalogue (`lib/trains-db.ts`) |
| Halt | Station with `isHalt === true` |
| Budget unit | One counted outbound RailRadar HTTP reservation (`tryConsumeRailRadarBudget`) |

### 1.4 References

See `04-literature-survey.md` and `.env.example`.

---

## 2. Overall description

### 2.1 Product perspective

Standalone Next.js 14 app. Depends on external HTTP APIs. Optional Upstash Redis. Browser storage for theme, favorites, and recent searches.

### 2.2 User classes

| Class | Description |
| --- | --- |
| Traveller | Uses search, journey, share URL, favorites; no login |
| Operator / student deployer | Sets environment variables; runs `pnpm` scripts |

There is no role-based access control in code.

### 2.3 Operating environment

- Development: `pnpm dev`, Node compatible with Next 14; CI uses Node 20 and pnpm 10.
- Production shape: `pnpm build` && `pnpm start`; bind `0.0.0.0:$PORT` on Linux hosts.
- Browsers: modern evergreen browsers implied by Next/React; not formally certified.

### 2.4 Constraints

| ID | Constraint |
| --- | --- |
| CON-1 | Train IDs for provider paths must match `/^\d{4,5}$/` (`lib/train-id.ts`). |
| CON-2 | Server secrets must not use `NEXT_PUBLIC_` prefix (`.env.example`). |
| CON-3 | Default `RAILRADAR_DAILY_BUDGET` is 50 (UTC day). |
| CON-4 | RailRadar HTTP abort timeout is 4 seconds (`rrFetch`). |
| CON-5 | Live journey cache TTL is 30 seconds. |
| CON-6 | API rate limit is 45 requests / 60 s / IP. |
| CON-7 | Production must not return `generateFallbackJourney` (`allowDevFallback` is `NODE_ENV !== 'production'`). |

### 2.5 Assumptions

- The user supplies valid provider keys for live behaviour.
- Redis, if configured, is reachable via REST.
- Map tiles require network access to MapTiler or CARTO CDNs.

---

## 3. Functional requirements

### 3.1 Search

| ID | Requirement |
| --- | --- |
| FR-S1 | Empty API query returns first 12 `TRAINS_DB` rows with `dataSource: fallback`. |
| FR-S2 | Local match (name or 4–5 digit number in catalogue) is returned as `fallback` without calling `searchTrains`. |
| FR-S3 | Local miss triggers RailRadar `/lookup/trains?q=` (budget 1), filter by number/name substring, cache 600 s. |
| FR-S4 | Live miss or provider failure with no local rows: empty list, `unavailable` (quota: HTTP 429). |
| FR-S5 | Home `useTrainSearch` uses local DB instantly; remote fetch only if query length ≥ 3, not 4–5 digits, and local length 0. |
| FR-S6 | Home debounce ~350 ms; ⌘/Ctrl+K; `/?search=1` opens search. |
| FR-S7 | Recent searches persist last 6 (`railgaadi-recent-searches`). |

### 3.2 Live journey

| ID | Requirement |
| --- | --- |
| FR-J1 | `GET /api/train/[id]` uses `loadCachedLiveJourney`. |
| FR-J2 | Invalid id → 400, `unavailable`, no RailRadar call. |
| FR-J3 | Cache hit → `cached` if origin was live; stays `fallback` if origin was fallback. |
| FR-J4 | Miss: consume budget **2**, fetch `/trains/{id}/live` and `/trains/{id}/route` in parallel; success → `live`. |
| FR-J5 | Normalise to `LiveJourney` (`normaliseLiveResponse`): halt statuses, time sources, position source, progress. Mapper status values: `running`, `not_started`, `completed`, `cancelled` (default `running`). |
| FR-J6 | Client `useLiveJourney` refetches every 30 s if `autoRefresh` is true; `staleTime` 10 s. |
| FR-J7 | Timeline shows passenger halts; times SCH/ACT/EXP; delay labels including `est.` when `delayEstimated`. |
| FR-J8 | Map: polyline, marker, follow-train, station select disables follow. |
| FR-J9 | Share page `/share/[id]` uses the same hook; Web Share or clipboard. |
| FR-J10 | Favorites persist (`railgaadi-favorites`); heart on journey page. |

### 3.3 Weather, terrain, analytics

| ID | Requirement |
| --- | --- |
| FR-W1 | `GET /api/weather?lat=&lng=` required; cache 900 s; OpenWeather or static sample (`fallback`). |
| FR-W2 | Weather panel fetches current, next, and destination stations. |
| FR-T1 | `GET /api/terrain?trainId=` loads journey then Overpass; cache 86400 s; Overpass error → three hardcoded POIs (`fallback`). |
| FR-A1 | `GET /api/analytics/[id]` elevation + delay history; cache 300 s; `dataSource` follows elevation, not RailRadar. |

### 3.4 Cross-cutting

| ID | Requirement |
| --- | --- |
| FR-X1 | Middleware matcher `/api/:path*` applies `rateLimit`. |
| FR-X2 | Theme `light`/`dark`, key `railgaadi-theme`, FOUC-prevention script. |
| FR-X3 | PWA `public/manifest.json` (standalone, shortcuts to search and favorites). |
| FR-X4 | `DataSourceBadge` labels: Live, Cached, Fallback / estimated, Unavailable. |

---

## 4. Non-functional requirements

| ID | Category | Requirement | Evidence |
| --- | --- | --- | --- |
| NFR-1 | Security | Server keys not in client bundle except MapTiler public key | `config/env.ts`, `.env.example` |
| NFR-2 | Security | Map popup strings escaped | `utils/html.ts` `escapeHtml` |
| NFR-3 | Reliability | Redis errors fall back to memory | `lib/cache.ts`, `rate-limit.ts`, `railradar-budget.ts` |
| NFR-4 | Reliability | 4 s RailRadar timeout | `rrFetch` |
| NFR-5 | Quota | Daily budget; search 1 unit, live 2 units | `lib/railradar.ts` |
| NFR-6 | Honesty | Production no synthetic journey | `allowDevFallback` |
| NFR-7 | Maintainability | TypeScript strict; Vitest; ESLint | `tsconfig.json`, `package.json` |
| NFR-8 | CI | tsc, lint, test, build without real secrets | `.github/workflows/ci.yml` |
| NFR-9 | Accessibility | `prefers-reduced-motion` / transparency reduce glass blur | `styles/globals.css` |
| NFR-10 | Portability | Case-sensitive paths; ephemeral FS | deployment notes |

**Not specified (do not claim):** numeric page-load SLAs, concurrent-user capacity, WCAG certification, 99.9% uptime.

---

## 5. External interface requirements

### 5.1 User interfaces

Pages: home search; `/train/[id]` tabs Live Map, Weather, Terrain & Analytics; `/share/[id]`; `/favorites`. Glass CSS tokens `glass-nav`, `glass-panel`, `glass-control`, `glass-subtle`.

### 5.2 Hardware interfaces

None beyond a networked computer or phone browser.

### 5.3 Software interfaces

| System | Interface |
| --- | --- |
| RailRadar | `Authorization: Bearer ${RAILRADAR_API_KEY}`, base `https://api.railradar.in/v1` |
| MapTiler | Style `https://api.maptiler.com/maps/dataviz-dark/style.json?key=` |
| CARTO | Raster `https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png` |
| OpenWeather | `api.openweathermap.org/data/2.5/weather` |
| OpenTopography | `portal.opentopography.org/API/globaldem?demtype=SRTMGL3` |
| Overpass | POST `OVERPASS_API_URL` (default overpass-api.de interpreter) |
| Upstash | REST via `@upstash/redis` |

### 5.4 Communication

HTTPS to providers. JSON `ApiResponse<T>` for app APIs.

---

## 6. Data requirements

No application SQL schema. Persistence:

| Store | Contents |
| --- | --- |
| Redis/memory | `rg:cache:*`, `rg:ratelimit:{ip}`, `rg:budget:railradar:YYYY-MM-DD` |
| `localStorage` | theme, favorites, recents |
| `TRAINS_DB` | compile-time catalogue |

`LiveJourney` and `Station` fields: `types/train.ts` (position `gps | station | interpolated | fallback`; times `actual | expected | scheduled | unknown`; speed `live | average | unknown`; progress `gps | station | estimated`).

---

## 7. Requirement traceability (modules)

| Requirement group | Primary files |
| --- | --- |
| Search | `app/api/search/route.ts`, `hooks/useTrainSearch.ts`, `lib/trains-db.ts` |
| Journey | `lib/railradar.ts`, `lib/journey-loader.ts`, `app/api/train/[id]/route.ts` |
| Timeline/map | `lib/journey-state.ts`, `components/journey/Timeline.tsx`, `features/maps/MapView.tsx` |
| Quota | `lib/railradar-budget.ts`, `middleware.ts` |
| Tests | `tests/*.test.ts` |

---

## 8. Future requirements (not in this SRS as committed)

Listed only in `10-future-scope-and-limitations.md`. They are **not** current FR items.
