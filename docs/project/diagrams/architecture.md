# Architecture diagram

Logical runtime of RailGaadi as implemented (Next.js 14, same-origin APIs, optional Redis).

```mermaid
flowchart TB
  subgraph client["Browser"]
    UI["Pages: / /train/id /share/id /favorites"]
    TQ["TanStack Query"]
    ZS["Zustand: journey / favorites / recents / theme"]
    MapLibre["MapLibre: MapTiler dataviz-dark or CARTO dark_all"]
    UI --> TQ
    UI --> ZS
    UI --> MapLibre
  end

  subgraph next["Next.js process"]
    MW["middleware.ts — 45 req / 60s / IP"]
    S["GET /api/search"]
    T["GET /api/train/id"]
    W["GET /api/weather"]
    R["GET /api/terrain"]
    A["GET /api/analytics/id"]
    L["loadCachedLiveJourney — 30s cache + inflight Map"]
    T --> L
    R --> L
    A --> L
  end

  subgraph store["Cache and counters"]
    Redis["Upstash Redis REST\nrg:cache:* rg:ratelimit:* rg:budget:railradar:YYYY-MM-DD"]
    Mem["Process memory fallback"]
  end

  subgraph providers["External HTTP"]
    RR["RailRadar v1 Bearer RAILRADAR_API_KEY"]
    OW["OpenWeather"]
    OT["OpenTopography SRTMGL3"]
    OP["Overpass / OSM"]
    MT["MapTiler tiles/styles"]
    CA["CARTO raster"]
  end

  TQ -->|"same origin"| MW
  MW --> S
  MW --> T
  MW --> W
  MW --> R
  MW --> A
  S --> Redis
  L --> Redis
  W --> Redis
  R --> Redis
  A --> Redis
  S --> Mem
  L --> Mem
  W --> Mem
  R --> Mem
  A --> Mem
  S -->|"budget 1 on live miss"| RR
  L -->|"budget 2 live+route"| RR
  W --> OW
  A --> OT
  R --> OP
  MapLibre --> MT
  MapLibre --> CA
```

Search hits Redis/memory only on the **live lookup** cache path (`search:live:*`), not for `TRAINS_DB` hits. Terrain and analytics also store their own TTLs (`terrain:*`, `analytics:*`) in addition to sharing `loadCachedLiveJourney`.
