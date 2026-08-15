# Deployment diagram

Single Node.js service as implied by `package.json` (`next start`). No container file in repo.

```mermaid
flowchart TB
  subgraph browser["User device"]
    B[Browser / optional PWA manifest]
  end

  subgraph host["Linux web host e.g. Render"]
    N["next start — 0.0.0.0 PORT"]
    MEM["Ephemeral memory cache rate-limit budget"]
    N --- MEM
  end

  subgraph managed["Third parties"]
    U[Upstash Redis REST]
    RR[api.railradar.in]
    OW[api.openweathermap.org]
    OT[portal.opentopography.org]
    OP[overpass-api.de]
    MT[api.maptiler.com]
    CA[basemaps.cartocdn.com]
  end

  B -->|HTTPS pages and /api| N
  B -->|tiles/styles| MT
  B --> CA
  N --> U
  N --> RR
  N --> OW
  N --> OT
  N --> OP
```

**CI (not runtime):** GitHub Actions `ubuntu-latest` runs install, `tsc`, lint, Vitest, `next build` without production RailRadar/Upstash secrets.
