# Test Plan and Test Report

**Project:** RailGaadi  
**Test runner:** Vitest 3.2.4 (`pnpm test` → `vitest run`)  
**Config:** `vitest.config.ts` — environment `node`, include `tests/**/*.test.ts`, alias `@` → repository root  
**CI:** `.github/workflows/ci.yml` job `verify`

This document reports **automated unit and API-contract tests**. It does not claim manual UAT scores, load-test RPS, or device lab results.

---

## 1. Test plan

### 1.1 Objectives

1. Guard train-id validation so malformed ids never consume RailRadar budget.
2. Lock JSON contracts (`success`, `dataSource`, HTTP status) for train and search routes.
3. Verify cache key prefix, TTL expiry (fake timers), Redis write-through mocks.
4. Verify rate limiter 45/60 s and per-IP isolation.
5. Verify UTC budget key, memory consume/deny, Redis overshoot refund (`DECRBY`).
6. Verify `normaliseLiveResponse` and `journey-state` view helpers.
7. Verify geo helpers (haversine range, interpolate, sample, bboxes).

### 1.2 Scope

**In scope:** files under `tests/`.  
**Out of scope:** browser E2E (Playwright/Cypress not in `package.json`), visual regression, live RailRadar integration tests (CI sets `RAILRADAR_API_KEY` empty).

### 1.3 Strategy

Mocks: `@/lib/redis`, `@/lib/cache`, `@/lib/journey-loader`, `@/lib/railradar.searchTrains`, `@/lib/trains-db` as needed. Memory implementations used when Redis is `null`.

### 1.4 Environment

Local and CI: Node 20 (CI), pnpm frozen lockfile. Tests must not require production secrets (`ci.yml`).

### 1.5 Pass criteria

All Vitest tests in the suite pass (`exit code 0`). Lint and `tsc --noEmit` are CI gates, not counted in the 46 Vitest cases.

---

## 2. Test inventory

| File | Tests (count) | Focus |
| --- | --- | --- |
| `tests/train-id.test.ts` | 4 | 4–5 digit accept/reject, whitespace, error string |
| `tests/journey-state.test.ts` | 7 | Halts, time views, delay labels, progress, map position |
| `tests/railradar-budget.test.ts` | 5 | UTC key, memory consume, deny overshoot, Redis refund |
| `tests/rate-limit.test.ts` | 4 | 45 then deny, IP isolation, Redis fail → memory, middleware 429 |
| `tests/geo.test.ts` | 6 | Haversine, length, interpolate, progress, sample, bboxes |
| `tests/journey-loader-budget.test.ts` | 3 | Quota without fake journey; invalid id no budget; cache hit no budget |
| `tests/cache.test.ts` | 5 | `rg:cache:live:12951`, memory get/set, TTL, Redis set |
| `tests/railradar-normalise.test.ts` | 6 | Live payload → `LiveJourney` fields |
| `tests/api-contracts.test.ts` | 6 | Train 200/400/404; search fallback/live/429 |

**Total: 9 files, 46 tests** (Vitest summary).

---

## 3. Representative cases (expected vs actual)

Expected behaviour is encoded as `expect(...)` in source. Actual result below is from a local `pnpm test` run used to write this report.

| ID | Case | Expected | Result |
| --- | --- | --- | --- |
| TC-01 | `parseTrainId('12951')` | `'12951'` | Pass |
| TC-02 | `parseTrainId('abc')` | `null` | Pass |
| TC-03 | Train API live mock | 200, `dataSource: live` | Pass |
| TC-04 | Train API invalid id | 400, `unavailable`, no `data` | Pass |
| TC-05 | Train API not found | 404, `unavailable` | Pass |
| TC-06 | Search local hit | `fallback`, `searchTrains` not called | Pass |
| TC-07 | Search numeric miss | `live` after `searchTrains` | Pass |
| TC-08 | Search quota | 429, `QUOTA_EXCEEDED` | Pass |
| TC-09 | `getLiveJourney` budget fail | `ok: false`, 429, no fabricated journey | Pass |
| TC-10 | `loadCachedLiveJourney('abc')` | 400, budget not consumed | Pass |
| TC-11 | Cache hit | budget not consumed | Pass |
| TC-12 | Rate limit 46th request | `ok: false`, `retryAfter > 0` | Pass |
| TC-13 | Budget memory 2+2 with limit 5 | used 4 remaining 1 | Pass |
| TC-14 | Memory cache TTL 10 s | null after 11 s fake time | Pass |
| TC-15 | Haversine Mumbai–Delhi | 1100–1500 km | Pass |

Full names live in the `describe`/`it` blocks of each file.

---

## 4. Test report (execution)

| Item | Value |
| --- | --- |
| Command | `pnpm test` |
| Vitest | v3.2.4 |
| Date of run (local) | 15 August 2026, 22:56 (machine clock); QA re-run 23:11 still 46/46 |
| Files | 9 passed |
| Tests | **46 passed / 46** |
| Duration | 2.30 s (first documented Vitest printout); 1.92 s (QA re-run) |
| Failures | None |

CI is configured to run the same `pnpm test` with:

```
RAILRADAR_API_KEY: ''
UPSTASH_REDIS_REST_URL: ''
UPSTASH_REDIS_REST_TOKEN: ''
RAILRADAR_DAILY_BUDGET: '50'
```

Build uses `NEXT_PUBLIC_MAPTILER_API_KEY: 'ci-placeholder'`.

This report does **not** paste GitHub Actions run URLs or claim a specific Actions job number; those appear on the repository Actions tab after each push.

---

## 5. Defects found in this run

None (suite green). Historical defects fixed in git (for example quota and search correctness in `5885f05`) are not re-opened here.

---

## 6. Residual risk

| Risk | Mitigation in tests | Remaining gap |
| --- | --- | --- |
| RailRadar schema drift | `normaliseLiveResponse` fixtures | No live network contract test |
| Redis production behaviour | mocked INCR/GET/SET | No Upstash integration test in CI |
| UI regressions | none | No E2E |
| MapTiler/CARTO | none | Visual only |
| Homepage numeric live-skip | documented, not a dedicated hook test | Behaviour is in `useTrainSearch.ts` |

---

## 7. Traceability to requirements

| SRS | Tests |
| --- | --- |
| FR-S2, FR-S3, FR-S4 | `api-contracts.test.ts` |
| FR-J2, FR-J3, FR-J4 | `api-contracts`, `journey-loader-budget` |
| CON-1 | `train-id.test.ts` |
| CON-3, CON-5, CON-6 | budget, cache, rate-limit tests |
| NFR-6 (quota honesty) | `returns QUOTA_EXCEEDED without fabricating a journey` |
