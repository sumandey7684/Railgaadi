# Deployment and Configuration Guide

**Project:** RailGaadi  
**Application type:** Single Next.js 14 Node web process  
**Not in repository:** `Dockerfile`, `render.yaml`, Kubernetes manifests

---

## 1. Prerequisites

- Node.js **20** (CI) or a version supported by Next.js 14.2.x
- **pnpm** (CI uses pnpm **10**)
- Accounts/keys as needed: RailRadar, MapTiler, OpenWeather, OpenTopography, Upstash Redis

---

## 2. Environment variables

Copy `.env.example` to `.env.local` for development. Host dashboards for production. **Never commit `.env.local`.**

| Name | Client? | Required for | Default |
| --- | --- | --- | --- |
| `RAILRADAR_API_KEY` | No | Production live journeys | empty |
| `RAILRADAR_DAILY_BUDGET` | No | Cap outbound RailRadar units | `50` |
| `OPENWEATHER_API_KEY` | No | Live weather | empty → weather `fallback` |
| `OPENTOPOGRAPHY_API_KEY` | No | Live elevation | empty → synthetic profile |
| `NEXT_PUBLIC_MAPTILER_API_KEY` | Yes | MapTiler vector style | empty → CARTO raster |
| `OVERPASS_API_URL` | No | Overpass interpreter | `https://overpass-api.de/api/interpreter` |
| `UPSTASH_REDIS_REST_URL` | No | Shared cache/limits/budget | empty → memory |
| `UPSTASH_REDIS_REST_TOKEN` | No | With URL | empty → memory |
| `NODE_ENV` | set by Next | `production` disables synthetic journeys | |
| `PORT` | host | `next start` listen port | Next default 3000 |

`config/env.ts` also hard-codes `RAILRADAR_BASE_URL = 'https://api.railradar.in/v1'`.

---

## 3. Local development

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open `http://localhost:3000`. Without `RAILRADAR_API_KEY`, **development** may show a synthetic journey labelled `fallback`. **Production builds** return 503 instead.

Optional Redis check (does not print secrets):

```bash
node --env-file=.env.local scripts/verify-redis.mjs
```

Lists `rg:*` keys and TTLs for live cache / ratelimit keys.

---

## 4. Quality commands

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm test
pnpm build
pnpm start
```

`package.json` scripts: `dev`, `build`, `start`, `lint`, `test`, `test:watch`.

---

## 5. Production run

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

On hosts such as Render:

1. One **web service** per this app.
2. Bind **`0.0.0.0` and `$PORT`** (Next.js reads `PORT`).
3. Linux **case-sensitive** paths.
4. **Ephemeral disk:** memory cache, memory rate limit, and memory budget **reset on restart**. Configure Upstash for shared state.
5. Free web services that spin down drop in-memory state; Redis keys remain until TTL.

There is no first-party database to migrate.

---

## 6. CI

`.github/workflows/ci.yml`:

- Triggers: `push` to `main`, `pull_request`
- Concurrency group cancels in-progress runs on the same ref
- Steps: checkout, pnpm 10, Node 20 cache, `pnpm install --frozen-lockfile`, `tsc --noEmit`, `pnpm lint`, `pnpm test`, `pnpm build`
- Timeout: 20 minutes

---

## 7. Operational behaviour

| Topic | Production behaviour |
| --- | --- |
| No RailRadar key | Journey APIs 503 `unavailable` |
| Budget exhausted | 429 `QUOTA_EXCEEDED` — not a fake train |
| No Redis | Per-instance memory; multiple instances do not share budget |
| MapTiler missing | Dark CARTO tiles still render |
| Raising `RAILRADAR_DAILY_BUDGET` | Only raises the **app** cap; RailRadar may still 429 |

---

## 8. What this guide does not claim

- A live production URL is not recorded in the repository.
- Auto-scaling, blue/green, and CDN configuration are not in-repo.
- SSL termination is the host’s responsibility.
